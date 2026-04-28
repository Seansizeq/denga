import express from 'express';
import cors from 'cors';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import PImage from 'pureimage';
import { getDatabasePath, initDb } from './db.js';
import { startScheduledDatabaseBackups } from './backup.js';
import { existsSync } from 'fs';
import path from 'path';
import { PassThrough } from 'stream';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = botToken ? new TelegramBot(botToken, { polling: true }) : null;
const DEV_AUTH_BYPASS = process.env.ALLOW_DEV_AUTH_BYPASS === '1';
const AUTH_HEADER_NAME = 'x-telegram-init-data';

const parseTelegramInitData = (initDataRaw) => {
  if (typeof initDataRaw !== 'string' || !initDataRaw.trim()) return null;
  const initData = initDataRaw.trim();
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  const dataCheckString = [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken ?? '').digest();
  const computedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (computedHash !== hash) return null;
  const userRaw = params.get('user');
  if (!userRaw) return null;
  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return null;
  }
  const userId = user && user.id ? String(user.id).trim() : '';
  if (!userId) return null;
  return { userId };
};

const authMiddleware = (req, res, next) => {
  if (DEV_AUTH_BYPASS) {
    req.authUserId = process.env.DEV_AUTH_USER_ID || 'dev-user';
    next();
    return;
  }
  const initData = req.get(AUTH_HEADER_NAME);
  const parsed = parseTelegramInitData(initData);
  if (!parsed) {
    res.status(401).json({ error: 'Unauthorized', code: 'AUTH_INVALID_TELEGRAM_INIT_DATA' });
    return;
  }
  req.authUserId = parsed.userId;
  next();
};

const parseAmount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};
const normalizeCurrency = (value) => {
  const code = String(value ?? '').toUpperCase();
  if (code === 'PLN' || code === 'USD' || code === 'UAH') return code;
  return 'UAH';
};
const getAccountSlugFromNote = (note) => {
  if (typeof note !== 'string' || !note.trim()) return null;
  const m = note.match(/\bAccount:\s*([a-z0-9_]{1,48})\b/i);
  if (!m?.[1]) return null;
  return m[1].toLowerCase();
};
const mergeAccountIntoNote = (note, accountKey) => {
  const key = String(accountKey ?? '').trim().toLowerCase();
  const raw = typeof note === 'string' ? note : '';
  const withoutAccount = raw
    .replace(/\bAccount:\s*[a-z0-9_]{1,48}\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!key) return withoutAccount;
  return `${withoutAccount ? `${withoutAccount} ` : ''}Account: ${key}`.trim();
};
const resolveBalanceCorrectionCategoryId = async (dbConn, userId, type) => {
  const normalizedCandidates = [
    normalizeCategoryName('Balance correction'),
    normalizeCategoryName('Корекція балансу'),
  ];
  const custom = await dbConn.get(
    `SELECT id
     FROM custom_categories
     WHERE user_id = ? AND normalized_name IN (?, ?)
     ORDER BY updatedAt DESC
     LIMIT 1`,
    [userId, normalizedCandidates[0], normalizedCandidates[1]]
  );
  if (custom?.id) return custom.id;
  return type === 'income' ? 'other_income' : 'other_expense';
};
const getCurrencyFromNote = (note) => {
  if (typeof note !== 'string') return null;
  const m = note.match(/\bCurrency:\s*([A-Za-z]{3})\b/i);
  return m?.[1] ? normalizeCurrency(m[1]) : null;
};
const accountDeltaForTx = (tx) => {
  const amount = Number(tx?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return tx?.type === 'income' ? amount : -amount;
};
const applyAccountDelta = async (dbConn, userId, accountKey, delta) => {
  if (!accountKey || !Number.isFinite(delta) || delta === 0) return;
  await dbConn.run(
    'UPDATE account_portfolio SET primary_amount = primary_amount + ?, updatedAt = ? WHERE user_id = ? AND account_key = ?',
    [delta, new Date().toISOString(), userId, accountKey]
  );
};
const toIsoDate = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};
const parseIsoDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (toIsoDate(d) !== value) return null;
  return d;
};
const addMonthsClamped = (date, months) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const first = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first;
};
const addSubscriptionCycle = (date, cycle) => (cycle === 'yearly' ? addMonthsClamped(date, 12) : addMonthsClamped(date, 1));
const FX_CACHE_TTL_MS = 10 * 60 * 1000;
const FX_FALLBACK = {
  base: 'USD',
  rates: { USD: 1, PLN: 3.95, UAH: 39.0 },
  updatedAt: new Date(0).toISOString(),
  source: 'fallback',
};
let fxCache = null;
let fxCacheFetchedAt = 0;
const CRYPTO_CACHE_TTL_MS = 2 * 60 * 1000;
let cryptoCache = null;
let cryptoCacheFetchedAt = 0;
const fetchFxRates = async () => {
  const now = Date.now();
  if (fxCache && now - fxCacheFetchedAt < FX_CACHE_TTL_MS) {
    return { ...fxCache, source: 'cache' };
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error(`fx status ${res.status}`);
    const data = await res.json();
    const rates = {
      USD: Number(data?.rates?.USD ?? 1),
      PLN: Number(data?.rates?.PLN ?? NaN),
      UAH: Number(data?.rates?.UAH ?? NaN),
    };
    if (!Number.isFinite(rates.PLN) || rates.PLN <= 0 || !Number.isFinite(rates.UAH) || rates.UAH <= 0) {
      throw new Error('invalid fx payload');
    }
    fxCache = {
      base: 'USD',
      rates,
      updatedAt: new Date().toISOString(),
      source: 'live',
    };
    fxCacheFetchedAt = now;
    return fxCache;
  } catch {
    if (fxCache) return { ...fxCache, source: 'cache' };
    return FX_FALLBACK;
  }
};
const fetchCryptoUsdPrices = async () => {
  const now = Date.now();
  if (cryptoCache && now - cryptoCacheFetchedAt < CRYPTO_CACHE_TTL_MS) {
    return { ...cryptoCache, source: 'cache' };
  }
  try {
    const ids = ['bitcoin', 'ethereum', 'solana', 'the-open-network', 'tether'];
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
      { headers: { accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`crypto status ${res.status}`);
    const data = await res.json();
    const prices = {
      BTC: Number(data?.bitcoin?.usd ?? NaN),
      ETH: Number(data?.ethereum?.usd ?? NaN),
      SOL: Number(data?.solana?.usd ?? NaN),
      TON: Number(data?.['the-open-network']?.usd ?? NaN),
      USDT: Number(data?.tether?.usd ?? NaN),
    };
    const allValid = Object.values(prices).every((n) => Number.isFinite(n) && n > 0);
    if (!allValid) throw new Error('invalid crypto payload');
    cryptoCache = {
      prices,
      updatedAt: new Date().toISOString(),
      source: 'live',
    };
    cryptoCacheFetchedAt = now;
    return cryptoCache;
  } catch {
    if (cryptoCache) return { ...cryptoCache, source: 'cache' };
    return {
      prices: { BTC: 0, ETH: 0, SOL: 0, TON: 0, USDT: 1 },
      updatedAt: new Date(0).toISOString(),
      source: 'fallback',
    };
  }
};
const buildSubscriptionChargeNote = (subscription) => {
  const base = typeof subscription.note === 'string' ? subscription.note.trim() : '';
  const suffix = `Subscription: ${subscription.name}`;
  if (!base) return suffix;
  if (base.toLowerCase().includes('subscription:')) return base;
  return `${base} • ${suffix}`;
};
const runSubscriptionAutopayForUser = async (userId) => {
  const today = new Date();
  const todayIso = toIsoDate(today);
  if (!todayIso) return;

  const dueSubs = await db.all(
    `SELECT id, name, amount, cycle, nextChargeDate, note
     FROM subscriptions
     WHERE user_id = ? AND active = 1 AND nextChargeDate <= ?
     ORDER BY nextChargeDate ASC`,
    [userId, todayIso]
  );
  if (!Array.isArray(dueSubs) || dueSubs.length === 0) return;

  await db.run('BEGIN IMMEDIATE');
  try {
    for (const sub of dueSubs) {
      const amount = Number(sub.amount);
      const cycle = sub.cycle === 'yearly' ? 'yearly' : 'monthly';
      let due = parseIsoDate(String(sub.nextChargeDate ?? ''));
      if (!due || !Number.isFinite(amount) || amount <= 0) continue;

      let nextDue = due;
      let safetyCounter = 0;
      while (toIsoDate(nextDue) <= todayIso) {
        const txDate = `${toIsoDate(nextDue)}T12:00:00.000Z`;
        const note = buildSubscriptionChargeNote(sub);
        const tx = {
          id: uuidv4(),
          user_id: userId,
          amount,
          currency: 'UAH',
          categoryId: 'other_expense',
          type: 'expense',
          date: txDate,
          note: note || undefined,
        };
        await db.run(
          'INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [tx.id, tx.user_id, tx.amount, tx.currency, tx.categoryId, tx.type, tx.date, tx.note ?? null]
        );
        await applyAccountDelta(db, userId, getAccountSlugFromNote(tx.note), accountDeltaForTx(tx));
        nextDue = addSubscriptionCycle(nextDue, cycle);
        safetyCounter += 1;
        if (safetyCounter > 120) break;
      }

      await db.run(
        'UPDATE subscriptions SET nextChargeDate = ?, updatedAt = ? WHERE user_id = ? AND id = ?',
        [toIsoDate(nextDue), new Date().toISOString(), userId, sub.id]
      );
    }
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
};
const plannerDayKey = (userId, day) => `${userId}:${day}`;
const plannerDayFromStored = (userId, storedDay) => {
  const prefix = `${userId}:`;
  return String(storedDay).startsWith(prefix) ? String(storedDay).slice(prefix.length) : String(storedDay);
};
const scopedTemplateKey = (userId, normalizedKey) => `${userId}::${normalizedKey}`;
const DEFAULT_BOT_TIMEZONE = (() => {
  const configured = String(process.env.BOT_DEFAULT_TIMEZONE || '').trim();
  if (configured) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: configured }).format(new Date());
      return configured;
    } catch {
      // ignore invalid timezone in env
    }
  }
  return 'Europe/Warsaw';
})();
const normalizeTimeZone = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_BOT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return DEFAULT_BOT_TIMEZONE;
  }
};
const formatLocalWeekday = (iso, timeZone = DEFAULT_BOT_TIMEZONE) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: normalizeTimeZone(timeZone), weekday: 'short' }).format(d).toLowerCase();
};
const shiftIsoDay = (day, deltaDays) => {
  const d = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return day;
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
};
const getWeekDaySet = (todayDay) => {
  const set = new Set();
  for (let i = 0; i < 7; i += 1) {
    set.add(shiftIsoDay(todayDay, -i));
  }
  return set;
};
const getMonthDaySet = (todayDay) => {
  const [y, m] = String(todayDay).split('-');
  if (!y || !m) return new Set([todayDay]);
  const firstDay = `${y}-${m}-01`;
  const set = new Set();
  let cur = firstDay;
  while (cur <= todayDay) {
    set.add(cur);
    cur = shiftIsoDay(cur, 1);
  }
  return set;
};
const formatDatePartsForZone = (iso, timeZone = DEFAULT_BOT_TIMEZONE) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  if (!map.year || !map.month || !map.day || !map.hour || !map.minute) return null;
  return {
    day: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}`,
  };
};
const parseTimeFromIso = (iso, timeZone = DEFAULT_BOT_TIMEZONE) => {
  const parts = formatDatePartsForZone(iso, timeZone);
  return parts?.time ?? '';
};
const dayFromIsoInZone = (iso, timeZone = DEFAULT_BOT_TIMEZONE) => {
  const parts = formatDatePartsForZone(iso, timeZone);
  return parts?.day ?? '';
};
const buildBotShiftNote = (startIso, endIso, timeZone = DEFAULT_BOT_TIMEZONE) => {
  const start = parseTimeFromIso(startIso, timeZone);
  const end = parseTimeFromIso(endIso, timeZone);
  if (start && end) return `Зміна через бота ${start}-${end}`;
  if (start) return `Зміна через бота ${start}`;
  return 'Зміна через бота';
};
const upsertBotUser = async (dbConn, telegramId, chatId) => {
  await dbConn.run(
    `INSERT INTO users (telegram_id, chat_id)
     VALUES (?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET
       chat_id = excluded.chat_id`,
    [telegramId, chatId]
  );
};
const ensureReportSettings = async (dbConn, userId) => {
  const now = new Date().toISOString();
  await dbConn.run(
    `INSERT INTO bot_report_settings (user_id, auto_weekly, auto_monthly, report_currency, send_time, updated_at)
     VALUES (?, 1, 1, 'UAH', '21:00', ?)
     ON CONFLICT(user_id) DO NOTHING`,
    [userId, now]
  );
};
const getReportSettings = async (dbConn, userId) => {
  await ensureReportSettings(dbConn, userId);
  const row = await dbConn.get(
    'SELECT auto_weekly, auto_monthly, report_currency, send_time FROM bot_report_settings WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return {
    autoWeekly: Boolean(Number(row?.auto_weekly ?? 1)),
    autoMonthly: Boolean(Number(row?.auto_monthly ?? 1)),
    reportCurrency: normalizeCurrency(row?.report_currency),
    sendTime: /^\d{2}:\d{2}$/.test(String(row?.send_time ?? '')) ? String(row.send_time) : '21:00',
  };
};
const parseOnOff = (raw) => {
  const v = String(raw || '').trim().toLowerCase();
  if (['on', '1', 'true', 'yes', 'y', 'увімк', 'вкл'].includes(v)) return true;
  if (['off', '0', 'false', 'no', 'n', 'вимк', 'выкл'].includes(v)) return false;
  return null;
};
const parseSendTime = (raw) => {
  const m = String(raw || '').trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
};
const updateReportSettings = async (dbConn, userId, patch) => {
  await ensureReportSettings(dbConn, userId);
  const current = await getReportSettings(dbConn, userId);
  const autoWeekly = patch.autoWeekly === undefined ? current.autoWeekly : Boolean(patch.autoWeekly);
  const autoMonthly = patch.autoMonthly === undefined ? current.autoMonthly : Boolean(patch.autoMonthly);
  const reportCurrency = patch.reportCurrency === undefined ? current.reportCurrency : normalizeCurrency(patch.reportCurrency);
  const sendTime = patch.sendTime ?? current.sendTime;
  await dbConn.run(
    `UPDATE bot_report_settings
     SET auto_weekly = ?, auto_monthly = ?, report_currency = ?, send_time = ?, updated_at = ?
     WHERE user_id = ?`,
    [autoWeekly ? 1 : 0, autoMonthly ? 1 : 0, reportCurrency, sendTime, new Date().toISOString(), userId]
  );
  return { autoWeekly, autoMonthly, reportCurrency, sendTime };
};
const reminderKinds = new Set(['daily', 'subscriptions']);
const isValidReminderKind = (value) => reminderKinds.has(String(value || ''));
const ensureDefaultReminders = async (dbConn, userId) => {
  const now = new Date().toISOString();
  const rows = await dbConn.all('SELECT kind FROM user_reminders WHERE user_id = ?', [userId]);
  const kinds = new Set((rows || []).map((r) => String(r.kind)));
  if (!kinds.has('daily')) {
    await dbConn.run(
      `INSERT INTO user_reminders (id, user_id, kind, title, enabled, time_hhmm, lead_days, created_at, updated_at)
       VALUES (?, ?, 'daily', 'Внести витрати', 1, '21:00', 0, ?, ?)`,
      [uuidv4(), userId, now, now]
    );
  }
  if (!kinds.has('subscriptions')) {
    await dbConn.run(
      `INSERT INTO user_reminders (id, user_id, kind, title, enabled, time_hhmm, lead_days, created_at, updated_at)
       VALUES (?, ?, 'subscriptions', 'Нагадування про підписки', 1, '10:00', 1, ?, ?)`,
      [uuidv4(), userId, now, now]
    );
  }
};
const listReminders = async (dbConn, userId) => {
  await ensureDefaultReminders(dbConn, userId);
  const rows = await dbConn.all(
    `SELECT id, kind, title, enabled, time_hhmm AS timeHHMM, lead_days AS leadDays, created_at AS createdAt, updated_at AS updatedAt
     FROM user_reminders
     WHERE user_id = ?
     ORDER BY created_at ASC`,
    [userId]
  );
  return (rows || []).map((r) => ({
    ...r,
    enabled: Boolean(Number(r.enabled)),
    leadDays: Number(r.leadDays) || 0,
  }));
};
const markReminderDelivery = async (dbConn, userId, reminderId, slotKey) => {
  try {
    await dbConn.run(
      `INSERT INTO reminder_deliveries (user_id, reminder_id, slot_key, created_at)
       VALUES (?, ?, ?, ?)`,
      [userId, reminderId, slotKey, new Date().toISOString()]
    );
    return true;
  } catch {
    return false;
  }
};
const sendReminderMessage = async (dbConn, userId, reminder, timeZone, chatId) => {
  if (!bot) return;
  const nowIso = new Date().toISOString();
  if (reminder.kind === 'daily') {
    await bot.sendMessage(chatId, `⏰ Нагадування: ${String(reminder.title || 'Внести витрати')}`);
    return;
  }
  const tz = normalizeTimeZone(timeZone);
  const today = dayFromIsoInZone(nowIso, tz) || nowIso.slice(0, 10);
  const target = shiftIsoDay(today, Number(reminder.leadDays || 0));
  const due = await dbConn.all(
    `SELECT name, amount, nextChargeDate
     FROM subscriptions
     WHERE user_id = ? AND active = 1 AND nextChargeDate = ?
     ORDER BY nextChargeDate ASC`,
    [userId, target]
  );
  if (!Array.isArray(due) || due.length === 0) return;
  const lines = [`🔔 ${String(reminder.title || 'Нагадування про підписки')} (${target})`];
  due.slice(0, 10).forEach((sub, idx) => {
    lines.push(`${idx + 1}. ${sub.name} — ${Number(sub.amount || 0).toLocaleString('uk-UA', { maximumFractionDigits: 2 })}`);
  });
  await bot.sendMessage(chatId, lines.join('\n'));
};
const shouldSendForSlot = async (dbConn, userId, reportType, slotKey) => {
  try {
    await dbConn.run(
      `INSERT INTO bot_report_deliveries (user_id, report_type, slot_key, created_at)
       VALUES (?, ?, ?, ?)`,
      [userId, reportType, slotKey, new Date().toISOString()]
    );
    return true;
  } catch {
    return false;
  }
};
const summarizeTransactions = (txs) => {
  let income = 0;
  let expense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  const byCategory = new Map();
  for (const tx of txs) {
    const amount = Number(tx.amount) || 0;
    if (tx.type === 'income') {
      income += amount;
      incomeCount += 1;
    } else {
      expense += amount;
      expenseCount += 1;
    }
    const current = byCategory.get(tx.categoryId) ?? { income: 0, expense: 0 };
    if (tx.type === 'income') current.income += amount;
    else current.expense += amount;
    byCategory.set(tx.categoryId, current);
  }
  const topExpenses = Array.from(byCategory.entries())
    .map(([categoryId, v]) => ({ categoryId, amount: v.expense }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  const topIncome = Array.from(byCategory.entries())
    .map(([categoryId, v]) => ({ categoryId, amount: v.income }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  return { income, expense, net: income - expense, incomeCount, expenseCount, topExpenses, topIncome };
};
const buildPreviousPeriodDaySet = (reportType, currentSet) => {
  const sorted = Array.from(currentSet || []).sort();
  if (!sorted.length) return new Set();
  if (reportType === 'weekly') {
    return new Set(sorted.map((day) => shiftIsoDay(day, -7)));
  }
  const firstDay = sorted[0];
  const [yRaw, mRaw] = String(firstDay).split('-');
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return new Set();
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const pad = (n) => String(n).padStart(2, '0');
  const dayCount = sorted.length;
  const set = new Set();
  for (let i = 1; i <= dayCount; i += 1) {
    set.add(`${prevYear}-${pad(prevMonth)}-${pad(i)}`);
  }
  return set;
};
const buildReportComparison = (currentSummary, previousSummary) => ({
  incomeDelta: Number(currentSummary?.income || 0) - Number(previousSummary?.income || 0),
  expenseDelta: Number(currentSummary?.expense || 0) - Number(previousSummary?.expense || 0),
  netDelta: Number(currentSummary?.net || 0) - Number(previousSummary?.net || 0),
});
const formatComparisonChange = (delta, { positive, negative, neutral = 'без змін' }) => {
  const value = Number(delta) || 0;
  if (value === 0) return neutral;
  const amount = Math.abs(value).toLocaleString('uk-UA', { maximumFractionDigits: 2 });
  return value > 0 ? `${positive} на ${amount} UAH` : `${negative} на ${amount} UAH`;
};
const categoryNameById = (id) => {
  const base = CATEGORIES.find((c) => c.id === id)?.name;
  return base || String(id);
};
const CATEGORY_EMOJI = {
  food: '🍕',
  transport: '🚗',
  home: '🏠',
  entertainment: '🎮',
  health: '💊',
  salary: '💼',
  other_income: '💸',
  other_expense: '💊',
};
const formatDayMonth = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return String(iso || '');
  const [, m, d] = String(iso).split('-');
  return `${d}.${m}`;
};
const formatWeekdayUk = (iso) => {
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return '—';
  const raw = new Intl.DateTimeFormat('uk-UA', { weekday: 'long' }).format(d);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};
const formatMonthHeaderUk = (isoDay) => {
  const d = new Date(`${isoDay}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return 'МІСЯЦЬ';
  const month = new Intl.DateTimeFormat('uk-UA', { month: 'long' }).format(d).toUpperCase();
  const year = new Intl.DateTimeFormat('uk-UA', { year: 'numeric' }).format(d);
  return `${month} ${year}`;
};
const percentChange = (current, previous) => {
  const prev = Number(previous) || 0;
  const cur = Number(current) || 0;
  if (prev === 0) return cur === 0 ? 0 : 100;
  return ((cur - prev) / Math.abs(prev)) * 100;
};
const currencySymbol = (code) => {
  const normalized = normalizeCurrency(code);
  if (normalized === 'PLN') return 'zł';
  if (normalized === 'USD') return '$';
  return '₴';
};
const detectPrimaryCurrency = (txs) => {
  const counters = { UAH: 0, PLN: 0, USD: 0 };
  for (const tx of txs || []) {
    const cur = normalizeCurrency(tx?.currency);
    counters[cur] = (counters[cur] || 0) + 1;
  }
  return Object.entries(counters).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] || 'UAH';
};
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
let reportFontReady = false;
let reportFontAvailable = false;
let reportFontRegular = 'sans-serif';
let reportFontBold = 'sans-serif';
const ensureReportFont = () => {
  if (reportFontReady) return;
  const candidates = [
    {
      regular: path.resolve(__dirname, '../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
      bold: path.resolve(__dirname, '../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
    },
    {
      regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    },
    {
      regular: '/usr/share/fonts/dejavu/DejaVuSans.ttf',
      bold: '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    },
    {
      regular: 'C:/Windows/Fonts/arial.ttf',
      bold: 'C:/Windows/Fonts/arialbd.ttf',
    },
  ];
  for (const pair of candidates) {
    try {
      if (!existsSync(pair.regular)) continue;
      const regular = PImage.registerFont(pair.regular, 'DengaSansRegular');
      regular.loadSync();
      let boldLoaded = false;
      if (pair.bold && existsSync(pair.bold)) {
        const bold = PImage.registerFont(pair.bold, 'DengaSansBold');
        bold.loadSync();
        boldLoaded = true;
      }
      reportFontReady = true;
      reportFontAvailable = true;
      reportFontRegular = 'DengaSansRegular';
      reportFontBold = boldLoaded ? 'DengaSansBold' : 'DengaSansRegular';
      return;
    } catch {
      // try next
    }
  }
  reportFontReady = true;
  reportFontAvailable = false;
};
const encodePngBuffer = async (img) => {
  const out = new PassThrough();
  const chunks = [];
  out.on('data', (c) => chunks.push(Buffer.from(c)));
  await PImage.encodePNGToStream(img, out);
  return Buffer.concat(chunks);
};
const renderReportCardPng = async (reportType, periodLabel, summary, comparison) => {
  ensureReportFont();
  if (!reportFontAvailable) {
    throw new Error('report font not available');
  }
  const width = 1280;
  const height = 1700;
  const img = PImage.make(width, height);
  const ctx = img.getContext('2d');
  
  const colors = {
    bg: '#0f0f12',
    card: '#16141d',
    accent: '#ffb020',
    income: '#4ADE80',
    expense: '#F87171',
    text: '#F2F2F5',
    sub: '#A5A5B0',
    border: '#2C2835',
    blockBg: '#1D1A25'
  };
  
  const drawRoundedRect = (x, y, w, h, r, fill, stroke) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  };

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = 2;
  drawRoundedRect(48, 48, width - 96, height - 96, 48, colors.card, colors.border);
  
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(48, 48, width - 96, height - 96, 48);
  ctx.clip();
  ctx.fillStyle = colors.accent;
  ctx.fillRect(48, 48, width - 96, 16);
  ctx.restore();

  const regularFont = reportFontAvailable ? reportFontRegular : 'sans-serif';
  const boldFont = reportFontAvailable ? reportFontBold : regularFont;
  const setFont = (size, weight = 500) => {
    const family = weight >= 700 ? boldFont : regularFont;
    ctx.font = `${size}pt ${family}`;
  };
  ctx.textBaseline = 'alphabetic';
  
  const incomeTrendText = formatComparisonChange(comparison.incomeDelta, { positive: 'більше', negative: 'менше' });
  const expenseTrendText = formatComparisonChange(comparison.expenseDelta, { positive: 'більше', negative: 'менше' });
  const comparisonLabel = reportType === 'weekly' ? 'Попереднього тижня' : 'Попереднього місяця';

  ctx.fillStyle = colors.text;
  setFont(64, 700);
  ctx.fillText(reportType === 'weekly' ? 'Тижневий звіт' : 'Місячний звіт', 100, 180);
  
  ctx.fillStyle = colors.sub;
  setFont(32, 400);
  ctx.fillText(periodLabel, 100, 240);

  const block = (x, y, w, h, title) => {
    drawRoundedRect(x, y, w, h, 32, colors.blockBg, colors.border);
    ctx.fillStyle = colors.sub;
    setFont(24, 700);
    ctx.fillText(title.toUpperCase(), x + 40, y + 56);
  };

  block(100, 300, width - 200, 350, 'Підсумки');
  
  ctx.fillStyle = colors.text;
  setFont(40, 500);
  ctx.fillText(`Дохід:`, 140, 420);
  ctx.fillStyle = colors.income;
  ctx.fillText(`+${Math.abs(summary.income).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} UAH`, 550, 420);
  
  ctx.fillStyle = colors.text;
  ctx.fillText(`Витрати:`, 140, 500);
  ctx.fillStyle = colors.expense;
  ctx.fillText(`-${Math.abs(summary.expense).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} UAH`, 550, 500);
  
  ctx.fillStyle = colors.text;
  ctx.fillText(`Результат:`, 140, 580);
  ctx.fillStyle = summary.net >= 0 ? colors.income : colors.expense;
  ctx.fillText(
    `${summary.net >= 0 ? '+' : '-'}${Math.abs(summary.net).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} UAH`,
    550,
    580
  );
  
  ctx.fillStyle = colors.sub;
  setFont(28, 500);
  ctx.fillText(`Операцій: ${summary.incomeCount + summary.expenseCount}`, 140, 635);

  block(100, 690, width - 200, 300, 'Порівняння');
  ctx.fillStyle = colors.sub;
  setFont(26, 400);
  ctx.fillText(`До ${comparisonLabel}:`, 140, 780);
  ctx.fillStyle = colors.text;
  setFont(30, 500);
  ctx.fillText('Дохід', 140, 845);
  ctx.fillStyle = comparison.incomeDelta >= 0 ? colors.income : colors.expense;
  ctx.fillText(incomeTrendText, 450, 845);
  ctx.fillStyle = colors.text;
  ctx.fillText('Витрати', 140, 905);
  ctx.fillStyle = comparison.expenseDelta <= 0 ? colors.income : colors.expense;
  ctx.fillText(expenseTrendText, 450, 905);

  block(100, 1030, width - 200, 300, 'Топ витрат');
  (summary.topExpenses || []).slice(0, 5).forEach((item, idx) => {
    ctx.fillStyle = colors.text;
    setFont(36, 500);
    ctx.fillText(`${idx + 1}. ${String(categoryNameById(item.categoryId)).slice(0, 24)}`, 140, 1140 + idx * 58);
    
    ctx.fillStyle = colors.expense;
    ctx.fillText(`${Math.abs(item.amount).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} UAH`, 850, 1140 + idx * 58);
  });

  block(100, 1360, width - 200, 300, 'Топ доходів');
  (summary.topIncome || []).slice(0, 5).forEach((item, idx) => {
    ctx.fillStyle = colors.text;
    setFont(36, 500);
    ctx.fillText(`${idx + 1}. ${String(categoryNameById(item.categoryId)).slice(0, 24)}`, 140, 1470 + idx * 58);
    
    ctx.fillStyle = colors.income;
    ctx.fillText(`${Math.abs(item.amount).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} UAH`, 850, 1470 + idx * 58);
  });

  return encodePngBuffer(img);
};
const buildReportText = (reportType, periodLabel, txs, comparison, extra = {}) => {
  const summary = summarizeTransactions(txs);
  const reportCurrencyCode = normalizeCurrency(extra.reportCurrency || 'UAH');
  const sign = currencySymbol(reportCurrencyCode);
  const formatAmount = (value, withSign = false) => {
    const sign = withSign ? (value >= 0 ? '+' : '-') : '';
    return `${sign}${Math.abs(value).toLocaleString('uk-UA', { maximumFractionDigits: 2 })}`;
  };
  if (reportType === 'weekly') {
    const expenseByCategory = new Map();
    const dayNet = new Map();
    let maxExpense = null;
    for (const tx of txs || []) {
      const amount = Math.max(0, Number(tx.amount) || 0);
      const day = dayFromIsoInZone(tx.date, DEFAULT_BOT_TIMEZONE) || String(tx.date || '').slice(0, 10);
      const curNet = dayNet.get(day) ?? 0;
      dayNet.set(day, tx.type === 'income' ? curNet + amount : curNet - amount);
      if (tx.type !== 'expense') continue;
      expenseByCategory.set(tx.categoryId, (expenseByCategory.get(tx.categoryId) ?? 0) + amount);
      if (!maxExpense || amount > maxExpense.amount) maxExpense = { categoryId: tx.categoryId, amount };
    }
    const topExpenseCategories = Array.from(expenseByCategory.entries())
      .map(([categoryId, amount]) => ({ categoryId, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    const bestDayEntry = Array.from(dayNet.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
    const workedHours = Math.max(0, Number(extra.workedHours) || 0);
    const lines = [
      '📊 *ФІНАНСОВИЙ ЗВІТ*',
      '━━━━━━━━━━━━━━━━━━━━',
      `📅 Період: ${periodLabel}`,
      '',
      '💰 *ФІНАНСИ*',
      `├ Дохід: *+${formatAmount(summary.income)} ${sign}*`,
      `├ Витрати: *-${formatAmount(summary.expense)} ${sign}*`,
      `└ Баланс: \`${formatAmount(summary.net, true)} ${sign}\``,
      '',
      '📈 *Категорії витрат:*',
    ];
    if (topExpenseCategories.length > 0) {
      for (const item of topExpenseCategories) {
        lines.push(`${CATEGORY_EMOJI[item.categoryId] ?? '•'} ${categoryNameById(item.categoryId)}: ${formatAmount(item.amount)} ${sign}`);
      }
    } else {
      lines.push('• Немає витрат за період');
    }
    lines.push('');
    lines.push('⏰ *РОБОЧИЙ ЧАС*');
    lines.push(`├ Відпрацьовано: *${workedHours.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} год*`);
    lines.push('└ Деталі — у вебапі');
    return lines.join('\n');
  }
  if (reportType === 'monthly') {
    const expenseByCategory = new Map();
    for (const tx of txs || []) {
      if (tx.type !== 'expense') continue;
      const amount = Math.max(0, Number(tx.amount) || 0);
      expenseByCategory.set(tx.categoryId, (expenseByCategory.get(tx.categoryId) ?? 0) + amount);
    }
    const topExpenseCategories = Array.from(expenseByCategory.entries())
      .map(([categoryId, amount]) => ({ categoryId, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    const totalExpense = Math.max(0, Number(summary.expense) || 0);
    const workedHours = Math.max(0, Number(extra.workedHours) || 0);
    const workingDays = Math.max(0, Number(extra.workingDays) || 0);
    const avgPerDay = Math.max(0, Number(extra.avgPerDay) || 0);
    const incomePct = percentChange(summary.income, Number(extra.previousIncome) || 0);
    const expensePct = percentChange(summary.expense, Number(extra.previousExpense) || 0);
    const netPct = percentChange(summary.net, Number(extra.previousNet) || 0);
    const savedPct = summary.income > 0 ? (Math.max(0, Number(summary.net) || 0) / summary.income) * 100 : 0;
    const monthHeader = formatMonthHeaderUk(extra.periodEndDay || '');
    const lines = [
      `📅 *ФІНАНСОВИЙ ЗВІТ — ${monthHeader}*`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '💰 *ЗАГАЛЬНА СТАТИСТИКА*',
      `Дохід: *+${formatAmount(summary.income)} ${sign}*`,
      `Витрати: *-${formatAmount(summary.expense)} ${sign}*`,
      `Баланс: \`${formatAmount(summary.net, true)} ${sign}\``,
      '',
      '📊 *ВИТРАТИ ПО КАТЕГОРІЯХ*',
    ];
    if (topExpenseCategories.length > 0) {
      for (const item of topExpenseCategories) {
        const pct = totalExpense > 0 ? (item.amount / totalExpense) * 100 : 0;
        lines.push(
          `${CATEGORY_EMOJI[item.categoryId] ?? '•'} ${categoryNameById(item.categoryId)}: ${formatAmount(item.amount)} ${sign} (${pct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}%)`
        );
      }
    } else {
      lines.push('• Немає витрат за період');
    }
    lines.push('');
    lines.push('⏰ *РОБОЧИЙ ЧАС*');
    lines.push(`├ Всього відпрацьовано: *${workedHours.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} год*`);
    lines.push(`├ Робочих днів: ${workingDays}`);
    lines.push(`└ Середньо/день: ${avgPerDay.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} год`);
    lines.push('');
    lines.push('📈 *ПОРІВНЯННЯ З МИНУЛИМ МІСЯЦЕМ*');
    lines.push(`├ Дохід: \`${incomePct >= 0 ? '+' : ''}${incomePct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}%\` ${incomePct >= 0 ? '⬆️' : '⬇️'}`);
    lines.push(`├ Витрати: \`${expensePct >= 0 ? '+' : ''}${expensePct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}%\` ${expensePct >= 0 ? '⬆️' : '⬇️'}`);
    lines.push(`└ Баланс: \`${netPct >= 0 ? '+' : ''}${netPct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}%\` ${netPct >= 0 ? '⬆️' : '⬇️'}`);
    lines.push('');
    lines.push('🎯 *ДОСЯГНЕННЯ*');
    lines.push(`✅ Збережено ${savedPct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}% від доходу`);
    return lines.join('\n');
  }
  const title = reportType === 'weekly' ? '📊 ТИЖНЕВИЙ ЗВІТ' : '📅 МІСЯЧНИЙ ЗВІТ';
  const lines = [
    title,
    periodLabel,
    '',
    '💰 ПІДСУМКИ',
    `Дохід: +${formatAmount(summary.income)} UAH`,
    `Витрати: -${formatAmount(summary.expense)} UAH`,
    `Результат: ${formatAmount(summary.net, true)} UAH`,
    `Операцій: ${summary.incomeCount + summary.expenseCount}`,
  ];
  if (comparison) {
    const incomeTrendText = formatComparisonChange(comparison.incomeDelta, { positive: 'більше', negative: 'менше' });
    const expenseTrendText = formatComparisonChange(comparison.expenseDelta, { positive: 'більше', negative: 'менше' });
    lines.push('');
    lines.push(`🔁 ДО ${reportType === 'weekly' ? 'МИНУЛОГО ТИЖНЯ' : 'МИНУЛОГО МІСЯЦЯ'}`);
    lines.push(`Дохід: ${incomeTrendText}`);
    lines.push(`Витрати: ${expenseTrendText}`);
  }
  if (summary.topExpenses.length > 0) {
    lines.push('');
    lines.push('📉 ТОП ВИТРАТ');
    summary.topExpenses.forEach((item, idx) => {
      lines.push(`${idx + 1}) ${categoryNameById(item.categoryId)} — ${formatAmount(item.amount)} UAH`);
    });
  }
  if (summary.topIncome.length > 0) {
    lines.push('');
    lines.push('📈 ТОП ДОХОДІВ');
    summary.topIncome.forEach((item, idx) => {
      lines.push(`${idx + 1}) ${categoryNameById(item.categoryId)} — ${formatAmount(item.amount)} UAH`);
    });
  }
  if ((txs?.length ?? 0) === 0) {
    lines.push('');
    lines.push('ℹ️ За обраний період операцій не знайдено.');
  }
  return lines.join('\n');
};
const sendUserReport = async (dbConn, userId, chatId, reportType, timeZone) => {
  if (!bot) return;
  const tz = normalizeTimeZone(timeZone);
  const nowIso = new Date().toISOString();
  const today = dayFromIsoInZone(nowIso, tz) || nowIso.slice(0, 10);
  const rangeSet = reportType === 'weekly' ? getWeekDaySet(today) : getMonthDaySet(today);
  const txs = await dbConn.all(
    'SELECT amount, currency, categoryId, type, date FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 5000',
    [userId]
  );
  const scoped = (Array.isArray(txs) ? txs : []).filter((tx) => rangeSet.has(dayFromIsoInZone(tx.date, tz)));
  const previousRangeSet = buildPreviousPeriodDaySet(reportType, rangeSet);
  const previousScoped = (Array.isArray(txs) ? txs : []).filter((tx) => previousRangeSet.has(dayFromIsoInZone(tx.date, tz)));
  const reportSettings = await getReportSettings(dbConn, userId);
  const sortedDays = Array.from(rangeSet).sort();
  const periodLabel = reportType === 'weekly'
    ? `${formatDayMonth(sortedDays[0])} — ${formatDayMonth(today)}.${String(today).slice(0, 4)}`
    : `${sortedDays[0]} → ${today}`;
  const summary = summarizeTransactions(scoped);
  const previousSummary = summarizeTransactions(previousScoped);
  const comparison = buildReportComparison(summary, previousSummary);
  const shiftRows = await dbConn.all(
    `SELECT day, worked_hours, salary_amount, salary_currency
     FROM planner_shift_entries
     WHERE user_id = ? AND day >= ? AND day <= ?`,
    [userId, sortedDays[0], sortedDays[sortedDays.length - 1]]
  );
  const reportCurrency = normalizeCurrency(reportSettings.reportCurrency || detectPrimaryCurrency(scoped));
  const workedHours = (shiftRows || []).reduce((acc, row) => acc + (Math.max(0, Number(row.worked_hours) || 0)), 0);
  const workedDaySet = new Set((shiftRows || []).map((row) => String(row.day || '')).filter(Boolean));
  const workingDays = workedDaySet.size;
  const avgPerDay = workingDays > 0 ? workedHours / workingDays : 0;
  const text = buildReportText(reportType, periodLabel, scoped, comparison, {
    workedHours,
    workingDays,
    avgPerDay,
    reportCurrency,
    previousIncome: previousSummary.income,
    previousExpense: previousSummary.expense,
    previousNet: previousSummary.net,
    periodEndDay: today,
  });
  await bot.sendMessage(chatId, text, {
    disable_web_page_preview: true,
    parse_mode: 'Markdown',
  });
};
const getUserTimeZone = async (dbConn, userId) => {
  const row = await dbConn.get('SELECT timezone FROM users WHERE telegram_id = ? LIMIT 1', [Number(userId)]);
  return normalizeTimeZone(row?.timezone);
};
const formatShiftTemplateLabel = (tpl) => {
  const name = String(tpl?.name ?? '').trim();
  const symbol = String(tpl?.symbol ?? '').trim();
  const base = [name, symbol].filter(Boolean).join(' • ') || 'Шаблон';
  const templateCurrency = normalizeCurrency(tpl?.currency);
  const cur = templateCurrency === 'PLN' ? 'zł' : '₴';
  return `${base} (${cur})`;
};
const upsertPlannerDay = async (dbConn, userId, day, patch) => {
  const dayKey = plannerDayKey(userId, day);
  const current = await dbConn.get(
    'SELECT hasShift, workedHours, salaryRate, salaryAmount, salary_currency, note FROM planner_days WHERE day = ? LIMIT 1',
    [dayKey]
  );
  const hasShift = patch.hasShift === undefined
    ? Number(current?.hasShift ? 1 : 0)
    : (patch.hasShift ? 1 : 0);
  const workedHours = patch.workedHours === undefined
    ? Number(current?.workedHours) || 0
    : Math.max(0, Number(patch.workedHours) || 0);
  const salaryRate = patch.salaryRate === undefined
    ? Number(current?.salaryRate) || 0
    : Math.max(0, Number(patch.salaryRate) || 0);
  const salaryAmount = patch.salaryAmount === undefined
    ? Number(current?.salaryAmount) || 0
    : Math.max(0, Number(patch.salaryAmount) || 0);
  const salaryCurrency = patch.salaryCurrency === 'PLN'
    ? 'PLN'
    : (patch.salaryCurrency === 'UAH' ? 'UAH' : (current?.salary_currency === 'PLN' ? 'PLN' : 'UAH'));
  const note = typeof patch.note === 'string'
    ? patch.note.trim()
    : String(current?.note ?? '').trim();
  const updatedAt = new Date().toISOString();
  await dbConn.run(
    `INSERT INTO planner_days (day, user_id, hasShift, workedHours, salaryRate, salaryAmount, salary_currency, note, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET
      user_id = excluded.user_id,
      hasShift = excluded.hasShift,
      workedHours = excluded.workedHours,
      salaryRate = excluded.salaryRate,
      salaryAmount = excluded.salaryAmount,
      salary_currency = excluded.salary_currency,
      note = excluded.note,
      updatedAt = excluded.updatedAt`,
    [dayKey, userId, hasShift, workedHours, salaryRate, salaryAmount, salaryCurrency, note, updatedAt]
  );
  return {
    day,
    hasShift: Boolean(hasShift),
    workedHours,
    salaryRate,
    salaryAmount,
    salaryCurrency,
    note,
    updatedAt,
  };
};

const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin denied'));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', AUTH_HEADER_NAME],
  })
);
app.use(express.json());
// Prevent caching of index.html so updates are visible immediately
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(path.join(__dirname, '../dist')));

const db = await initDb();
const backfillLegacyTransactionCurrency = async () => {
  const rows = await db.all('SELECT id, note, currency FROM transactions');
  await db.run('BEGIN');
  try {
    for (const row of rows) {
      const current = normalizeCurrency(row.currency);
      const fromNote = getCurrencyFromNote(row.note);
      if (!fromNote || fromNote === current) continue;
      await db.run('UPDATE transactions SET currency = ? WHERE id = ?', [fromNote, row.id]);
    }
    await db.run('COMMIT');
  } catch (e) {
    await db.run('ROLLBACK');
    throw e;
  }
};
await backfillLegacyTransactionCurrency();
const backupChatRaw = process.env.TELEGRAM_BACKUP_CHAT_ID;
const backupChatId =
  typeof backupChatRaw === 'string' && backupChatRaw.trim() !== '' ? Number(backupChatRaw.trim()) : NaN;
startScheduledDatabaseBackups(db, getDatabasePath(), {
  bot,
  telegramChatId: Number.isFinite(backupChatId) ? backupChatId : null,
});

const seedAccountPortfolioIfEmpty = async () => {
  const row = await db.get('SELECT COUNT(*) AS c FROM account_portfolio');
  const count = Number(row?.c ?? 0);
  if (count > 0) return;

  const now = new Date().toISOString();
  const rows = [
    {
      account_key: 'pumb',
      section: 'bank',
      sort_index: 10,
      name: 'pumb',
      primary_amount: 2410,
      primary_currency: 'UAH',
      sub_text: null,
      icon_tone: 'bank',
      badge: 'P',
      debt_phrase: null,
    },
    {
      account_key: 'privat24',
      section: 'bank',
      sort_index: 20,
      name: 'Privat24',
      primary_amount: 2,
      primary_currency: 'UAH',
      sub_text: null,
      icon_tone: 'bank',
      badge: 'PB',
      debt_phrase: null,
    },
    {
      account_key: 'wallet',
      section: 'cash',
      sort_index: 30,
      name: 'Wallet',
      primary_amount: 15342,
      primary_currency: 'PLN',
      sub_text: null,
      icon_tone: 'cash',
      badge: 'W',
      debt_phrase: null,
    },
    {
      account_key: 'crypto',
      section: 'crypto',
      sort_index: 40,
      name: 'crypto',
      primary_amount: 192,
      primary_currency: 'PLN',
      sub_text: '0,02294019 ETH',
      icon_tone: 'crypto',
      badge: '₿',
      debt_phrase: null,
    },
    {
      account_key: 'sol',
      section: 'crypto',
      sort_index: 50,
      name: 'sol',
      primary_amount: 1263,
      primary_currency: 'PLN',
      sub_text: '4,07 SOL',
      icon_tone: 'crypto',
      badge: 'S',
      debt_phrase: null,
    },
    {
      account_key: 'ton',
      section: 'crypto',
      sort_index: 60,
      name: 'Ton',
      primary_amount: 4,
      primary_currency: 'PLN',
      sub_text: '0,92 TON',
      icon_tone: 'crypto',
      badge: 'T',
      debt_phrase: null,
    },
    {
      account_key: 'usdt',
      section: 'crypto',
      sort_index: 70,
      name: 'usdt',
      primary_amount: 4500,
      primary_currency: 'PLN',
      sub_text: '1 247 USDT',
      icon_tone: 'crypto',
      badge: 'U',
      debt_phrase: null,
    },
    {
      account_key: 'misha',
      section: 'debt',
      sort_index: 80,
      name: 'Misha',
      primary_amount: 1655,
      primary_currency: 'PLN',
      sub_text: null,
      icon_tone: 'debt',
      badge: 'M',
      debt_phrase: 'мені винні',
    },
  ];

  await db.run('BEGIN');
  try {
    for (const r of rows) {
      await db.run(
        `INSERT INTO account_portfolio
         (account_key, section, sort_index, name, primary_amount, primary_currency, sub_text, icon_tone, badge, debt_phrase, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.account_key,
          r.section,
          r.sort_index,
          r.name,
          r.primary_amount,
          r.primary_currency,
          r.sub_text,
          r.icon_tone,
          r.badge,
          r.debt_phrase,
          now,
        ]
      );
    }
    await db.run('COMMIT');
  } catch (e) {
    await db.run('ROLLBACK');
    throw e;
  }
};

await seedAccountPortfolioIfEmpty();

// --- Bot Logic ---

const CATEGORIES = [
  { id: 'food', name: 'Продукти' },
  { id: 'transport', name: 'Транспорт' },
  { id: 'home', name: 'Житло' },
  { id: 'entertainment', name: 'Розваги' },
  { id: 'health', name: 'Здоров\'я' },
  { id: 'salary', name: 'Зарплата' },
  { id: 'other_income', name: 'Корекція балансу' },
  { id: 'other_expense', name: 'Корекція балансу' },
];
const BOT_CATEGORY_OPTIONS = CATEGORIES.filter((c) => c.id !== 'other_income' && c.id !== 'other_expense');

const pendingTransactions = new Map();
const pendingShiftStarts = new Map();
const invalidAmountNoticeAt = new Map();
const CUSTOM_CATEGORY_PREFIX = 'custom:';
const CUSTOM_CATEGORY_SEPARATOR = '|';

const normalizeCategoryName = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();

const createCustomCategoryId = (name, icon = 'Tag', color = '#8E8E93') =>
  `${CUSTOM_CATEGORY_PREFIX}${encodeURIComponent(name.trim())}${CUSTOM_CATEGORY_SEPARATOR}${icon}${CUSTOM_CATEGORY_SEPARATOR}${encodeURIComponent(color)}`;

const parseCustomCategoryId = (id) => {
  if (typeof id !== 'string' || !id.startsWith(CUSTOM_CATEGORY_PREFIX)) return null;
  const raw = id.slice(CUSTOM_CATEGORY_PREFIX.length);
  const [encodedName, iconRaw, colorRaw] = raw.split(CUSTOM_CATEGORY_SEPARATOR);
  if (!encodedName) return null;
  try {
    const name = decodeURIComponent(encodedName).trim();
    if (!name) return null;
    const icon = iconRaw || 'Tag';
    const color = colorRaw ? decodeURIComponent(colorRaw) : '#8E8E93';
    return { name, icon, color };
  } catch {
    return null;
  }
};
const botMainMenuKeyboard = {
  keyboard: [
    [{ text: '📊 Тижневий звіт' }, { text: '📅 Місячний звіт' }],
    [{ text: '⚙️ Налаштування звітів' }, { text: '🟢 Почати зміну' }],
    [{ text: '🔴 Завершити зміну' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};
const reportSettingsInlineKeyboard = (settings) => ({
  inline_keyboard: [
    [{ text: `Тижневий авто: ${settings.autoWeekly ? 'ON' : 'OFF'}`, callback_data: 'rep_toggle_weekly' }],
    [{ text: `Місячний авто: ${settings.autoMonthly ? 'ON' : 'OFF'}`, callback_data: 'rep_toggle_monthly' }],
    [{ text: `Час: ${settings.sendTime}`, callback_data: 'rep_time_info' }],
    [
      { text: 'Час 09:00', callback_data: 'rep_time_09:00' },
      { text: 'Час 21:00', callback_data: 'rep_time_21:00' },
    ],
    [{ text: 'Надіслати тижневий зараз', callback_data: 'rep_send_weekly' }],
    [{ text: 'Надіслати місячний зараз', callback_data: 'rep_send_monthly' }],
  ],
});
const sendBotMainMenu = async (chatId, text = 'Оберіть дію:') => {
  if (!bot) return;
  await bot.sendMessage(chatId, text, { reply_markup: botMainMenuKeyboard });
};
const sendReportSettingsPanel = async (chatId, userId, editMessageId) => {
  if (!bot) return;
  const settings = await getReportSettings(db, userId);
  const text = 'Керуйте звітами кнопками нижче:';
  if (Number.isFinite(Number(editMessageId))) {
    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: Number(editMessageId),
        reply_markup: reportSettingsInlineKeyboard(settings),
      });
      return;
    } catch {
      // fallback: send new message if edit is not possible
    }
  }
  await bot.sendMessage(chatId, text, { reply_markup: reportSettingsInlineKeyboard(settings) });
};

if (bot) {
  bot.onText(/\/start/, async (msg) => {
    await upsertBotUser(db, msg.from.id, msg.chat.id);
    await ensureReportSettings(db, String(msg.from.id));
    await sendBotMainMenu(
      msg.chat.id,
      'Привіт 👋 Це Denga.\nКористуйся кнопками нижче для звітів і змін.\nЩоб швидко додати транзакцію — просто надішли суму (наприклад, 100).'
    );
  });
  bot.onText(/\/menu/i, async (msg) => {
    if (!msg.chat?.id) return;
    await sendBotMainMenu(msg.chat.id);
  });
  bot.onText(/\/report_week/i, async (msg) => {
    if (!msg.from?.id || !msg.chat?.id) return;
    const userId = String(msg.from.id);
    await upsertBotUser(db, msg.from.id, msg.chat.id);
    const tz = await getUserTimeZone(db, userId);
    await sendUserReport(db, userId, msg.chat.id, 'weekly', tz);
  });
  bot.onText(/\/report_month/i, async (msg) => {
    if (!msg.from?.id || !msg.chat?.id) return;
    const userId = String(msg.from.id);
    await upsertBotUser(db, msg.from.id, msg.chat.id);
    const tz = await getUserTimeZone(db, userId);
    await sendUserReport(db, userId, msg.chat.id, 'monthly', tz);
  });
  bot.onText(/\/report_time(?:\s+(.+))?/i, async (msg, match) => {
    if (!msg.from?.id || !msg.chat?.id) return;
    const userId = String(msg.from.id);
    await upsertBotUser(db, msg.from.id, msg.chat.id);
    const next = parseSendTime(match?.[1] ?? '');
    if (!next) {
      bot.sendMessage(msg.chat.id, 'Формат: /report_time HH:MM (наприклад, /report_time 21:00)');
      return;
    }
    const settings = await updateReportSettings(db, userId, { sendTime: next });
    bot.sendMessage(msg.chat.id, `✅ Час авто-звітів оновлено: ${settings.sendTime}`);
  });
  bot.onText(/\/report_auto_week(?:\s+(.+))?/i, async (msg, match) => {
    if (!msg.from?.id || !msg.chat?.id) return;
    const userId = String(msg.from.id);
    await upsertBotUser(db, msg.from.id, msg.chat.id);
    const on = parseOnOff(match?.[1] ?? '');
    if (on === null) {
      bot.sendMessage(msg.chat.id, 'Формат: /report_auto_week on|off');
      return;
    }
    const settings = await updateReportSettings(db, userId, { autoWeekly: on });
    bot.sendMessage(msg.chat.id, `✅ Тижневий авто-звіт: ${settings.autoWeekly ? 'ON' : 'OFF'}`);
  });
  bot.onText(/\/report_auto_month(?:\s+(.+))?/i, async (msg, match) => {
    if (!msg.from?.id || !msg.chat?.id) return;
    const userId = String(msg.from.id);
    await upsertBotUser(db, msg.from.id, msg.chat.id);
    const on = parseOnOff(match?.[1] ?? '');
    if (on === null) {
      bot.sendMessage(msg.chat.id, 'Формат: /report_auto_month on|off');
      return;
    }
    const settings = await updateReportSettings(db, userId, { autoMonthly: on });
    bot.sendMessage(msg.chat.id, `✅ Місячний авто-звіт: ${settings.autoMonthly ? 'ON' : 'OFF'}`);
  });
  bot.onText(/\/shift_start/i, async (msg) => {
    if (!msg.from?.id || !msg.chat?.id) return;
    const userId = String(msg.from.id);
    await upsertBotUser(db, msg.from.id, msg.chat.id);
    const userTimeZone = await getUserTimeZone(db, userId);
    const active = await db.get(
      'SELECT started_at FROM bot_active_shifts WHERE user_id = ? LIMIT 1',
      [userId]
    );
    if (active?.started_at) {
      bot.sendMessage(msg.chat.id, `⚠️ Зміна вже розпочата о ${parseTimeFromIso(active.started_at, userTimeZone)}.`);
      return;
    }
    const templates = await db.all(
      `SELECT id, name, symbol, salary_rate, salary_amount, currency
       FROM planner_shift_templates
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 20`,
      [userId]
    );
    const startedAt = new Date().toISOString();
    const startedDay = dayFromIsoInZone(startedAt, userTimeZone) || startedAt.slice(0, 10);
    pendingShiftStarts.set(msg.chat.id, {
      userId,
      startedAt,
      startedDay,
      userTimeZone,
      createdAt: Date.now(),
    });
    const templateButtons = Array.isArray(templates)
      ? templates.map((tpl) => [{ text: formatShiftTemplateLabel(tpl).slice(0, 48), callback_data: `shift_tpl_${tpl.id}` }])
      : [];
    templateButtons.unshift([{ text: 'Без шаблону', callback_data: 'shift_tpl_none' }]);
    bot.sendMessage(msg.chat.id, 'Оберіть шаблон зміни:', { reply_markup: { inline_keyboard: templateButtons } });
  });
  bot.onText(/\/shift_end/i, async (msg) => {
    if (!msg.from?.id || !msg.chat?.id) return;
    const userId = String(msg.from.id);
    await upsertBotUser(db, msg.from.id, msg.chat.id);
    const userTimeZone = await getUserTimeZone(db, userId);
    const active = await db.get(
      'SELECT started_at, started_day, template_id, salary_rate, salary_amount, salary_currency, shift_note FROM bot_active_shifts WHERE user_id = ? LIMIT 1',
      [userId]
    );
    if (!active?.started_at) {
      bot.sendMessage(msg.chat.id, '⚠️ Активної зміни немає. Використайте /shift_start.');
      return;
    }
    const deleteActive = await db.run(
      'DELETE FROM bot_active_shifts WHERE user_id = ? AND started_at = ?',
      [userId, active.started_at]
    );
    if (!deleteActive?.changes) {
      bot.sendMessage(msg.chat.id, '⚠️ Зміну вже завершено. Оновіть календар.');
      return;
    }
    const now = new Date();
    const startedAtDate = new Date(active.started_at);
    if (Number.isNaN(startedAtDate.getTime())) {
      await db.run('DELETE FROM bot_active_shifts WHERE user_id = ?', [userId]);
      bot.sendMessage(msg.chat.id, '⚠️ Стан зміни був пошкоджений. Почніть нову через /shift_start.');
      return;
    }
    const diffHours = Math.max(0, (now.getTime() - startedAtDate.getTime()) / (1000 * 60 * 60));
    const roundedHours = Number(diffHours.toFixed(2));
    const day = String(active.started_day || dayFromIsoInZone(active.started_at, userTimeZone) || active.started_at.slice(0, 10));
    const shiftSalaryRate = Number(active.salary_rate) || 0;
    const shiftSalaryAmount = Number(active.salary_amount) || 0;
    const shiftSalaryCurrency = normalizeCurrency(active.salary_currency) === 'PLN' ? 'PLN' : 'UAH';
    const baseNote = String(active.shift_note ?? '').trim();
    let salaryAmount = shiftSalaryAmount;
    if (salaryAmount <= 0 && shiftSalaryRate > 0 && roundedHours > 0) {
      salaryAmount = Number((shiftSalaryRate * roundedHours).toFixed(2));
    }
    const nowIso = now.toISOString();
    const entryNote = baseNote || buildBotShiftNote(active.started_at, nowIso, userTimeZone);
    await db.run(
      `INSERT INTO planner_shift_entries
       (id, user_id, day, started_at, ended_at, worked_hours, salary_rate, salary_amount, salary_currency, note, template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        userId,
        day,
        String(active.started_at),
        nowIso,
        roundedHours,
        Math.max(0, shiftSalaryRate),
        Math.max(0, salaryAmount),
        shiftSalaryCurrency,
        entryNote,
        active.template_id ? String(active.template_id) : null,
        nowIso,
        nowIso,
      ]
    );
    await upsertPlannerDay(db, userId, day, {
      hasShift: true,
      note: entryNote,
    });
    bot.sendMessage(
      msg.chat.id,
      `🔴 Зміну завершено (${parseTimeFromIso(now.toISOString(), userTimeZone)}). Відпрацьовано: ${roundedHours.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} год.`
    );
  });

  bot.on('message', async (msg) => {
    if (!msg.from?.id || !msg.chat?.id) return;
    await upsertBotUser(db, msg.from.id, msg.chat.id);
    if (!msg.text || msg.text.startsWith('/')) return;
    const text = msg.text.trim();
    const normalizedText = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s/]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      /(^| )почати зміну($| )/i.test(normalizedText) ||
      /(^| )начать смену($| )/i.test(normalizedText) ||
      /(^| )start shift($| )/i.test(normalizedText) ||
      normalizedText === 'почати зміну' ||
      normalizedText === '🟢 почати зміну'
    ) {
      bot.processUpdate({
        update_id: Date.now(),
        message: {
          ...msg,
          text: '/shift_start',
        },
      });
      return;
    }
    if (
      /(^| )завершити зміну($| )/i.test(normalizedText) ||
      /(^| )закончить смену($| )/i.test(normalizedText) ||
      /(^| )end shift($| )/i.test(normalizedText) ||
      normalizedText === 'завершити зміну' ||
      normalizedText === '🔴 завершити зміну'
    ) {
      bot.processUpdate({
        update_id: Date.now() + 1,
        message: {
          ...msg,
          text: '/shift_end',
        },
      });
      return;
    }
    if (
      /(^| )записати транзакції($| )/i.test(normalizedText) ||
      /(^| )записати транзакцію($| )/i.test(normalizedText) ||
      /(^| )record transaction(s)?($| )/i.test(normalizedText)
    ) {
      bot.sendMessage(
        msg.chat.id,
        'Добре. Надішліть суму числом (наприклад, 100), і я збережу транзакцію.'
      );
      return;
    }
    if (
      /(^| )тижнев(ий|ого) звіт($| )/i.test(normalizedText) ||
      /(^| )weekly report($| )/i.test(normalizedText) ||
      normalizedText === '📊 тижневий звіт'
    ) {
      bot.processUpdate({
        update_id: Date.now() + 2,
        message: {
          ...msg,
          text: '/report_week',
        },
      });
      return;
    }
    if (
      /(^| )місячн(ий|ого) звіт($| )/i.test(normalizedText) ||
      /(^| )monthly report($| )/i.test(normalizedText) ||
      normalizedText === '📅 місячний звіт'
    ) {
      bot.processUpdate({
        update_id: Date.now() + 3,
        message: {
          ...msg,
          text: '/report_month',
        },
      });
      return;
    }
    if (normalizedText === 'налаштування звітів' || normalizedText === 'настройки отчетов' || normalizedText === 'report settings') {
      await sendReportSettingsPanel(msg.chat.id, String(msg.from.id));
      return;
    }
    const amount = Number(msg.text.replace(',', '.').trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      const now = Date.now();
      const last = invalidAmountNoticeAt.get(msg.chat.id) ?? 0;
      if (now - last >= 60_000) {
        invalidAmountNoticeAt.set(msg.chat.id, now);
        bot.sendMessage(
          msg.chat.id,
          'Не зрозумів суму. Надішліть число (наприклад, 100) або використайте /shift_start чи /shift_end.'
        );
      }
      return;
    }
    pendingTransactions.set(msg.chat.id, {
      userId: String(msg.from.id),
      amount,
      createdAt: Date.now(),
    });
    const keyboard = {
      inline_keyboard: BOT_CATEGORY_OPTIONS.map((c) => [{ text: c.name, callback_data: `cat_${c.id}` }]),
    };
    bot.sendMessage(msg.chat.id, `Виберіть категорію для суми ${amount}:`, { reply_markup: keyboard });
  });

  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message?.chat?.id;
    if (!chatId) {
      bot.answerCallbackQuery(callbackQuery.id);
      return;
    }
    if (!callbackQuery.data) {
      bot.answerCallbackQuery(callbackQuery.id);
      return;
    }
    const cbUserId = String(callbackQuery.from.id);
    if (callbackQuery.data.startsWith('rep_')) {
      await upsertBotUser(db, callbackQuery.from.id, chatId);
      if (callbackQuery.data === 'rep_toggle_weekly') {
        const settings = await getReportSettings(db, cbUserId);
        await updateReportSettings(db, cbUserId, { autoWeekly: !settings.autoWeekly });
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Оновлено weekly авто-звіт' });
        await sendReportSettingsPanel(chatId, cbUserId, callbackQuery.message?.message_id);
        return;
      }
      if (callbackQuery.data === 'rep_toggle_monthly') {
        const settings = await getReportSettings(db, cbUserId);
        await updateReportSettings(db, cbUserId, { autoMonthly: !settings.autoMonthly });
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Оновлено monthly авто-звіт' });
        await sendReportSettingsPanel(chatId, cbUserId, callbackQuery.message?.message_id);
        return;
      }
      if (callbackQuery.data === 'rep_send_weekly') {
        const tz = await getUserTimeZone(db, cbUserId);
        await sendUserReport(db, cbUserId, chatId, 'weekly', tz);
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Тижневий звіт надіслано' });
        return;
      }
      if (callbackQuery.data === 'rep_send_monthly') {
        const tz = await getUserTimeZone(db, cbUserId);
        await sendUserReport(db, cbUserId, chatId, 'monthly', tz);
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Місячний звіт надіслано' });
        return;
      }
      if (callbackQuery.data.startsWith('rep_time_')) {
        const value = callbackQuery.data.replace('rep_time_', '');
        const parsed = parseSendTime(value);
        if (!parsed) {
          await bot.answerCallbackQuery(callbackQuery.id, { text: 'Невірний формат часу' });
          return;
        }
        await updateReportSettings(db, cbUserId, { sendTime: parsed });
        await bot.answerCallbackQuery(callbackQuery.id, { text: `Час змінено на ${parsed}` });
        await sendReportSettingsPanel(chatId, cbUserId, callbackQuery.message?.message_id);
        return;
      }
      if (callbackQuery.data === 'rep_time_info') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Оберіть час кнопками 09:00 або 21:00' });
        return;
      }
      await bot.answerCallbackQuery(callbackQuery.id);
      return;
    }

    if (callbackQuery.data.startsWith('shift_tpl_')) {
      const pendingShift = pendingShiftStarts.get(chatId);
      if (!pendingShift) {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Запит застарів. Запустіть /shift_start ще раз.' });
        return;
      }
      if (pendingShift.userId !== String(callbackQuery.from.id)) {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Ця дія не для цього користувача.' });
        return;
      }
      if (Date.now() - Number(pendingShift.createdAt ?? 0) > 10 * 60 * 1000) {
        pendingShiftStarts.delete(chatId);
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Запит застарів. Запустіть /shift_start ще раз.' });
        return;
      }
      const picked = callbackQuery.data.replace('shift_tpl_', '');
      let salaryRate = 0;
      let salaryAmount = 0;
      let salaryCurrency = 'UAH';
      let shiftNote = '';
      let templateId = null;
      if (picked !== 'none') {
        const tpl = await db.get(
          `SELECT id, name, symbol, salary_rate, salary_amount, currency
           FROM planner_shift_templates
           WHERE user_id = ? AND id = ?
           LIMIT 1`,
          [pendingShift.userId, picked]
        );
        if (!tpl?.id) {
          bot.answerCallbackQuery(callbackQuery.id, { text: 'Шаблон не знайдено.' });
          return;
        }
        templateId = String(tpl.id);
        salaryRate = Math.max(0, Number(tpl.salary_rate) || 0);
        salaryAmount = Math.max(0, Number(tpl.salary_amount) || 0);
        salaryCurrency = normalizeCurrency(tpl.currency) === 'PLN' ? 'PLN' : 'UAH';
        shiftNote = [String(tpl.name ?? '').trim(), String(tpl.symbol ?? '').trim()].filter(Boolean).join(' • ');
      }
      const userTimeZone = normalizeTimeZone(pendingShift.userTimeZone);
      const day = String(pendingShift.startedDay || dayFromIsoInZone(pendingShift.startedAt, userTimeZone) || String(pendingShift.startedAt).slice(0, 10));
      await db.run(
        `INSERT INTO bot_active_shifts
         (user_id, started_at, started_day, template_id, salary_rate, salary_amount, salary_currency, shift_note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
          started_at = excluded.started_at,
          started_day = excluded.started_day,
          template_id = excluded.template_id,
          salary_rate = excluded.salary_rate,
          salary_amount = excluded.salary_amount,
          salary_currency = excluded.salary_currency,
          shift_note = excluded.shift_note,
          updated_at = excluded.updated_at`,
        [
          pendingShift.userId,
          pendingShift.startedAt,
          day,
          templateId,
          salaryRate,
          salaryAmount,
          salaryCurrency,
          shiftNote,
          pendingShift.startedAt,
        ]
      );
      await upsertPlannerDay(db, pendingShift.userId, day, {
        hasShift: true,
        salaryRate,
        salaryAmount,
        salaryCurrency: salaryCurrency === 'PLN' ? 'PLN' : 'UAH',
        note: shiftNote,
      });
      pendingShiftStarts.delete(chatId);
      bot.answerCallbackQuery(callbackQuery.id);
      bot.sendMessage(
        chatId,
        `🟢 Зміну розпочато (${parseTimeFromIso(pendingShift.startedAt, userTimeZone)}). Синхронізовано з календарем.`
      );
      return;
    }

    const pending = pendingTransactions.get(chatId);
    if (!pending) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Запит застарів. Надішліть суму ще раз.' });
      return;
    }
    if (pending.userId !== String(callbackQuery.from.id)) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Ця дія не для цього користувача.' });
      return;
    }
    if (Date.now() - Number(pending.createdAt ?? 0) > 10 * 60 * 1000) {
      pendingTransactions.delete(chatId);
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Запит застарів. Надішліть суму ще раз.' });
      return;
    }

    if (callbackQuery.data.startsWith('cat_')) {
      const categoryId = callbackQuery.data.replace('cat_', '');
      const category = CATEGORIES.find((c) => c.id === categoryId);
      if (!category) {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Категорію не знайдено.' });
        return;
      }
      const accounts = await db.all(
        'SELECT account_key AS accountKey, name FROM account_portfolio WHERE user_id = ? ORDER BY sort_index ASC, account_key ASC',
        [pending.userId]
      );
      pending.categoryId = categoryId;
      pending.type = (categoryId === 'salary' || categoryId === 'other_income') ? 'income' : 'expense';
      const accountButtons = Array.isArray(accounts)
        ? accounts.slice(0, 20).map((a) => [{
            text: String(a.name ?? a.accountKey ?? '').trim().slice(0, 28) || String(a.accountKey),
            callback_data: `acc_${String(a.accountKey)}`,
          }])
        : [];
      accountButtons.unshift([{ text: 'Без рахунку', callback_data: 'acc_none' }]);
      bot.answerCallbackQuery(callbackQuery.id);
      bot.sendMessage(chatId, `Категорія: ${category.name}. Оберіть рахунок:`, {
        reply_markup: { inline_keyboard: accountButtons },
      });
      return;
    }

    if (callbackQuery.data.startsWith('acc_')) {
      if (!pending.categoryId || !pending.type) {
        pendingTransactions.delete(chatId);
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Спочатку оберіть категорію.' });
        return;
      }
      const picked = callbackQuery.data.replace('acc_', '');
      const accountKey = picked === 'none' ? null : String(picked).trim().toLowerCase();
      const note = accountKey
        ? mergeAccountIntoNote('Added via Telegram Bot', accountKey)
        : 'Added via Telegram Bot';
      const transaction = {
        id: uuidv4(),
        user_id: pending.userId,
        amount: pending.amount,
        currency: 'UAH',
        categoryId: pending.categoryId,
        type: pending.type,
        date: new Date().toISOString(),
        note,
        telegram_user_id: callbackQuery.from.id,
      };
      await db.run(
        'INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date, note, telegram_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [transaction.id, transaction.user_id, transaction.amount, transaction.currency, transaction.categoryId, transaction.type, transaction.date, transaction.note, transaction.telegram_user_id]
      );
      await applyAccountDelta(db, transaction.user_id, getAccountSlugFromNote(transaction.note), accountDeltaForTx(transaction));
      pendingTransactions.delete(chatId);
      bot.answerCallbackQuery(callbackQuery.id);
      const category = CATEGORIES.find((c) => c.id === pending.categoryId);
      bot.sendMessage(chatId, `✅ Транзакцію ${pending.amount} (${category ? category.name : pending.categoryId}) додано!`);
    }
  });
} else {
  console.warn('Telegram bot is disabled: TELEGRAM_BOT_TOKEN is missing');
}

if (bot) {
  setTimeout(() => {
    if (typeof runAutoReportsTick !== 'function') return;
    runAutoReportsTick().catch((e) => {
      console.error('[bot] auto reports initial tick failed', e);
    });
  }, 5000);
  setInterval(() => {
    if (typeof runAutoReportsTick !== 'function') return;
    runAutoReportsTick().catch((e) => {
      console.error('[bot] auto reports tick failed', e);
    });
  }, 60 * 1000);
}

// --- API Logic ---
app.use('/api', authMiddleware);

app.get('/api/reports/settings', async (req, res) => {
  const userId = String(req.authUserId ?? '');
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const settings = await getReportSettings(db, userId);
  res.json(settings);
});

app.put('/api/reports/settings', async (req, res) => {
  const userId = String(req.authUserId ?? '');
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const patch = {};
  if (req.body?.sendTime !== undefined) {
    const parsed = parseSendTime(req.body.sendTime);
    if (!parsed) {
      res.status(400).json({ error: 'sendTime must be HH:MM' });
      return;
    }
    patch.sendTime = parsed;
  }
  if (req.body?.autoWeekly !== undefined) patch.autoWeekly = Boolean(req.body.autoWeekly);
  if (req.body?.autoMonthly !== undefined) patch.autoMonthly = Boolean(req.body.autoMonthly);
  if (req.body?.reportCurrency !== undefined) patch.reportCurrency = normalizeCurrency(req.body.reportCurrency);
  const settings = await updateReportSettings(db, userId, patch);
  res.json(settings);
});

app.post('/api/reports/weekly/send-now', async (req, res) => {
  const userId = String(req.authUserId ?? '');
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const user = await db.get('SELECT chat_id AS chatId, timezone FROM users WHERE telegram_id = ? LIMIT 1', [Number(userId)]);
  if (!user?.chatId) {
    res.status(400).json({ error: 'Telegram chat is not linked yet' });
    return;
  }
  await sendUserReport(db, userId, Number(user.chatId), 'weekly', user.timezone);
  res.json({ ok: true });
});

app.post('/api/reports/monthly/send-now', async (req, res) => {
  const userId = String(req.authUserId ?? '');
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const user = await db.get('SELECT chat_id AS chatId, timezone FROM users WHERE telegram_id = ? LIMIT 1', [Number(userId)]);
  if (!user?.chatId) {
    res.status(400).json({ error: 'Telegram chat is not linked yet' });
    return;
  }
  await sendUserReport(db, userId, Number(user.chatId), 'monthly', user.timezone);
  res.json({ ok: true });
});

app.get('/api/reminders', async (req, res) => {
  const userId = String(req.authUserId ?? '');
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const reminders = await listReminders(db, userId);
  res.json(reminders);
});

app.patch('/api/reminders/:id', async (req, res) => {
  const userId = String(req.authUserId ?? '');
  const id = String(req.params.id ?? '').trim();
  if (!userId || !id) {
    res.status(400).json({ error: 'invalid request' });
    return;
  }
  const current = await db.get('SELECT id, kind FROM user_reminders WHERE user_id = ? AND id = ? LIMIT 1', [userId, id]);
  if (!current) {
    res.status(404).json({ error: 'Reminder not found' });
    return;
  }
  const nextKind = req.body?.kind === undefined ? String(current.kind) : String(req.body.kind);
  if (!isValidReminderKind(nextKind)) {
    res.status(400).json({ error: 'kind must be daily or subscriptions' });
    return;
  }
  const nextTime = req.body?.timeHHMM === undefined ? undefined : parseSendTime(req.body.timeHHMM);
  if (req.body?.timeHHMM !== undefined && !nextTime) {
    res.status(400).json({ error: 'timeHHMM must be HH:MM' });
    return;
  }
  const leadDaysRaw = req.body?.leadDays;
  const leadDays = leadDaysRaw === undefined ? undefined : Math.max(0, Math.min(31, Number(leadDaysRaw) || 0));
  await db.run(
    `UPDATE user_reminders
     SET kind = ?,
         title = COALESCE(?, title),
         enabled = COALESCE(?, enabled),
         time_hhmm = COALESCE(?, time_hhmm),
         lead_days = COALESCE(?, lead_days),
         updated_at = ?
     WHERE user_id = ? AND id = ?`,
    [
      nextKind,
      req.body?.title === undefined ? null : String(req.body.title).trim(),
      req.body?.enabled === undefined ? null : (req.body.enabled ? 1 : 0),
      nextTime ?? null,
      leadDays ?? null,
      new Date().toISOString(),
      userId,
      id,
    ]
  );
  const reminders = await listReminders(db, userId);
  res.json(reminders.find((r) => r.id === id) ?? null);
});

app.put('/api/reminders/timezone', async (req, res) => {
  const userId = String(req.authUserId ?? '');
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const tz = normalizeTimeZone(req.body?.timezone);
  await db.run(
    `INSERT INTO users (telegram_id, chat_id, timezone)
     VALUES (?, 0, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET
      timezone = excluded.timezone`,
    [Number(userId), tz]
  );
  res.json({ timezone: tz });
});

app.get('/api/fx-rates', async (_req, res) => {
  const payload = await fetchFxRates();
  res.json(payload);
});

app.get('/api/crypto-prices', async (_req, res) => {
  const payload = await fetchCryptoUsdPrices();
  res.json(payload);
});

app.get('/api/accounts', async (req, res) => {
  const userId = req.authUserId;
  const rows = await db.all(
    `SELECT
       account_key AS accountKey,
       section,
       sort_index AS sortIndex,
       name,
       primary_amount AS primaryAmount,
       primary_currency AS primaryCurrency,
       sub_text AS subText,
       icon_tone AS iconTone,
       badge,
       debt_phrase AS debtPhrase,
       updatedAt
     FROM account_portfolio
     WHERE user_id = ?
     ORDER BY sort_index ASC, account_key ASC`,
    [userId]
  );
  res.json(rows);
});

app.post('/api/accounts', async (req, res) => {
  const userId = req.authUserId;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  const primaryAmount = Number(req.body?.primaryAmount);
  const primaryCurrency = req.body?.primaryCurrency === 'PLN' ? 'PLN' : 'UAH';
  const subText = typeof req.body?.subText === 'string' ? req.body.subText.trim() : '';
  const iconTone = typeof req.body?.iconTone === 'string' ? req.body.iconTone.trim() : '';
  const badge = typeof req.body?.badge === 'string' ? req.body.badge.trim() : '';
  const debtPhrase = typeof req.body?.debtPhrase === 'string' ? req.body.debtPhrase.trim() : '';
  const section = typeof req.body?.section === 'string' ? req.body.section.trim() : '';
  const sortIndex = req.body?.sortIndex === undefined ? undefined : Number(req.body.sortIndex);

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!Number.isFinite(primaryAmount)) {
    res.status(400).json({ error: 'primaryAmount must be a number' });
    return;
  }
  if (!['bank', 'cash', 'crypto', 'debt'].includes(section)) {
    res.status(400).json({ error: 'section must be bank, cash, crypto, or debt' });
    return;
  }
  if (!Number.isFinite(sortIndex)) {
    res.status(400).json({ error: 'sortIndex must be a number' });
    return;
  }
  if (!['bank', 'cash', 'crypto', 'debt', 'neutral'].includes(iconTone)) {
    res.status(400).json({ error: 'iconTone must be bank, cash, crypto, debt, or neutral' });
    return;
  }

  const normalizedBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'account';
  let accountKey = normalizedBase;
  let suffix = 2;
  while (await db.get('SELECT 1 FROM account_portfolio WHERE user_id = ? AND account_key = ? LIMIT 1', [userId, accountKey])) {
    accountKey = `${normalizedBase}_${suffix}`;
    suffix += 1;
  }

  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO account_portfolio
     (account_key, user_id, section, sort_index, name, primary_amount, primary_currency, sub_text, icon_tone, badge, debt_phrase, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      accountKey,
      userId,
      section,
      sortIndex,
      name,
      primaryAmount,
      primaryCurrency,
      subText ? subText : null,
      iconTone,
      badge ? badge : null,
      debtPhrase ? debtPhrase : null,
      now,
    ]
  );

  const row = await db.get(
    `SELECT
       account_key AS accountKey,
       section,
       sort_index AS sortIndex,
       name,
       primary_amount AS primaryAmount,
       primary_currency AS primaryCurrency,
       sub_text AS subText,
       icon_tone AS iconTone,
       badge,
       debt_phrase AS debtPhrase,
       updatedAt
     FROM account_portfolio
     WHERE user_id = ? AND account_key = ?
     LIMIT 1`,
    [userId, accountKey]
  );

  res.status(201).json(row);
});

app.put('/api/accounts/:key', async (req, res) => {
  const userId = req.authUserId;
  const accountKey = String(req.params.key ?? '').trim();
  if (!accountKey) {
    res.status(400).json({ error: 'invalid key' });
    return;
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  const primaryAmount = Number(req.body?.primaryAmount);
  const primaryCurrency = req.body?.primaryCurrency === 'PLN' ? 'PLN' : 'UAH';
  const subText = typeof req.body?.subText === 'string' ? req.body.subText.trim() : '';
  const iconTone = typeof req.body?.iconTone === 'string' ? req.body.iconTone.trim() : '';
  const badge = typeof req.body?.badge === 'string' ? req.body.badge.trim() : '';
  const debtPhrase = typeof req.body?.debtPhrase === 'string' ? req.body.debtPhrase.trim() : '';
  const section = typeof req.body?.section === 'string' ? req.body.section.trim() : '';
  const sortIndex = req.body?.sortIndex === undefined ? undefined : Number(req.body.sortIndex);

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!Number.isFinite(primaryAmount)) {
    res.status(400).json({ error: 'primaryAmount must be a number' });
    return;
  }
  if (!['bank', 'cash', 'crypto', 'debt'].includes(section)) {
    res.status(400).json({ error: 'section must be bank, cash, crypto, or debt' });
    return;
  }
  if (!Number.isFinite(sortIndex)) {
    res.status(400).json({ error: 'sortIndex must be a number' });
    return;
  }
  if (!['bank', 'cash', 'crypto', 'debt', 'neutral'].includes(iconTone)) {
    res.status(400).json({ error: 'iconTone must be bank, cash, crypto, debt, or neutral' });
    return;
  }

  const now = new Date().toISOString();
  const existing = await db.get(
    `SELECT account_key AS accountKey, primary_amount AS primaryAmount, primary_currency AS primaryCurrency
     FROM account_portfolio
     WHERE user_id = ? AND account_key = ?
     LIMIT 1`,
    [userId, accountKey]
  );
  if (!existing) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const prevPrimaryAmount = Number(existing.primaryAmount);
  const prevPrimaryCurrency = existing.primaryCurrency === 'PLN' ? 'PLN' : 'UAH';
  await db.run(
    `UPDATE account_portfolio
     SET section = ?,
         sort_index = ?,
         name = ?,
         primary_amount = ?,
         primary_currency = ?,
         sub_text = ?,
         icon_tone = ?,
         badge = ?,
         debt_phrase = ?,
         updatedAt = ?
     WHERE user_id = ? AND account_key = ?`,
    [
      section,
      sortIndex,
      name,
      primaryAmount,
      primaryCurrency,
      subText ? subText : null,
      iconTone,
      badge ? badge : null,
      debtPhrase ? debtPhrase : null,
      now,
      userId,
      accountKey,
    ]
  );

  const delta = primaryAmount - prevPrimaryAmount;
  if (Number.isFinite(delta) && Math.abs(delta) > 0.000001) {
    const txType = delta > 0 ? 'income' : 'expense';
    const txAmount = Math.abs(delta);
    const correctionCategoryId = await resolveBalanceCorrectionCategoryId(db, userId, txType);
    const txCurrency = primaryCurrency || prevPrimaryCurrency;
    const txNote = mergeAccountIntoNote('Корекція балансу', accountKey);
    await db.run(
      `INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date, note, telegram_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        userId,
        txAmount,
        txCurrency,
        correctionCategoryId,
        txType,
        new Date().toISOString(),
        txNote,
        null,
      ]
    );
  }

  const row = await db.get(
    `SELECT
       account_key AS accountKey,
       section,
       sort_index AS sortIndex,
       name,
       primary_amount AS primaryAmount,
       primary_currency AS primaryCurrency,
       sub_text AS subText,
       icon_tone AS iconTone,
       badge,
       debt_phrase AS debtPhrase,
       updatedAt
     FROM account_portfolio
     WHERE user_id = ? AND account_key = ?
     LIMIT 1`,
    [userId, accountKey]
  );

  res.json(row);
});

app.delete('/api/accounts/:key', async (req, res) => {
  const userId = req.authUserId;
  const accountKey = String(req.params.key ?? '').trim();
  if (!accountKey) {
    res.status(400).json({ error: 'invalid key' });
    return;
  }

  const existing = await db.get('SELECT account_key FROM account_portfolio WHERE user_id = ? AND account_key = ? LIMIT 1', [userId, accountKey]);
  if (!existing) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  await db.run('DELETE FROM account_portfolio WHERE user_id = ? AND account_key = ?', [userId, accountKey]);
  res.status(204).end();
});

app.get('/api/transactions', async (req, res) => {
  const userId = req.authUserId;
  await runSubscriptionAutopayForUser(userId);
  const transactions = await db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC', [userId]);
  res.json(transactions);
});

app.post('/api/transactions', async (req, res) => {
  const userId = req.authUserId;
  const amount = parseAmount(req.body?.amount);
  const currency = normalizeCurrency(req.body?.currency);
  const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId.trim() : '';
  const type = req.body?.type === 'income' || req.body?.type === 'expense' ? req.body.type : '';
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'amount must be > 0', code: 'INVALID_AMOUNT' });
    return;
  }
  if (!categoryId) {
    res.status(400).json({ error: 'categoryId is required', code: 'INVALID_CATEGORY' });
    return;
  }
  if (!type) {
    res.status(400).json({ error: 'type must be income or expense', code: 'INVALID_TYPE' });
    return;
  }
  if (note.length > 120) {
    res.status(400).json({ error: 'note must be <= 120 chars', code: 'INVALID_NOTE' });
    return;
  }
  const transaction = {
    id: uuidv4(),
    user_id: userId,
    amount,
    currency,
    categoryId,
    type,
    date: new Date().toISOString(),
    note: note || undefined
  };

  await db.run(
    'INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [transaction.id, transaction.user_id, transaction.amount, transaction.currency, transaction.categoryId, transaction.type, transaction.date, transaction.note ?? null]
  );
  await applyAccountDelta(db, userId, getAccountSlugFromNote(transaction.note), accountDeltaForTx(transaction));

  res.status(201).json(transaction);
});

app.patch('/api/transactions/:id', async (req, res) => {
  const userId = req.authUserId;
  const { id } = req.params;
  const current = await db.get('SELECT * FROM transactions WHERE user_id = ? AND id = ? LIMIT 1', [userId, id]);
  if (!current) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }

  const amount = req.body?.amount === undefined ? Number(current.amount) : Number(req.body.amount);
  const currency = req.body?.currency === undefined ? normalizeCurrency(current.currency) : normalizeCurrency(req.body.currency);
  const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId : current.categoryId;
  const type = req.body?.type === 'income' || req.body?.type === 'expense' ? req.body.type : current.type;
  const note = req.body?.note === undefined
    ? (current.note ?? '')
    : (typeof req.body.note === 'string' ? req.body.note.trim() : '');

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'amount must be > 0' });
    return;
  }
  if (!categoryId) {
    res.status(400).json({ error: 'categoryId is required' });
    return;
  }
  if (type !== 'income' && type !== 'expense') {
    res.status(400).json({ error: 'type must be income or expense' });
    return;
  }

  await db.run('UPDATE transactions SET amount = ?, currency = ?, categoryId = ?, type = ?, note = ? WHERE user_id = ? AND id = ?', [amount, currency, categoryId, type, note || null, userId, id]);
  const prevAccount = getAccountSlugFromNote(current.note);
  const nextAccount = getAccountSlugFromNote(note || '');
  if (prevAccount && prevAccount === nextAccount) {
    const delta = accountDeltaForTx({ amount, type }) - accountDeltaForTx(current);
    await applyAccountDelta(db, userId, prevAccount, delta);
  } else {
    await applyAccountDelta(db, userId, prevAccount, -accountDeltaForTx(current));
    await applyAccountDelta(db, userId, nextAccount, accountDeltaForTx({ amount, type }));
  }

  res.json({
    ...current,
    amount,
    currency,
    categoryId,
    type,
    note: note || undefined,
  });
});

app.delete('/api/transactions/:id', async (req, res) => {
  const userId = req.authUserId;
  const { id } = req.params;
  const current = await db.get('SELECT * FROM transactions WHERE user_id = ? AND id = ? LIMIT 1', [userId, id]);
  if (!current) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }
  await applyAccountDelta(db, userId, getAccountSlugFromNote(current.note), -accountDeltaForTx(current));
  await db.run('DELETE FROM transactions WHERE user_id = ? AND id = ?', [userId, id]);
  res.status(204).send();
});

app.get('/api/custom-categories', async (req, res) => {
  const userId = req.authUserId;
  const type = String(req.query.type ?? '');
  if (type !== 'income' && type !== 'expense') {
    res.status(400).json({ error: 'type query must be income or expense' });
    return;
  }

  const stored = await db.all(
    'SELECT id, type, name, icon, color, updatedAt FROM custom_categories WHERE user_id = ? AND type = ? ORDER BY updatedAt DESC',
    [userId, type]
  );

  const legacyRows = await db.all(
    'SELECT categoryId, MAX(date) AS lastUsedAt FROM transactions WHERE user_id = ? AND type = ? AND categoryId LIKE ? GROUP BY categoryId',
    [userId, type, 'custom:%']
  );

  const byId = new Map(stored.map((row) => [row.id, row]));
  for (const row of legacyRows) {
    if (byId.has(row.categoryId)) continue;
    const parsed = parseCustomCategoryId(row.categoryId);
    if (!parsed) continue;
    byId.set(row.categoryId, {
      id: row.categoryId,
      type,
      name: parsed.name,
      icon: parsed.icon,
      color: parsed.color,
      updatedAt: row.lastUsedAt,
    });
  }

async function runAutoReportsTick() {
  if (!bot) return;
  const users = await db.all('SELECT telegram_id AS telegramId, chat_id AS chatId, timezone FROM users');
  if (!Array.isArray(users) || users.length === 0) return;
  const nowIso = new Date().toISOString();
  for (const u of users) {
    const userId = String(u.telegramId ?? '');
    const chatId = Number(u.chatId);
    if (!userId || !Number.isFinite(chatId)) continue;
    const tz = normalizeTimeZone(u.timezone);
    const nowLocal = formatDatePartsForZone(nowIso, tz);
    if (!nowLocal?.day || !nowLocal?.time) continue;
    const settings = await getReportSettings(db, userId);
    if (nowLocal.time !== settings.sendTime) continue;
    const weekday = formatLocalWeekday(nowIso, tz);
    if (settings.autoWeekly && weekday === 'mon') {
      const slot = `${nowLocal.day}:${settings.sendTime}`;
      if (await shouldSendForSlot(db, userId, 'weekly', slot)) {
        await sendUserReport(db, userId, chatId, 'weekly', tz);
      }
    }
    if (settings.autoMonthly && nowLocal.day.endsWith('-01')) {
      const slot = `${nowLocal.day}:${settings.sendTime}`;
      if (await shouldSendForSlot(db, userId, 'monthly', slot)) {
        await sendUserReport(db, userId, chatId, 'monthly', tz);
      }
    }
    const reminders = await listReminders(db, userId);
    for (const reminder of reminders) {
      if (!reminder.enabled || nowLocal.time !== reminder.timeHHMM) continue;
      const slot = `${nowLocal.day}:${reminder.timeHHMM}`;
      if (await markReminderDelivery(db, userId, reminder.id, slot)) {
        await sendReminderMessage(db, userId, reminder, tz, chatId);
      }
    }
  }
}

  res.json(
    Array.from(byId.values()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  );
});

app.post('/api/custom-categories', async (req, res) => {
  const userId = req.authUserId;
  const type = req.body?.type;
  if (type !== 'income' && type !== 'expense') {
    res.status(400).json({ error: 'type must be income or expense' });
    return;
  }

  const rawName = typeof req.body?.name === 'string' ? req.body.name : '';
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const normalizedName = normalizeCategoryName(name);
  const icon = typeof req.body?.icon === 'string' && req.body.icon ? req.body.icon : 'Tag';
  const color = typeof req.body?.color === 'string' && /^#([0-9A-Fa-f]{6})$/.test(req.body.color)
    ? req.body.color
    : '#8E8E93';

  const existing = await db.get(
    'SELECT id, type, name, icon, color, updatedAt FROM custom_categories WHERE user_id = ? AND type = ? AND normalized_name = ? LIMIT 1',
    [userId, type, normalizedName]
  );
  if (existing) {
    res.status(200).json(existing);
    return;
  }

  const id = createCustomCategoryId(name, icon, color);
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO custom_categories (id, user_id, type, name, normalized_name, icon, color, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, type, name, normalizedName, icon, color, now, now]
  );

  res.status(201).json({ id, type, name, icon, color, updatedAt: now });
});

app.patch('/api/custom-categories/:id', async (req, res) => {
  const userId = req.authUserId;
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  const current = await db.get(
    'SELECT id, type, name, normalized_name, icon, color, updatedAt FROM custom_categories WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, id]
  );
  if (!current) {
    res.status(404).json({ error: 'Custom category not found' });
    return;
  }

  const rawName = typeof req.body?.name === 'string' ? req.body.name : current.name;
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const normalizedName = normalizeCategoryName(name);
  const icon = typeof req.body?.icon === 'string' && req.body.icon ? req.body.icon : current.icon;
  const color = typeof req.body?.color === 'string' && /^#([0-9A-Fa-f]{6})$/.test(req.body.color)
    ? req.body.color
    : current.color;

  const duplicate = await db.get(
    'SELECT id FROM custom_categories WHERE user_id = ? AND type = ? AND normalized_name = ? AND id != ? LIMIT 1',
    [userId, current.type, normalizedName, id]
  );
  if (duplicate) {
    res.status(409).json({ error: 'Category with this name already exists' });
    return;
  }

  const nextId = createCustomCategoryId(name, icon, color);
  const now = new Date().toISOString();
  await db.run('BEGIN');
  try {
    await db.run(
      `UPDATE custom_categories
       SET id = ?, name = ?, normalized_name = ?, icon = ?, color = ?, updatedAt = ?
       WHERE user_id = ? AND id = ?`,
      [nextId, name, normalizedName, icon, color, now, userId, id]
    );
    await db.run(
      'UPDATE transactions SET categoryId = ? WHERE user_id = ? AND categoryId = ?',
      [nextId, userId, id]
    );
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }

  res.json({
    id: nextId,
    type: current.type,
    name,
    icon,
    color,
    updatedAt: now,
  });
});

app.delete('/api/custom-categories/:id', async (req, res) => {
  const userId = req.authUserId;
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  const current = await db.get(
    'SELECT id, type FROM custom_categories WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, id]
  );
  const txTypeGuess = await db.get(
    'SELECT type FROM transactions WHERE user_id = ? AND categoryId = ? LIMIT 1',
    [userId, id]
  );
  const parsedLegacy = parseCustomCategoryId(id);

  if (!current && !txTypeGuess && !parsedLegacy) {
    res.status(404).json({ error: 'Custom category not found' });
    return;
  }

  const effectiveType = current?.type ?? (txTypeGuess?.type === 'income' ? 'income' : 'expense');
  const fallback = effectiveType === 'income' ? 'other_income' : 'other_expense';
  await db.run('BEGIN');
  try {
    await db.run('UPDATE transactions SET categoryId = ? WHERE user_id = ? AND categoryId = ?', [fallback, userId, id]);
    if (current) {
      await db.run('DELETE FROM custom_categories WHERE user_id = ? AND id = ?', [userId, id]);
    }
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }

  res.status(204).end();
});

app.get('/api/subscriptions', async (req, res) => {
  const userId = req.authUserId;
  await runSubscriptionAutopayForUser(userId);
  const rows = await db.all(
    `SELECT id, name, amount, cycle, nextChargeDate, note, active, createdAt, updatedAt
     FROM subscriptions
     WHERE user_id = ?
     ORDER BY active DESC, nextChargeDate ASC, createdAt DESC`
    ,
    [userId]
  );
  res.json(
    rows.map((row) => ({
      ...row,
      amount: Number(row.amount) || 0,
      active: Boolean(row.active),
    }))
  );
});

app.post('/api/subscriptions', async (req, res) => {
  const userId = req.authUserId;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  const amount = Number(req.body?.amount);
  const cycle = req.body?.cycle === 'yearly' ? 'yearly' : 'monthly';
  const nextChargeDate = typeof req.body?.nextChargeDate === 'string' ? req.body.nextChargeDate : '';
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'amount must be > 0' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextChargeDate)) {
    res.status(400).json({ error: 'nextChargeDate must be in YYYY-MM-DD format' });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO subscriptions (id, user_id, name, amount, cycle, nextChargeDate, note, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, userId, name, amount, cycle, nextChargeDate, note, now, now]
  );

  res.status(201).json({
    id,
    name,
    amount,
    cycle,
    nextChargeDate,
    note,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
});

app.patch('/api/subscriptions/:id', async (req, res) => {
  const userId = req.authUserId;
  const { id } = req.params;
  const current = await db.get('SELECT * FROM subscriptions WHERE user_id = ? AND id = ? LIMIT 1', [userId, id]);
  if (!current) {
    res.status(404).json({ error: 'Subscription not found' });
    return;
  }

  const name = typeof req.body?.name === 'string'
    ? req.body.name.trim().replace(/\s+/g, ' ')
    : current.name;
  const amount = req.body?.amount === undefined ? Number(current.amount) : Number(req.body.amount);
  const cycle = req.body?.cycle === undefined
    ? current.cycle
    : (req.body.cycle === 'yearly' ? 'yearly' : 'monthly');
  const nextChargeDate = req.body?.nextChargeDate === undefined
    ? current.nextChargeDate
    : String(req.body.nextChargeDate);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : (current.note ?? '');
  const active = req.body?.active === undefined ? Boolean(current.active) : Boolean(req.body.active);

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'amount must be > 0' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextChargeDate)) {
    res.status(400).json({ error: 'nextChargeDate must be in YYYY-MM-DD format' });
    return;
  }

  const now = new Date().toISOString();
  await db.run(
    `UPDATE subscriptions
     SET name = ?, amount = ?, cycle = ?, nextChargeDate = ?, note = ?, active = ?, updatedAt = ?
     WHERE user_id = ? AND id = ?`,
    [name, amount, cycle, nextChargeDate, note, active ? 1 : 0, now, userId, id]
  );
  res.json({
    ...current,
    name,
    amount,
    cycle,
    nextChargeDate,
    note,
    active,
    updatedAt: now,
  });
});

app.get('/api/planner', async (req, res) => {
  const userId = req.authUserId;
  const yearQ = String(req.query.year ?? '');
  const month = String(req.query.month ?? '');

  let likePattern;
  if (yearQ && /^\d{4}$/.test(yearQ)) {
    likePattern = `${yearQ}-%`;
  } else if (/^\d{4}-\d{2}$/.test(month)) {
    likePattern = `${month}-%`;
  } else {
    res
      .status(400)
      .json({ error: 'Query month=YYYY-MM or year=YYYY' });
    return;
  }

  const days = await db.all(
    'SELECT day, hasShift, workedHours, salaryRate, salaryAmount, salary_currency, note, updatedAt FROM planner_days WHERE day LIKE ? ORDER BY day ASC',
    [plannerDayKey(userId, likePattern)]
  );
  const entries = await db.all(
    `SELECT day, worked_hours, salary_amount, salary_currency, note, ended_at
     FROM planner_shift_entries
     WHERE user_id = ? AND day LIKE ?
     ORDER BY ended_at DESC`,
    [userId, likePattern]
  );

  const entriesByDay = new Map();
  for (const row of entries) {
    const key = String(row.day || '');
    if (!key) continue;
    const current = entriesByDay.get(key) ?? {
      workedHours: 0,
      salaryAmountUah: 0,
      salaryAmountPln: 0,
      entriesCount: 0,
      latestEndedAt: '',
      latestNote: '',
    };
    const hours = Math.max(0, Number(row.worked_hours) || 0);
    const amount = Math.max(0, Number(row.salary_amount) || 0);
    const currency = normalizeCurrency(row.salary_currency) === 'PLN' ? 'PLN' : 'UAH';
    current.workedHours += hours;
    if (currency === 'PLN') current.salaryAmountPln += amount;
    else current.salaryAmountUah += amount;
    current.entriesCount += 1;
    if (!current.latestEndedAt || String(row.ended_at || '') > current.latestEndedAt) {
      current.latestEndedAt = String(row.ended_at || '');
      current.latestNote = String(row.note || '').trim();
    }
    entriesByDay.set(key, current);
  }

  const mergedByDay = new Map();
  for (const row of days) {
    const dayIso = plannerDayFromStored(userId, row.day);
    const entryAgg = entriesByDay.get(dayIso);
    const basePay = Math.max(0, Number(row.salaryAmount) || 0);
    const baseCurrency = normalizeCurrency(row.salary_currency) === 'PLN' ? 'PLN' : 'UAH';
    const hasEntries = Boolean((entryAgg?.entriesCount || 0) > 0);
    const salaryAmountUah = hasEntries ? (entryAgg?.salaryAmountUah || 0) : (baseCurrency === 'UAH' ? basePay : 0);
    const salaryAmountPln = hasEntries ? (entryAgg?.salaryAmountPln || 0) : (baseCurrency === 'PLN' ? basePay : 0);
    const workedHours = hasEntries ? (entryAgg?.workedHours || 0) : (Number(row.workedHours) || 0);
    const merged = {
      day: dayIso,
      hasShift: Boolean(row.hasShift) || Boolean(entryAgg),
      workedHours,
      salaryRate: Number(row.salaryRate) || 0,
      salaryAmount: Number(row.salaryAmount) || 0,
      salaryCurrency: baseCurrency,
      salaryAmountUah,
      salaryAmountPln,
      shiftsCount: (entryAgg?.entriesCount || 0) + (Boolean(row.hasShift) && !(entryAgg?.entriesCount > 0) ? 1 : 0),
      note: String(row.note ?? '').trim() || String(entryAgg?.latestNote ?? '').trim(),
      updatedAt: row.updatedAt,
    };
    mergedByDay.set(dayIso, merged);
  }
  for (const [dayIso, entryAgg] of entriesByDay.entries()) {
    if (mergedByDay.has(dayIso)) continue;
    mergedByDay.set(dayIso, {
      day: dayIso,
      hasShift: true,
      workedHours: entryAgg.workedHours,
      salaryRate: 0,
      salaryAmount: 0,
      salaryCurrency: 'UAH',
      salaryAmountUah: entryAgg.salaryAmountUah,
      salaryAmountPln: entryAgg.salaryAmountPln,
      shiftsCount: entryAgg.entriesCount || 0,
      note: entryAgg.latestNote,
      updatedAt: entryAgg.latestEndedAt || new Date().toISOString(),
    });
  }

  res.json(
    Array.from(mergedByDay.values()).sort((a, b) => String(a.day).localeCompare(String(b.day)))
  );
});

app.get('/api/planner/shift-entries', async (req, res) => {
  const userId = req.authUserId;
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    res.status(400).json({ error: 'Query from/to must be YYYY-MM-DD and from <= to' });
    return;
  }
  const rows = await db.all(
    `SELECT id, day, started_at, ended_at, worked_hours, salary_rate, salary_amount, salary_currency, note, template_id
     FROM planner_shift_entries
     WHERE user_id = ? AND day >= ? AND day <= ?
     ORDER BY ended_at DESC`,
    [userId, from, to]
  );
  res.json(
    rows.map((row) => ({
      id: String(row.id),
      day: String(row.day),
      startedAt: String(row.started_at),
      endedAt: String(row.ended_at),
      workedHours: Math.max(0, Number(row.worked_hours) || 0),
      salaryRate: Math.max(0, Number(row.salary_rate) || 0),
      salaryAmount: Math.max(0, Number(row.salary_amount) || 0),
      salaryCurrency: normalizeCurrency(row.salary_currency) === 'PLN' ? 'PLN' : 'UAH',
      note: String(row.note ?? ''),
      templateId: row.template_id ? String(row.template_id) : null,
    }))
  );
});

app.get('/api/planner/:day/shifts', async (req, res) => {
  const userId = req.authUserId;
  const { day } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    res.status(400).json({ error: 'day param must be in YYYY-MM-DD format' });
    return;
  }
  const rows = await db.all(
    `SELECT id, day, started_at, ended_at, worked_hours, salary_rate, salary_amount, salary_currency, note, template_id
     FROM planner_shift_entries
     WHERE user_id = ? AND day = ?
     ORDER BY ended_at DESC`,
    [userId, day]
  );
  res.json(
    rows.map((row) => ({
      id: String(row.id),
      day: String(row.day),
      startedAt: String(row.started_at),
      endedAt: String(row.ended_at),
      workedHours: Math.max(0, Number(row.worked_hours) || 0),
      salaryRate: Math.max(0, Number(row.salary_rate) || 0),
      salaryAmount: Math.max(0, Number(row.salary_amount) || 0),
      salaryCurrency: normalizeCurrency(row.salary_currency) === 'PLN' ? 'PLN' : 'UAH',
      note: String(row.note ?? ''),
      templateId: row.template_id ? String(row.template_id) : null,
    }))
  );
});

app.post('/api/planner/:day/shifts', async (req, res) => {
  const userId = req.authUserId;
  const { day } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    res.status(400).json({ error: 'day param must be in YYYY-MM-DD format' });
    return;
  }
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const templateId = typeof body.templateId === 'string' ? body.templateId.trim() : '';
  let workedHours = Math.max(0, Number(body.workedHours) || 0);
  let salaryRate = Math.max(0, Number(body.salaryRate) || 0);
  let salaryAmount = Math.max(0, Number(body.salaryAmount) || 0);
  let salaryCurrency = normalizeCurrency(body.salaryCurrency) === 'PLN' ? 'PLN' : 'UAH';
  let note = typeof body.note === 'string' ? body.note.trim() : '';
  let resolvedTemplateId = null;

  if (templateId) {
    const tpl = await db.get(
      `SELECT id, name, symbol, worked_hours, salary_rate, salary_amount, currency
       FROM planner_shift_templates
       WHERE user_id = ? AND id = ?
       LIMIT 1`,
      [userId, templateId]
    );
    if (!tpl?.id) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    resolvedTemplateId = String(tpl.id);
    workedHours = Math.max(0, Number(tpl.worked_hours) || 0);
    salaryRate = Math.max(0, Number(tpl.salary_rate) || 0);
    salaryAmount = Math.max(0, Number(tpl.salary_amount) || 0);
    salaryCurrency = normalizeCurrency(tpl.currency) === 'PLN' ? 'PLN' : 'UAH';
    note = [String(tpl.name ?? '').trim(), String(tpl.symbol ?? '').trim()].filter(Boolean).join(' • ');
  }

  if (salaryAmount <= 0 && salaryRate > 0 && workedHours > 0) {
    salaryAmount = Number((salaryRate * workedHours).toFixed(2));
  }

  const nowIso = new Date().toISOString();
  const startedAt = typeof body.startedAt === 'string' && body.startedAt.trim() ? body.startedAt.trim() : nowIso;
  const endedAt = typeof body.endedAt === 'string' && body.endedAt.trim() ? body.endedAt.trim() : nowIso;
  const id = uuidv4();

  await db.run(
    `INSERT INTO planner_shift_entries
     (id, user_id, day, started_at, ended_at, worked_hours, salary_rate, salary_amount, salary_currency, note, template_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, day, startedAt, endedAt, workedHours, salaryRate, salaryAmount, salaryCurrency, note, resolvedTemplateId, nowIso, nowIso]
  );

  await upsertPlannerDay(db, userId, day, {
    hasShift: true,
    note: note || '',
  });

  res.status(201).json({
    id,
    day,
    startedAt,
    endedAt,
    workedHours,
    salaryRate,
    salaryAmount,
    salaryCurrency,
    note,
    templateId: resolvedTemplateId,
  });
});

app.put('/api/planner/shifts/:id', async (req, res) => {
  const userId = req.authUserId;
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const current = await db.get(
    `SELECT id, day, started_at, ended_at, worked_hours, salary_rate, salary_amount, salary_currency, note
     FROM planner_shift_entries
     WHERE user_id = ? AND id = ?
     LIMIT 1`,
    [userId, id]
  );
  if (!current?.id) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const workedHours = req.body.workedHours === undefined
    ? Math.max(0, Number(current.worked_hours) || 0)
    : Math.max(0, Number(req.body.workedHours) || 0);
  const salaryRate = req.body.salaryRate === undefined
    ? Math.max(0, Number(current.salary_rate) || 0)
    : Math.max(0, Number(req.body.salaryRate) || 0);
  let salaryAmount = req.body.salaryAmount === undefined
    ? Math.max(0, Number(current.salary_amount) || 0)
    : Math.max(0, Number(req.body.salaryAmount) || 0);
  if (salaryAmount <= 0 && salaryRate > 0 && workedHours > 0) {
    salaryAmount = Number((salaryRate * workedHours).toFixed(2));
  }
  const salaryCurrency = normalizeCurrency(req.body.salaryCurrency ?? current.salary_currency) === 'PLN' ? 'PLN' : 'UAH';
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : String(current.note ?? '');
  const startedAt = typeof req.body.startedAt === 'string' && req.body.startedAt.trim() ? req.body.startedAt.trim() : String(current.started_at);
  const endedAt = typeof req.body.endedAt === 'string' && req.body.endedAt.trim() ? req.body.endedAt.trim() : String(current.ended_at);
  const updatedAt = new Date().toISOString();
  await db.run(
    `UPDATE planner_shift_entries
     SET started_at = ?, ended_at = ?, worked_hours = ?, salary_rate = ?, salary_amount = ?, salary_currency = ?, note = ?, updated_at = ?
     WHERE user_id = ? AND id = ?`,
    [startedAt, endedAt, workedHours, salaryRate, salaryAmount, salaryCurrency, note, updatedAt, userId, id]
  );
  await upsertPlannerDay(db, userId, String(current.day), { hasShift: true, note });
  res.json({
    id,
    day: String(current.day),
    startedAt,
    endedAt,
    workedHours,
    salaryRate,
    salaryAmount,
    salaryCurrency,
    note,
    updatedAt,
  });
});

app.delete('/api/planner/shifts/:id', async (req, res) => {
  const userId = req.authUserId;
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const current = await db.get(
    'SELECT day FROM planner_shift_entries WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, id]
  );
  if (!current?.day) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  await db.run('DELETE FROM planner_shift_entries WHERE user_id = ? AND id = ?', [userId, id]);
  const remaining = await db.get(
    'SELECT COUNT(1) AS cnt FROM planner_shift_entries WHERE user_id = ? AND day = ?',
    [userId, String(current.day)]
  );
  if ((Number(remaining?.cnt) || 0) <= 0) {
    await upsertPlannerDay(db, userId, String(current.day), {
      hasShift: false,
      workedHours: 0,
      salaryRate: 0,
      salaryAmount: 0,
      salaryCurrency: 'UAH',
      note: '',
    });
  }
  res.status(204).end();
});

app.put('/api/planner/:day', async (req, res) => {
  const userId = req.authUserId;
  const { day } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    res.status(400).json({ error: 'day param must be in YYYY-MM-DD format' });
    return;
  }

  const hasShift = req.body.hasShift ? 1 : 0;
  const workedHours = Number(req.body.workedHours) || 0;
  const salaryRate = Number(req.body.salaryRate) || 0;
  const salaryAmount = Number(req.body.salaryAmount) || 0;
  const salaryCurrency = req.body.salaryCurrency === 'PLN' ? 'PLN' : 'UAH';
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  const updatedAt = new Date().toISOString();
  const dayKey = plannerDayKey(userId, day);

  await db.run(
    `INSERT INTO planner_days (day, user_id, hasShift, workedHours, salaryRate, salaryAmount, salary_currency, note, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET
      user_id = excluded.user_id,
       hasShift = excluded.hasShift,
       workedHours = excluded.workedHours,
       salaryRate = excluded.salaryRate,
       salaryAmount = excluded.salaryAmount,
       salary_currency = excluded.salary_currency,
       note = excluded.note,
       updatedAt = excluded.updatedAt`,
    [dayKey, userId, hasShift, workedHours, salaryRate, salaryAmount, salaryCurrency, note, updatedAt]
  );

  res.json({
    day,
    hasShift: Boolean(hasShift),
    workedHours,
    salaryRate,
    salaryAmount,
    salaryCurrency,
    note,
    updatedAt,
  });
});

const normalizeShiftTemplateKey = (name, symbol, currency) =>
  `${String(name).trim().toLowerCase()}::${String(symbol).trim().toLowerCase()}::${currency === 'PLN' ? 'PLN' : 'UAH'}`;

app.get('/api/planner/shift-templates', async (req, res) => {
  const userId = req.authUserId;
  const rows = await db.all(
    `SELECT id, name, symbol, is_full_day, start_time, end_time, worked_hours, salary_rate, salary_amount, currency, updated_at
     FROM planner_shift_templates
     WHERE user_id = ?
     ORDER BY updated_at DESC`
    ,
    [userId]
  );
  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name ?? '',
      symbol: row.symbol ?? '',
      isFullDay: Boolean(row.is_full_day),
      startTime: row.start_time ?? '09:00',
      endTime: row.end_time ?? '17:00',
      workedHours: Number(row.worked_hours) || 0,
      salaryRate: Number(row.salary_rate) || 0,
      salaryAmount: Number(row.salary_amount) || 0,
      salaryCurrency: normalizeCurrency(row.currency) === 'PLN' ? 'PLN' : 'UAH',
      updatedAt: row.updated_at,
    }))
  );
});

app.post('/api/planner/shift-templates', async (req, res) => {
  const userId = req.authUserId;
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const symbol = typeof req.body.symbol === 'string' ? req.body.symbol.trim() : '';
  if (!name && !symbol) {
    res.status(400).json({ error: 'name or symbol required' });
    return;
  }
  const isFullDay = Boolean(req.body.isFullDay);
  const startTime = typeof req.body.startTime === 'string' && /^\d{2}:\d{2}$/.test(req.body.startTime) ? req.body.startTime : '09:00';
  const endTime = typeof req.body.endTime === 'string' && /^\d{2}:\d{2}$/.test(req.body.endTime) ? req.body.endTime : '17:00';
  let workedHours = Number(req.body.workedHours);
  if (!Number.isFinite(workedHours) || workedHours < 0) workedHours = isFullDay ? 8 : 0;
  const salaryRate = Number.isFinite(Number(req.body.salaryRate)) ? Math.max(0, Number(req.body.salaryRate)) : 0;
  const salaryAmount = Number.isFinite(Number(req.body.salaryAmount)) ? Math.max(0, Number(req.body.salaryAmount)) : 0;
  const salaryCurrency = req.body.salaryCurrency === 'PLN' ? 'PLN' : 'UAH';

  const normalized_key = normalizeShiftTemplateKey(name, symbol, salaryCurrency);
  const normalizedKeyScoped = scopedTemplateKey(userId, normalized_key);
  const now = new Date().toISOString();
  const existing = await db.get('SELECT id FROM planner_shift_templates WHERE user_id = ? AND normalized_key = ?', [userId, normalizedKeyScoped]);
  const id = existing?.id ?? uuidv4();

  if (existing) {
    await db.run(
      `UPDATE planner_shift_templates SET
        name = ?, symbol = ?, is_full_day = ?, start_time = ?, end_time = ?, worked_hours = ?, salary_rate = ?, salary_amount = ?, currency = ?, updated_at = ?
       WHERE user_id = ? AND id = ?`,
      [name, symbol, isFullDay ? 1 : 0, startTime, endTime, workedHours, salaryRate, salaryAmount, salaryCurrency, now, userId, id]
    );
  } else {
    await db.run(
      `INSERT INTO planner_shift_templates
        (id, user_id, normalized_key, name, symbol, is_full_day, start_time, end_time, worked_hours, salary_rate, salary_amount, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, normalizedKeyScoped, name, symbol, isFullDay ? 1 : 0, startTime, endTime, workedHours, salaryRate, salaryAmount, salaryCurrency, now, now]
    );
  }

  res.json({
    id,
    name,
    symbol,
    isFullDay,
    startTime,
    endTime,
    workedHours,
    salaryRate,
    salaryAmount,
    salaryCurrency,
    updatedAt: now,
  });
});

app.delete('/api/planner/shift-templates/:id', async (req, res) => {
  const userId = req.authUserId;
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const result = await db.run('DELETE FROM planner_shift_templates WHERE user_id = ? AND id = ?', [userId, id]);
  if (!result.changes) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.status(204).end();
});

app.get('/api/planner/active-shift', async (req, res) => {
  const userId = req.authUserId;
  const active = await db.get(
    'SELECT started_at, started_day, template_id, salary_rate, salary_amount, salary_currency, shift_note FROM bot_active_shifts WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (!active) {
    res.json(null);
    return;
  }
  res.json({
    startedAt: active.started_at,
    startedDay: active.started_day,
    templateId: active.template_id,
    salaryRate: active.salary_rate,
    salaryAmount: active.salary_amount,
    salaryCurrency: active.salary_currency,
    shiftNote: active.shift_note
  });
});

app.post('/api/planner/active-shift/start', async (req, res) => {
  const userId = req.authUserId;
  const active = await db.get('SELECT started_at FROM bot_active_shifts WHERE user_id = ? LIMIT 1', [userId]);
  if (active) {
    res.status(400).json({ error: 'Shift already active' });
    return;
  }
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const { templateId, salaryRate, salaryAmount, salaryCurrency, shiftNote, startedAt, startedDay } = body;
  const now = new Date().toISOString();
  const userTimeZone = await getUserTimeZone(db, userId);
  const startIso = typeof startedAt === 'string' && startedAt.trim() ? startedAt : now;
  const startDayLocal =
    (typeof startedDay === 'string' && startedDay.trim()) ||
    dayFromIsoInZone(startIso, userTimeZone) ||
    startIso.slice(0, 10);
  let resolvedTemplateId = null;
  let resolvedSalaryRate = Number(salaryRate) || 0;
  let resolvedSalaryAmount = Number(salaryAmount) || 0;
  let resolvedSalaryCurrency = normalizeCurrency(salaryCurrency) === 'PLN' ? 'PLN' : 'UAH';
  let resolvedShiftNote = shiftNote || '';
  if (typeof templateId === 'string' && templateId.trim()) {
    const tpl = await db.get(
      `SELECT id, name, symbol, salary_rate, salary_amount, currency
       FROM planner_shift_templates
       WHERE user_id = ? AND id = ?
       LIMIT 1`,
      [userId, templateId.trim()]
    );
    if (!tpl?.id) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    resolvedTemplateId = String(tpl.id);
    resolvedSalaryRate = Math.max(0, Number(tpl.salary_rate) || 0);
    resolvedSalaryAmount = Math.max(0, Number(tpl.salary_amount) || 0);
    resolvedSalaryCurrency = normalizeCurrency(tpl.currency) === 'PLN' ? 'PLN' : 'UAH';
    resolvedShiftNote = [String(tpl.name ?? '').trim(), String(tpl.symbol ?? '').trim()].filter(Boolean).join(' • ');
  }
  await db.run(
    `INSERT INTO bot_active_shifts
     (user_id, started_at, started_day, template_id, salary_rate, salary_amount, salary_currency, shift_note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      startIso,
      startDayLocal,
      resolvedTemplateId,
      resolvedSalaryRate,
      resolvedSalaryAmount,
      resolvedSalaryCurrency,
      resolvedShiftNote,
      now
    ]
  );
  res.json({ success: true });
});

app.post('/api/planner/active-shift/end', async (req, res) => {
  const userId = req.authUserId;
  const active = await db.get(
    'SELECT started_at, started_day, template_id, salary_rate, salary_amount, salary_currency, shift_note FROM bot_active_shifts WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (!active) {
    res.status(400).json({ error: 'No active shift' });
    return;
  }
  const deleteActive = await db.run(
    'DELETE FROM bot_active_shifts WHERE user_id = ? AND started_at = ?',
    [userId, active.started_at]
  );
  if (!deleteActive?.changes) {
    res.status(409).json({ error: 'Shift already ended' });
    return;
  }
  
  const now = new Date();
  const startedAtDate = new Date(active.started_at);
  const diffHours = Math.max(0, (now.getTime() - startedAtDate.getTime()) / (1000 * 60 * 60));
  const roundedHours = Number(diffHours.toFixed(2));
  
  const userTimeZone = await getUserTimeZone(db, userId);
  const day = String(active.started_day || dayFromIsoInZone(active.started_at, userTimeZone) || active.started_at.slice(0, 10));
  const shiftSalaryRate = Number(active.salary_rate) || 0;
  const shiftSalaryAmount = Number(active.salary_amount) || 0;
  const shiftSalaryCurrency = normalizeCurrency(active.salary_currency) === 'PLN' ? 'PLN' : 'UAH';
  const baseNote = String(active.shift_note ?? '').trim();
  let salaryAmount = shiftSalaryAmount;
  if (salaryAmount <= 0 && shiftSalaryRate > 0 && roundedHours > 0) {
    salaryAmount = Number((shiftSalaryRate * roundedHours).toFixed(2));
  }
  const entryNote = baseNote || buildBotShiftNote(active.started_at, now.toISOString(), userTimeZone);
  const nowIso = now.toISOString();
  await db.run(
    `INSERT INTO planner_shift_entries
     (id, user_id, day, started_at, ended_at, worked_hours, salary_rate, salary_amount, salary_currency, note, template_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      userId,
      day,
      String(active.started_at),
      nowIso,
      roundedHours,
      Math.max(0, shiftSalaryRate),
      Math.max(0, salaryAmount),
      shiftSalaryCurrency,
      entryNote,
      active.template_id ? String(active.template_id) : null,
      nowIso,
      nowIso,
    ]
  );
  await upsertPlannerDay(db, userId, day, {
    hasShift: true,
    note: entryNote,
  });
  
  const dayTotals = await db.get(
    `SELECT COALESCE(SUM(worked_hours), 0) AS total_hours
     FROM planner_shift_entries
     WHERE user_id = ? AND day = ?`,
    [userId, day]
  );
  res.json({ success: true, roundedHours, totalHours: Number(dayTotals?.total_hours) || roundedHours, day });
});

app.use((err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const message = err?.message || 'Internal server error';
  const status = message.includes('CORS') ? 403 : 500;
  res.status(status).json({ error: message, code: status === 403 ? 'CORS_DENIED' : 'INTERNAL_ERROR' });
});

// Serve index.html for any other requests (SPA fallback)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
