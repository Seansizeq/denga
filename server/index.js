import express from 'express';
import cors from 'cors';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import PImage from 'pureimage';
import { getDatabasePath, initDb } from './db.js';
import { startScheduledDatabaseBackups } from './backup.js';
import { createReceiptScanHandler } from './receipt-scan.js';
import { getTransactionAccountEffects, validateTransferPayload } from './transaction-effects.js';
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
const applyAccountDelta = async (dbConn, userId, accountKey, delta) => {
  if (!accountKey || !Number.isFinite(delta) || delta === 0) return;
  await dbConn.run(
    'UPDATE account_portfolio SET primary_amount = primary_amount + ?, updatedAt = ? WHERE user_id = ? AND account_key = ?',
    [delta, new Date().toISOString(), userId, accountKey]
  );
};
const applyTransactionEffects = async (dbConn, userId, tx, multiplier = 1) => {
  for (const effect of getTransactionAccountEffects(tx)) {
    await applyAccountDelta(dbConn, userId, effect.accountKey, effect.delta * multiplier);
  }
};
const getAccountsByKeys = async (dbConn, userId, keys) => {
  const unique = Array.from(
    new Set(
      (keys || [])
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (unique.length === 0) return new Map();
  const placeholders = unique.map(() => '?').join(', ');
  const rows = await dbConn.all(
    `SELECT account_key AS accountKey, primary_currency AS primaryCurrency
     FROM account_portfolio
     WHERE user_id = ? AND account_key IN (${placeholders})`,
    [userId, ...unique]
  );
  return new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [
      String(row.accountKey ?? '').trim().toLowerCase(),
      {
        accountKey: String(row.accountKey ?? '').trim().toLowerCase(),
        primaryCurrency: normalizeCurrency(row.primaryCurrency),
      },
    ])
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
const CRYPTO_HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;
let cryptoHistoryCache = null;
let cryptoHistoryFetchedAt = 0;

const COINGECKO_ID_TO_SYMBOL = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
  'the-open-network': 'TON',
  tether: 'USDT',
};
const COINGECKO_CHART_IDS = Object.keys(COINGECKO_ID_TO_SYMBOL);

const fetchOneCoinMarketChartUsd = async (coinId) => {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=30`,
    { headers: { accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`chart ${coinId} ${res.status}`);
  const data = await res.json();
  const prices = data?.prices;
  if (!Array.isArray(prices) || prices.length === 0) throw new Error(`no prices ${coinId}`);
  const oldest = Number(prices[0][1]);
  const newest = Number(prices[prices.length - 1][1]);
  if (!Number.isFinite(oldest) || !Number.isFinite(newest) || oldest <= 0 || newest <= 0) {
    throw new Error(`bad chart nums ${coinId}`);
  }
  return { past: oldest, now: newest };
};

const fetchCryptoUsdHistory = async () => {
  const nowMs = Date.now();
  if (cryptoHistoryCache && nowMs - cryptoHistoryFetchedAt < CRYPTO_HISTORY_CACHE_TTL_MS) {
    return { ...cryptoHistoryCache, ok: true, source: 'cache' };
  }
  try {
    const charts = await Promise.all(
      COINGECKO_CHART_IDS.map((id) => fetchOneCoinMarketChartUsd(id).then((r) => ({ id, ...r })))
    );
    const prices30dAgo = {};
    const pricesNow = {};
    for (const row of charts) {
      const sym = COINGECKO_ID_TO_SYMBOL[row.id];
      if (sym) {
        prices30dAgo[sym] = row.past;
        pricesNow[sym] = row.now;
      }
    }
    const symbols = Object.values(COINGECKO_ID_TO_SYMBOL);
    const allOk = symbols.every(
      (s) =>
        Number.isFinite(prices30dAgo[s]) &&
        prices30dAgo[s] > 0 &&
        Number.isFinite(pricesNow[s]) &&
        pricesNow[s] > 0
    );
    if (!allOk) throw new Error('incomplete history');
    cryptoHistoryCache = {
      prices30dAgo,
      pricesNow,
      updatedAt: new Date().toISOString(),
    };
    cryptoHistoryFetchedAt = nowMs;
    return { ...cryptoHistoryCache, ok: true, source: 'live' };
  } catch (e) {
    if (cryptoHistoryCache) {
      return { ...cryptoHistoryCache, ok: true, source: 'cache' };
    }
    return {
      ok: false,
      prices30dAgo: {},
      pricesNow: {},
      updatedAt: new Date(0).toISOString(),
      source: 'unavailable',
    };
  }
};
/** Same math as src/utils/currency.ts — for server-side budget / FX logic */
const convertCurrencyServer = (amount, from, to, fxPayload) => {
  const fromC = normalizeCurrency(from);
  const toC = normalizeCurrency(to);
  if (!Number.isFinite(amount)) return 0;
  if (fromC === toC) return amount;
  const rates = fxPayload?.rates ?? FX_FALLBACK.rates;
  const fromRate = rates[fromC] ?? FX_FALLBACK.rates[fromC];
  const toRate = rates[toC] ?? FX_FALLBACK.rates[toC];
  if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) return amount;
  return (amount / fromRate) * toRate;
};

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
    `SELECT id, name, amount, currency, categoryId, cycle, nextChargeDate, note
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
      const subCurrency = normalizeCurrency(sub.currency);
      let due = parseIsoDate(String(sub.nextChargeDate ?? ''));
      if (!due || !Number.isFinite(amount) || amount <= 0) continue;

      let nextDue = due;
      let safetyCounter = 0;
      while (toIsoDate(nextDue) <= todayIso) {
        const txDate = `${toIsoDate(nextDue)}T12:00:00.000Z`;
        const note = buildSubscriptionChargeNote(sub);
        const subCategoryId = typeof sub.categoryId === 'string' && sub.categoryId.trim()
          ? sub.categoryId
          : 'other_expense';
        const tx = {
          id: uuidv4(),
          user_id: userId,
          amount,
          currency: subCurrency,
          categoryId: subCategoryId,
          type: 'expense',
          date: txDate,
          note: note || undefined,
        };
        await db.run(
          'INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [tx.id, tx.user_id, tx.amount, tx.currency, tx.categoryId, tx.type, tx.date, tx.note ?? null]
        );
        await applyTransactionEffects(db, userId, tx);
        if (bot) {
          const chatRow = await db.get('SELECT chat_id AS chatId FROM users WHERE telegram_id = ? LIMIT 1', [Number(userId)]);
          const cid = Number(chatRow?.chatId);
          if (Number.isFinite(cid) && cid > 0) {
            try {
              await bot.sendMessage(
                cid,
                `${CATEGORY_EMOJI[subCategoryId] ?? '💳'} ${sub.name} −${Number(amount).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} ${tx.currency} · підписка`
              );
            } catch (e) {
              console.error('[subscriptions] autopay telegram notify failed', e);
            }
          }
        }
        await checkBudgetThresholdsAfterExpense(userId, tx.categoryId);
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
const getPreviousFullMonthDaySet = (todayDay) => {
  const [yRaw, mRaw] = String(todayDay).split('-');
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return getMonthDaySet(todayDay);
  const pad = (n) => String(n).padStart(2, '0');
  const currentMonthFirst = `${y}-${pad(m)}-01`;
  const previousMonthLast = shiftIsoDay(currentMonthFirst, -1);
  const [pyRaw, pmRaw] = previousMonthLast.split('-');
  const py = Number(pyRaw);
  const pm = Number(pmRaw);
  if (!Number.isFinite(py) || !Number.isFinite(pm)) return getMonthDaySet(todayDay);
  const previousMonthFirst = `${py}-${pad(pm)}-01`;
  const set = new Set();
  let cur = previousMonthFirst;
  while (cur <= previousMonthLast) {
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
const formatHoursAsHoursMinutes = (decimalHours, units = { h: 'год', m: 'хв' }) => {
  const total = Math.max(0, Number(decimalHours) || 0);
  let totalMinutes = Math.round(total * 60);
  let hours = Math.floor(totalMinutes / 60);
  let minutes = totalMinutes - hours * 60;
  if (minutes === 60) {
    hours += 1;
    minutes = 0;
  }
  if (hours === 0 && minutes === 0) return `0 ${units.h}`;
  if (hours === 0) return `${minutes} ${units.m}`;
  if (minutes === 0) return `${hours} ${units.h}`;
  return `${hours} ${units.h} ${minutes} ${units.m}`;
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
const reminderKinds = new Set([
  'daily',
  'subscriptions',
  'inactivity',
  'shift_evening_before',
  'shift_unclosed',
  'fx_change',
]);
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
  if (!kinds.has('inactivity')) {
    await dbConn.run(
      `INSERT INTO user_reminders (id, user_id, kind, title, enabled, time_hhmm, lead_days, created_at, updated_at)
       VALUES (?, ?, 'inactivity', 'Нагадування про відсутність витрат', 0, '20:00', 3, ?, ?)`,
      [uuidv4(), userId, now, now]
    );
  }
  if (!kinds.has('shift_evening_before')) {
    await dbConn.run(
      `INSERT INTO user_reminders (id, user_id, kind, title, enabled, time_hhmm, lead_days, created_at, updated_at)
       VALUES (?, ?, 'shift_evening_before', 'Нагадування: зміна завтра', 0, '21:00', 1, ?, ?)`,
      [uuidv4(), userId, now, now]
    );
  }
  if (!kinds.has('shift_unclosed')) {
    await dbConn.run(
      `INSERT INTO user_reminders (id, user_id, kind, title, enabled, time_hhmm, lead_days, created_at, updated_at)
       VALUES (?, ?, 'shift_unclosed', 'Нагадування: закрити зміну', 0, '23:00', 0, ?, ?)`,
      [uuidv4(), userId, now, now]
    );
  }
  if (!kinds.has('fx_change')) {
    await dbConn.run(
      `INSERT INTO user_reminders (id, user_id, kind, title, enabled, time_hhmm, lead_days, created_at, updated_at)
       VALUES (?, ?, 'fx_change', 'Нагадування: зміна курсу валют', 0, '09:00', 5, ?, ?)`,
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
     ORDER BY kind ASC, created_at ASC`,
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

/** ISO string includes Z or a numeric offset — parse as a single UTC instant. */
const isoHasExplicitOffset = (s) =>
  /[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s);

/**
 * Calendar date + wall time in `timeZone` → UTC ms. Used when clients send naive ISO without offset.
 * Bot/web paths that call toISOString() always include Z and skip this.
 */
const wallDateTimeInZoneToUtcMs = (ymd, hh, mm, ss, timeZone) => {
  const tz = normalizeTimeZone(timeZone);
  const [y, mo, d] = String(ymd).split('-').map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return NaN;
  const wantDay = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const pad2 = (n) => String(Math.trunc(Number(n))).padStart(2, '0');
  const wantTime = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const read = (utcMs) => {
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(utcMs)).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
    );
    return {
      day: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${parts.hour}:${parts.minute}:${parts.second}`,
    };
  };
  let t = Date.UTC(y, mo - 1, d, Number(hh), Number(mm), Number(ss), 0);
  for (let i = 0; i < 48; i++) {
    const got = read(t);
    if (got.day === wantDay && got.time === wantTime) return t;
    const [gy, gm, gd] = got.day.split('-').map(Number);
    const dayDelta = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(gy, gm - 1, gd)) / 86400000);
    const [gh, gmi, gs] = got.time.split(':').map(Number);
    const wantSec = Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
    const gotSec = gh * 3600 + gmi * 60 + gs;
    const secDelta = wantSec - gotSec;
    const deltaMs = dayDelta * 86400000 + secDelta * 1000;
    if (deltaMs === 0) break;
    t += deltaMs;
  }
  const verify = read(t);
  return verify.day === wantDay && verify.time === wantTime ? t : NaN;
};

/** Interpret stored shift start time: explicit offset = instant; naive YYYY-MM-DDTHH:mm:ss = wall clock in user TZ. */
const shiftStartedAtToUtcMs = (raw, userTimeZone) => {
  const s = String(raw ?? '').trim();
  if (!s) return NaN;
  if (isoHasExplicitOffset(s)) {
    const ms = new Date(s).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, ymd, hh, mm, ss = '00'] = m;
    return wallDateTimeInZoneToUtcMs(ymd, Number(hh), Number(mm), Number(ss), userTimeZone);
  }
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : NaN;
};

const normalizeClientShiftStartIso = (raw, fallbackIso, userTimeZone) => {
  const s = typeof raw === 'string' && raw.trim() ? raw.trim() : '';
  if (!s) return fallbackIso;
  if (isoHasExplicitOffset(s)) {
    const ms = new Date(s).getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : fallbackIso;
  }
  const ms = shiftStartedAtToUtcMs(s, userTimeZone);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : fallbackIso;
};

const recordReminderDeliveryAfterSend = async (dbConn, userId, reminderId, slotKey) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await markReminderDelivery(dbConn, userId, reminderId, slotKey)) return;
    await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
  }
  console.error('[reminders] failed to record delivery after successful send', { userId, reminderId, slotKey });
};

const calendarDaysBetween = (fromDay, toDay) => {
  const a = new Date(`${String(fromDay).slice(0, 10)}T12:00:00.000Z`);
  const b = new Date(`${String(toDay).slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / (86400 * 1000));
};

const dispatchReminder = async (dbConn, userId, reminder, timeZone, chatId, slotKey) => {
  if (!bot) return;
  const nowIso = new Date().toISOString();
  const tz = normalizeTimeZone(timeZone);
  const today = dayFromIsoInZone(nowIso, tz) || nowIso.slice(0, 10);
  const kind = String(reminder.kind || '');
  const recordSlot = async () => recordReminderDeliveryAfterSend(dbConn, userId, reminder.id, slotKey);

  const sendTracked = async (text) => {
    await bot.sendMessage(chatId, text);
    await recordSlot();
  };

  try {
    if (kind === 'daily') {
      await sendTracked(`⏰ Нагадування: ${String(reminder.title || 'Внести витрати')}`);
      return;
    }

    if (kind === 'subscriptions') {
      const target = shiftIsoDay(today, Number(reminder.leadDays || 0));
      const due = await dbConn.all(
        `SELECT name, amount, currency, nextChargeDate
         FROM subscriptions
         WHERE user_id = ? AND active = 1 AND nextChargeDate = ?
         ORDER BY nextChargeDate ASC`,
        [userId, target]
      );
      if (!Array.isArray(due) || due.length === 0) return;
      const lines = [`🔔 ${String(reminder.title || 'Нагадування про підписки')} (${target})`];
      due.slice(0, 10).forEach((sub, idx) => {
        const cur = normalizeCurrency(sub.currency);
        lines.push(`${idx + 1}. ${sub.name} — ${Number(sub.amount || 0).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} ${cur}`);
      });
      await sendTracked(lines.join('\n'));
      return;
    }

    if (kind === 'inactivity') {
      const n = Math.max(1, Math.min(90, Number(reminder.leadDays) || 3));
      const row = await dbConn.get(
        `SELECT MAX(date) AS d FROM transactions WHERE user_id = ? AND type = 'expense'`,
        [userId]
      );
      let daysSince = 9999;
      if (row?.d) {
        const lastDay = dayFromIsoInZone(String(row.d), tz) || String(row.d).slice(0, 10);
        daysSince = calendarDaysBetween(lastDay, today);
      }
      if (daysSince < n) return;
      await sendTracked(
        `📭 ${String(reminder.title || 'Витрати')}: за останні ${n} д. немає записів витрат. Додай операцію в Denga.`
      );
      return;
    }

    if (kind === 'shift_evening_before') {
      const offset = Math.max(1, Math.min(30, Number(reminder.leadDays) || 1));
      const targetDay = shiftIsoDay(today, offset);
      const plannerKey = plannerDayKey(userId, targetDay);
      const hit = await dbConn.get(
        `SELECT 1 AS ok FROM planner_days WHERE day = ? AND hasShift = 1 LIMIT 1`,
        [plannerKey]
      );
      if (!hit?.ok) return;
      await sendTracked(
        `📅 ${String(reminder.title || 'Зміна')}: ${offset === 1 ? 'завтра' : `через ${offset} д.`} (${targetDay}) запланована зміна.`
      );
      return;
    }

    if (kind === 'shift_unclosed') {
      const active = await dbConn.get(
        `SELECT started_at AS startedAt FROM bot_active_shifts WHERE user_id = ? LIMIT 1`,
        [userId]
      );
      if (!active?.startedAt) return;
      const startedMs = shiftStartedAtToUtcMs(active.startedAt, tz);
      if (!Number.isFinite(startedMs)) return;
      const hoursOpen = (Date.now() - startedMs) / (3600 * 1000);
      if (hoursOpen < 8) return;
      await sendTracked(
        `⏱ ${String(reminder.title || 'Зміна')}: зміна відкрита вже понад 8 год. Не забудь закрити її в Denga або ботом.`
      );
      return;
    }

    if (kind === 'fx_change') {
      const thresholdPct = Math.max(1, Math.min(100, Number(reminder.leadDays) || 5));
      const fx = await fetchFxRates();
      const rates = fx?.rates ?? FX_FALLBACK.rates;
      const uRow = await dbConn.get('SELECT fx_baseline_json AS fxBaseline FROM users WHERE telegram_id = ? LIMIT 1', [
        Number(userId),
      ]);
      let baseline = {};
      try {
        baseline = JSON.parse(String(uRow?.fxBaseline || '{}'));
      } catch {
        baseline = {};
      }
      if (!Number.isFinite(baseline.PLN) || !Number.isFinite(baseline.UAH)) {
        await dbConn.run(`UPDATE users SET fx_baseline_json = ? WHERE telegram_id = ?`, [
          JSON.stringify({ PLN: rates.PLN, UAH: rates.UAH }),
          Number(userId),
        ]);
        return;
      }
      const lines = [];
      for (const code of ['PLN', 'UAH']) {
        const cur = Number(rates[code]);
        const base = Number(baseline[code]);
        if (!Number.isFinite(cur) || cur <= 0 || !Number.isFinite(base) || base <= 0) continue;
        const pct = Math.abs((cur - base) / base) * 100;
        if (pct >= thresholdPct) {
          lines.push(`• ${code}/USD: ~${pct.toFixed(1)}% (було ${base.toFixed(4)} → ${cur.toFixed(4)})`);
        }
      }
      if (lines.length === 0) return;
      await bot.sendMessage(
        chatId,
        `💱 ${String(reminder.title || 'Курс')}\n${lines.join('\n')}\nДжерело: ${fx?.source ?? 'n/a'}`
      );
      await recordSlot();
      await dbConn.run(`UPDATE users SET fx_baseline_json = ? WHERE telegram_id = ?`, [
        JSON.stringify({ PLN: rates.PLN, UAH: rates.UAH }),
        Number(userId),
      ]);
    }
  } catch (e) {
    console.error('[reminders] telegram send failed', { kind, userId, message: e?.message });
  }
};

const sendTelegramIfLinked = async (tgUserId, text) => {
  if (!bot) return;
  const u = await db.get('SELECT chat_id AS chatId FROM users WHERE telegram_id = ? LIMIT 1', [Number(tgUserId)]);
  const cid = Number(u?.chatId);
  if (!Number.isFinite(cid) || cid <= 0) return;
  try {
    await bot.sendMessage(cid, text);
  } catch (e) {
    console.error('[telegram] send failed', e);
  }
};

const checkBudgetThresholdsAfterExpense = async (userId, categoryId) => {
  if (!categoryId || !userId) return;
  const budget = await db.get(
    `SELECT monthly_limit AS monthlyLimit, currency FROM category_budgets WHERE user_id = ? AND category_id = ? LIMIT 1`,
    [userId, categoryId]
  );
  if (!budget || !(Number(budget.monthlyLimit) > 0)) return;
  const userRow = await db.get('SELECT timezone FROM users WHERE telegram_id = ? LIMIT 1', [Number(userId)]);
  const tz = normalizeTimeZone(userRow?.timezone);
  const nowIso = new Date().toISOString();
  const today = dayFromIsoInZone(nowIso, tz) || nowIso.slice(0, 10);
  const ym = today.slice(0, 7);
  const fx = await fetchFxRates();
  const budgetCur = normalizeCurrency(budget.currency);
  const txs = await db.all(
    `SELECT amount, currency, date FROM transactions WHERE user_id = ? AND type = 'expense' AND categoryId = ?`,
    [userId, categoryId]
  );
  let sum = 0;
  for (const tx of txs) {
    const d = dayFromIsoInZone(String(tx.date), tz);
    if (!String(d).startsWith(ym)) continue;
    sum += convertCurrencyServer(Number(tx.amount), normalizeCurrency(tx.currency), budgetCur, fx);
  }
  const limit = Number(budget.monthlyLimit);
  if (!(limit > 0)) return;
  const ratio = sum / limit;
  const tryInsertAlert = async (level) => {
    try {
      await db.run(
        `INSERT INTO budget_alerts (user_id, category_id, year_month, level, created_at) VALUES (?, ?, ?, ?, ?)`,
        [userId, categoryId, ym, level, new Date().toISOString()]
      );
      return true;
    } catch {
      return false;
    }
  };
  if (ratio >= 1) {
    if (await tryInsertAlert('100')) {
      await sendTelegramIfLinked(
        userId,
        `📛 Бюджет «${categoryId}»: витрачено 100%+ ліміту за ${ym} (${sum.toFixed(0)} / ${limit.toFixed(0)} ${budgetCur}).`
      );
    }
  } else if (ratio >= 0.8) {
    if (await tryInsertAlert('80')) {
      await sendTelegramIfLinked(
        userId,
        `⚠️ Бюджет «${categoryId}»: ~${Math.min(99, Math.round(ratio * 100))}% ліміту за ${ym}.`
      );
    }
  }
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
const summarizeTransactions = (txs, targetCurrency = 'UAH', fxPayload = FX_FALLBACK) => {
  let income = 0;
  let expense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  const byCategory = new Map();
  const reportCurrency = normalizeCurrency(targetCurrency);
  for (const tx of txs) {
    const amount = convertCurrencyServer(
      Number(tx.amount) || 0,
      normalizeCurrency(tx.currency),
      reportCurrency,
      fxPayload
    );
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
    .slice(0, 5);
  const topIncome = Array.from(byCategory.entries())
    .map(([categoryId, v]) => ({ categoryId, amount: v.income }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  return { income, expense, net: income - expense, incomeCount, expenseCount, topExpenses, topIncome };
};
const buildPreviousPeriodDaySet = (reportType, currentSet) => {
  const sorted = Array.from(currentSet || []).sort();
  if (!sorted.length) return new Set();
  if (reportType === 'weekly') {
    return new Set(sorted.map((day) => shiftIsoDay(day, -7)));
  }
  const firstDay = sorted[0];
  return getPreviousFullMonthDaySet(firstDay);
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
  if (base) return base;
  const custom = parseCustomCategoryId(String(id ?? ''));
  if (custom?.name) return custom.name;
  return String(id);
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
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const formatMoney = (value) => Math.abs(Number(value) || 0).toLocaleString('uk-UA', { maximumFractionDigits: 2 });
const sumExpenseByCategory = (txs, targetCurrency = 'UAH', fxPayload = FX_FALLBACK) => {
  const map = new Map();
  for (const tx of txs || []) {
    if (tx?.type !== 'expense') continue;
    const amount = Math.max(
      0,
      convertCurrencyServer(
        Number(tx.amount) || 0,
        normalizeCurrency(tx.currency),
        normalizeCurrency(targetCurrency),
        fxPayload
      )
    );
    if (!(amount > 0)) continue;
    map.set(tx.categoryId, (map.get(tx.categoryId) ?? 0) + amount);
  }
  return map;
};
const parseAdvicePeriodDays = (raw) => {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 7;
  if (['week', 'тиждень', 'неделя', '7', '7d'].includes(v)) return 7;
  if (['month', 'місяць', 'месяц', '30', '30d'].includes(v)) return 30;
  return 7;
};
const collectBudgetRisks = async (dbConn, userId, txs, today, tz, fxPayload) => {
  const rows = await dbConn.all(
    `SELECT category_id AS categoryId, monthly_limit AS monthlyLimit, currency
     FROM category_budgets
     WHERE user_id = ?`,
    [userId]
  );
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const ym = String(today || '').slice(0, 7);
  const risks = [];
  for (const row of rows) {
    const limit = Number(row?.monthlyLimit);
    if (!(limit > 0)) continue;
    const budgetCurrency = normalizeCurrency(row?.currency);
    let spent = 0;
    for (const tx of txs || []) {
      if (tx?.type !== 'expense' || tx?.categoryId !== row.categoryId) continue;
      const txDay = dayFromIsoInZone(String(tx.date), tz);
      if (!String(txDay).startsWith(ym)) continue;
      spent += convertCurrencyServer(Number(tx.amount) || 0, normalizeCurrency(tx.currency), budgetCurrency, fxPayload);
    }
    const ratio = spent / limit;
    if (ratio >= 0.8) {
      risks.push({
        categoryId: row.categoryId,
        spent,
        limit,
        budgetCurrency,
        ratio,
      });
    }
  }
  return risks.sort((a, b) => b.ratio - a.ratio);
};
const getGoalNudge = async (dbConn, userId, freeCash) => {
  if (!(Number(freeCash) > 0)) return null;
  const rows = await dbConn.all(
    `SELECT
       g.id AS id,
       g.name AS name,
       g.target_amount AS targetAmount,
       g.currency AS currency,
       COALESCE(SUM(c.amount), 0) AS saved
     FROM goals g
     LEFT JOIN goal_contributions c ON c.goal_id = g.id AND c.user_id = g.user_id
     WHERE g.user_id = ? AND g.archived = 0
     GROUP BY g.id, g.name, g.target_amount, g.currency
     ORDER BY g.updated_at DESC`,
    [userId]
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const active = rows
    .map((r) => ({
      id: String(r.id),
      name: String(r.name || 'Ціль'),
      targetAmount: Math.max(0, Number(r.targetAmount) || 0),
      saved: Math.max(0, Number(r.saved) || 0),
      currency: normalizeCurrency(r.currency),
    }))
    .filter((g) => g.targetAmount > g.saved);
  if (active.length === 0) return null;
  active.sort((a, b) => (a.targetAmount - a.saved) - (b.targetAmount - b.saved));
  const goal = active[0];
  const remaining = Math.max(0, goal.targetAmount - goal.saved);
  const suggested = Math.max(1, Math.round(Math.min(remaining, Number(freeCash) * 0.3)));
  return {
    ...goal,
    remaining,
    suggested,
  };
};
const buildRecommendationItems = async ({
  dbConn,
  userId,
  txs,
  currentTxs,
  previousTxs,
  periodDays,
  today,
  tz,
  reportCurrency,
}) => {
  const fx = await fetchFxRates();
  const summary = summarizeTransactions(currentTxs, reportCurrency, fx);
  const prevSummary = summarizeTransactions(previousTxs, reportCurrency, fx);
  const currentExpenseByCategory = sumExpenseByCategory(currentTxs, reportCurrency, fx);
  const previousExpenseByCategory = sumExpenseByCategory(previousTxs, reportCurrency, fx);
  const totalExpense = Math.max(0, Number(summary.expense) || 0);
  const candidates = [];

  const budgetRisks = await collectBudgetRisks(dbConn, userId, txs, today, tz, fx);
  if (budgetRisks.length > 0) {
    const risk = budgetRisks[0];
    const remaining = Math.max(0, risk.limit - risk.spent);
    candidates.push({
      priority: risk.ratio >= 1 ? 100 : 90,
      insight: `Бюджет по «${categoryNameById(risk.categoryId)}» заповнений на ${Math.round(risk.ratio * 100)}%`,
      action: risk.ratio >= 1
        ? `Перевищення: +${formatMoney(risk.spent - risk.limit)} ${currencySymbol(risk.budgetCurrency)}. Знизьте витрати в цій категорії на найближчі 7 днів.`
        : `До ліміту лишилось ~${formatMoney(remaining)} ${currencySymbol(risk.budgetCurrency)}. Встановіть тижневий cap по цій категорії.`,
    });
  }

  let topLeak = null;
  for (const [categoryId, amount] of currentExpenseByCategory.entries()) {
    const share = totalExpense > 0 ? amount / totalExpense : 0;
    if (!topLeak || share > topLeak.share) topLeak = { categoryId, amount, share };
  }
  if (topLeak && topLeak.share >= 0.4) {
    const weeklyCap = Math.max(1, Math.round(topLeak.amount * 0.75));
    candidates.push({
      priority: 80,
      insight: `Категорія «${categoryNameById(topLeak.categoryId)}» займає ${Math.round(topLeak.share * 100)}% витрат`,
      action: `Щоб зменшити тиск на бюджет, тримайте витрати тут до ~${formatMoney(weeklyCap)} ${currencySymbol(reportCurrency)} протягом 7 днів.`,
    });
  }

  let strongestSpike = null;
  for (const [categoryId, amount] of currentExpenseByCategory.entries()) {
    const prev = previousExpenseByCategory.get(categoryId) ?? 0;
    if (!(amount >= 200) || !(prev > 0)) continue;
    const growth = (amount - prev) / prev;
    if (growth <= 0.25) continue;
    if (!strongestSpike || growth > strongestSpike.growth) {
      strongestSpike = { categoryId, amount, prev, growth };
    }
  }
  if (strongestSpike) {
    const softCap = Math.max(1, Math.round(strongestSpike.prev * 1.1));
    candidates.push({
      priority: 70,
      insight: `Витрати «${categoryNameById(strongestSpike.categoryId)}» зросли на ${Math.round(strongestSpike.growth * 100)}% проти попереднього періоду`,
      action: `Поверніть категорію до рівня ~${formatMoney(softCap)} ${currencySymbol(reportCurrency)} на період ${periodDays} днів.`,
    });
  }

  if ((Number(summary.net) || 0) < 0) {
    const deficit = Math.abs(Number(summary.net) || 0);
    const targetCut = Math.max(1, Math.round(deficit * 0.5));
    candidates.push({
      priority: 85,
      insight: `Поточний баланс від'ємний: -${formatMoney(deficit)} ${currencySymbol(reportCurrency)}`,
      action: `Зменште витрати щонайменше на ~${formatMoney(targetCut)} ${currencySymbol(reportCurrency)} у наступні 7 днів, почніть з топ-категорії.`,
    });
  }

  if ((Number(summary.net) || 0) > 0) {
    const goalNudge = await getGoalNudge(dbConn, userId, Number(summary.net));
    if (goalNudge) {
      candidates.push({
        priority: 60,
        insight: `Є вільний залишок +${formatMoney(summary.net)} ${currencySymbol(reportCurrency)} та активна ціль «${goalNudge.name}»`,
        action: `Рекомендований внесок: ~${formatMoney(goalNudge.suggested)} ${currencySymbol(goalNudge.currency)} (лишок до цілі: ${formatMoney(goalNudge.remaining)} ${currencySymbol(goalNudge.currency)}).`,
      });
    }
  }

  const incomeDrop = percentChange(summary.income, prevSummary.income);
  if (incomeDrop < -20) {
    candidates.push({
      priority: 65,
      insight: `Дохід зменшився на ${Math.abs(Math.round(incomeDrop))}% відносно попереднього періоду`,
      action: 'Тимчасово підніміть частку обовʼязкових витрат у пріоритеті та відкладіть необовʼязкові покупки.',
    });
  }

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
};
const getBudgetCompliance = async (dbConn, userId, txs, today, tz, fxPayload) => {
  const rows = await dbConn.all(
    `SELECT category_id AS categoryId, monthly_limit AS monthlyLimit, currency
     FROM category_budgets
     WHERE user_id = ?`,
    [userId]
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return { items: [], allUnderLimit: false };
  }
  const ym = String(today || '').slice(0, 7);
  const items = [];
  for (const row of rows) {
    const limit = Number(row?.monthlyLimit);
    if (!(limit > 0)) continue;
    const budgetCurrency = normalizeCurrency(row?.currency);
    let spent = 0;
    for (const tx of txs || []) {
      if (tx?.type !== 'expense' || tx.categoryId !== row.categoryId) continue;
      const txDay = dayFromIsoInZone(String(tx.date), tz);
      if (!String(txDay).startsWith(ym)) continue;
      spent += convertCurrencyServer(
        Number(tx.amount) || 0,
        normalizeCurrency(tx.currency),
        budgetCurrency,
        fxPayload
      );
    }
    const ratio = spent / limit;
    items.push({
      categoryId: row.categoryId,
      spent,
      limit,
      budgetCurrency,
      ratio,
    });
  }
  const allUnderLimit = items.length > 0 && items.every((i) => i.ratio < 1);
  return { items, allUnderLimit };
};
const getActiveGoalsWithSaved = async (dbConn, userId, rangeSet, tz) => {
  const sortedDays = Array.from(rangeSet).sort();
  if (sortedDays.length === 0) return [];
  const rangeStart = sortedDays[0];
  const rangeEnd = sortedDays[sortedDays.length - 1];
  const goals = await dbConn.all(
    `SELECT id, name, target_amount AS targetAmount, currency FROM goals WHERE user_id = ? AND archived = 0`,
    [userId]
  );
  const contribs = await dbConn.all(
    `SELECT goal_id AS goalId, amount, date FROM goal_contributions WHERE user_id = ?`,
    [userId]
  );
  const byGoal = new Map();
  for (const g of goals || []) {
    const id = String(g.id);
    byGoal.set(id, {
      id,
      name: String(g.name || 'Ціль'),
      targetAmount: Math.max(0, Number(g.targetAmount) || 0),
      currency: normalizeCurrency(g.currency),
      savedBefore: 0,
      savedInPeriod: 0,
      savedThroughEnd: 0,
    });
  }
  for (const c of contribs || []) {
    const gid = String(c.goalId);
    const row = byGoal.get(gid);
    if (!row) continue;
    const day = dayFromIsoInZone(String(c.date), tz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const amt = Math.max(0, Number(c.amount) || 0);
    if (day <= rangeEnd) row.savedThroughEnd += amt;
    if (day < rangeStart) row.savedBefore += amt;
    if (day >= rangeStart && day <= rangeEnd) row.savedInPeriod += amt;
  }
  return Array.from(byGoal.values())
    .filter((g) => g.targetAmount > 0)
    .map((g) => ({
      ...g,
      progressStart: g.savedBefore / g.targetAmount,
      progressEnd: g.savedThroughEnd / g.targetAmount,
    }));
};
const buildAchievementLines = async ({
  reportType,
  summary,
  prevSummary,
  currentExpenseByCategory,
  previousExpenseByCategory,
  dbConn,
  userId,
  txs,
  today,
  tz,
  fxPayload,
  workedHours,
  workingDays,
  rangeSet,
}) => {
  const candidates = [];
  const income = Math.max(0, Number(summary.income) || 0);
  const net = Number(summary.net) || 0;
  const savedPct = income > 0 ? (Math.max(0, net) / income) * 100 : 0;
  if (savedPct >= 50) {
    candidates.push({
      priority: 90,
      line: `🏆 Видатний рівень збережень: ${savedPct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}%`,
    });
  } else if (savedPct >= 30) {
    candidates.push({
      priority: 90,
      line: `💎 Високий рівень збережень: ${savedPct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}%`,
    });
  } else if (savedPct >= 10) {
    candidates.push({
      priority: 90,
      line: `✅ Збережено ${savedPct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}% доходу`,
    });
  }
  const prevNet = Number(prevSummary?.net) || 0;
  const netBetterPct = percentChange(net, prevNet);
  let addedNetComparison = false;
  if (net > prevNet && prevNet !== 0) {
    candidates.push({
      priority: 70,
      line: `📈 Баланс кращий на ${Math.abs(Math.round(netBetterPct))}% за минулий період`,
    });
    addedNetComparison = true;
  }
  if (net > 0 && !addedNetComparison) {
    candidates.push({ priority: 60, line: '✅ Період закрито у плюс' });
  }
  const { items: budgetItems, allUnderLimit } = await getBudgetCompliance(
    dbConn,
    userId,
    txs,
    today,
    tz,
    fxPayload
  );
  if (budgetItems.length >= 1 && allUnderLimit) {
    candidates.push({ priority: 80, line: '🛡️ Усі бюджети в межах ліміту' });
  } else {
    const goodOnes = budgetItems
      .filter((i) => i.ratio <= 0.7)
      .sort((a, b) => a.ratio - b.ratio)
      .slice(0, 2);
    for (const b of goodOnes) {
      candidates.push({
        priority: 80,
        line: `✅ Бюджет «${categoryNameById(b.categoryId)}»: лише ${Math.round(b.ratio * 100)}% використано`,
      });
    }
  }
  const goalRows = await getActiveGoalsWithSaved(dbConn, userId, rangeSet, tz);
  for (const g of goalRows) {
    if (g.progressEnd >= 1 && g.progressStart < 1) {
      candidates.push({ priority: 100, line: `🏆 Ціль «${g.name}» виконана!` });
      continue;
    }
    if (g.savedInPeriod <= 0) continue;
    const thresholds = [
      { t: 0.75, label: '75%' },
      { t: 0.5, label: '50%' },
      { t: 0.25, label: '25%' },
    ];
    for (const { t, label } of thresholds) {
      if (g.progressStart < t && g.progressEnd >= t) {
        candidates.push({
          priority: 95,
          line: `🎯 Ціль «${g.name}»: досягнуто ${label}`,
        });
        break;
      }
    }
  }
  const topCats = Array.from(currentExpenseByCategory.entries())
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  let bestReduction = null;
  for (const [categoryId, cur] of topCats) {
    const prevAmt = previousExpenseByCategory.get(categoryId) ?? 0;
    if (!(cur > 0) || !(prevAmt > 0)) continue;
    const reduction = (prevAmt - cur) / prevAmt;
    if (reduction >= 0.15) {
      if (!bestReduction || reduction > bestReduction.reduction) {
        bestReduction = { categoryId, reduction };
      }
    }
  }
  if (bestReduction) {
    candidates.push({
      priority: 75,
      line: `📉 «${categoryNameById(bestReduction.categoryId)}»: витрати −${Math.round(bestReduction.reduction * 100)}%`,
    });
  }
  const wh = Math.max(0, Number(workedHours) || 0);
  const wd = Math.max(0, Number(workingDays) || 0);
  if (reportType === 'weekly' && wh >= 40) {
    candidates.push({
      priority: 50,
      line: `⏱️ Відпрацьовано ${formatHoursAsHoursMinutes(wh)} / ${wd} днів`,
    });
  }
  if (reportType === 'monthly' && wh >= 160) {
    candidates.push({
      priority: 50,
      line: `⏱️ Відпрацьовано ${formatHoursAsHoursMinutes(wh)} / ${wd} днів`,
    });
  }
  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6)
    .map((c) => c.line);
};
const formatRecommendationsSection = (items, title = '💡 РЕКОМЕНДАЦІЇ') => {
  const lines = [title];
  if (!Array.isArray(items) || items.length === 0) {
    lines.push('• Даних поки замало для персональних порад. Додайте більше транзакцій за період.');
    return lines.join('\n');
  }
  items.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.insight}`);
    lines.push(`   → ${item.action}`);
  });
  return lines.join('\n');
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
  const reportCurrencyCode = normalizeCurrency(extra.reportCurrency || 'UAH');
  const summary = extra.summary ?? summarizeTransactions(txs, reportCurrencyCode, extra.fxPayload ?? FX_FALLBACK);
  const sign = currencySymbol(reportCurrencyCode);
  const formatAmount = (value, withSign = false) => {
    const sign = withSign ? (value >= 0 ? '+' : '-') : '';
    return `${sign}${Math.abs(value).toLocaleString('uk-UA', { maximumFractionDigits: 2 })}`;
  };
  const TECHNICAL_CATEGORY_IDS = new Set(['other_income', 'other_expense']);
  if (reportType === 'weekly') {
    const topExpenseCategories = (summary.topExpenses || [])
      .filter((item) => !TECHNICAL_CATEGORY_IDS.has(item.categoryId))
      .slice(0, 5);
    const workedHours = Math.max(0, Number(extra.workedHours) || 0);
    const prevIncome = Number(extra.previousIncome) || 0;
    const prevExpense = Number(extra.previousExpense) || 0;
    const incomePct = percentChange(summary.income, prevIncome);
    const expensePct = percentChange(summary.expense, prevExpense);
    const lines = [
      '📊 *ФІНАНСОВИЙ ЗВІТ*',
      '━━━━━━━━━━━━━━━━━━━━',
      `📅 Період: ${periodLabel}`,
      '',
      '💰 *ФІНАНСИ*',
      `├ Дохід: *+${formatAmount(summary.income)} ${sign}*`,
      `├ Витрати: *-${formatAmount(summary.expense)} ${sign}*`,
      `└ Баланс: \`${formatAmount(summary.net, true)} ${sign}\``,
    ];
    if (prevIncome > 0 || prevExpense > 0) {
      lines.push('');
      lines.push('🔁 *ПОРІВНЯННЯ З МИНУЛИМ ТИЖНЕМ*');
      lines.push(`├ Дохід: \`${incomePct >= 0 ? '+' : ''}${incomePct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}%\` ${incomePct >= 0 ? '⬆️' : '⬇️'}`);
      lines.push(`└ Витрати: \`${expensePct >= 0 ? '+' : ''}${expensePct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}%\` ${expensePct >= 0 ? '⬆️' : '⬇️'}`);
    }
    lines.push('');
    lines.push('📈 *Категорії витрат:*');
    if (topExpenseCategories.length > 0) {
      for (const item of topExpenseCategories) {
        lines.push(`${CATEGORY_EMOJI[item.categoryId] ?? '•'} ${categoryNameById(item.categoryId)}: ${formatAmount(item.amount)} ${sign}`);
      }
    } else {
      lines.push('• Немає витрат за період');
    }
    if (workedHours > 0) {
      lines.push('');
      lines.push('⏰ *РОБОЧИЙ ЧАС*');
      lines.push(`└ Відпрацьовано: *${formatHoursAsHoursMinutes(workedHours)}*`);
    }
    return lines.join('\n');
  }
  if (reportType === 'monthly') {
    const topExpenseCategories = (summary.topExpenses || [])
      .filter((item) => !TECHNICAL_CATEGORY_IDS.has(item.categoryId))
      .slice(0, 5);
    const totalExpense = topExpenseCategories.reduce((a, item) => a + item.amount, 0);
    const workedHours = Math.max(0, Number(extra.workedHours) || 0);
    const workingDays = Math.max(0, Number(extra.workingDays) || 0);
    const avgPerDay = Math.max(0, Number(extra.avgPerDay) || 0);
    const incomePct = percentChange(summary.income, Number(extra.previousIncome) || 0);
    const expensePct = percentChange(summary.expense, Number(extra.previousExpense) || 0);
    const netPct = percentChange(summary.net, Number(extra.previousNet) || 0);
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
    lines.push('📈 *ПОРІВНЯННЯ З МИНУЛИМ МІСЯЦЕМ*');
    lines.push(`├ Дохід: \`${incomePct >= 0 ? '+' : ''}${incomePct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}%\` ${incomePct >= 0 ? '⬆️' : '⬇️'}`);
    lines.push(`├ Витрати: \`${expensePct >= 0 ? '+' : ''}${expensePct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}%\` ${expensePct >= 0 ? '⬆️' : '⬇️'}`);
    lines.push(`└ Баланс: \`${netPct >= 0 ? '+' : ''}${netPct.toLocaleString('uk-UA', { maximumFractionDigits: 0 })}%\` ${netPct >= 0 ? '⬆️' : '⬇️'}`);
    if (workedHours > 0) {
      lines.push('');
      lines.push('⏰ *РОБОЧИЙ ЧАС*');
      lines.push(`├ Всього відпрацьовано: *${formatHoursAsHoursMinutes(workedHours)}*`);
      lines.push(`├ Робочих днів: ${workingDays}`);
      lines.push(`└ Середньо/день: ${formatHoursAsHoursMinutes(avgPerDay)}`);
    }
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
  if (!bot) return false;
  const tz = normalizeTimeZone(timeZone);
  const nowIso = new Date().toISOString();
  const today = dayFromIsoInZone(nowIso, tz) || nowIso.slice(0, 10);
  const rangeSet = reportType === 'weekly' ? getWeekDaySet(today) : getPreviousFullMonthDaySet(today);
  const txs = await dbConn.all(
    'SELECT amount, currency, categoryId, type, date FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 5000',
    [userId]
  );
  const scoped = (Array.isArray(txs) ? txs : []).filter((tx) => rangeSet.has(dayFromIsoInZone(tx.date, tz)));
  const previousRangeSet = buildPreviousPeriodDaySet(reportType, rangeSet);
  const previousScoped = (Array.isArray(txs) ? txs : []).filter((tx) => previousRangeSet.has(dayFromIsoInZone(tx.date, tz)));
  const reportSettings = await getReportSettings(dbConn, userId);
  const fx = await fetchFxRates();
  const reportCurrency = normalizeCurrency(reportSettings.reportCurrency || detectPrimaryCurrency(scoped));
  const sortedDays = Array.from(rangeSet).sort();
  const periodEndDay = sortedDays[sortedDays.length - 1] || today;
  const periodLabel = reportType === 'weekly'
    ? `${formatDayMonth(sortedDays[0])} — ${formatDayMonth(today)}.${String(today).slice(0, 4)}`
    : `${sortedDays[0]} → ${periodEndDay}`;
  const summary = summarizeTransactions(scoped, reportCurrency, fx);
  const previousSummary = summarizeTransactions(previousScoped, reportCurrency, fx);
  const comparison = buildReportComparison(summary, previousSummary);
  const shiftRows = await dbConn.all(
    `SELECT day, worked_hours, salary_amount, salary_currency
     FROM planner_shift_entries
     WHERE user_id = ? AND day >= ? AND day <= ?`,
    [userId, sortedDays[0], sortedDays[sortedDays.length - 1]]
  );
  const plannerDayRows = await dbConn.all(
    `SELECT day, hasShift, workedHours
     FROM planner_days
     WHERE day >= ? AND day <= ?`,
    [plannerDayKey(userId, sortedDays[0]), plannerDayKey(userId, sortedDays[sortedDays.length - 1])]
  );
  const periodDays = reportType === 'weekly' ? 7 : Math.max(28, sortedDays.length);
  const recommendationItems = await buildRecommendationItems({
    dbConn,
    userId,
    txs: Array.isArray(txs) ? txs : [],
    currentTxs: scoped,
    previousTxs: previousScoped,
    periodDays,
    today,
    tz,
    reportCurrency,
  });
  const recommendationLines = recommendationItems.map((item) => `• ${item.insight}. ${item.action}`);
  const entryHoursByDay = new Map();
  for (const row of shiftRows || []) {
    const day = String(row.day || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    entryHoursByDay.set(day, (entryHoursByDay.get(day) ?? 0) + Math.max(0, Number(row.worked_hours) || 0));
  }
  const plannerFallbackByDay = new Map();
  for (const row of plannerDayRows || []) {
    const dayIso = plannerDayFromStored(userId, String(row.day || ''));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) continue;
    if (!Boolean(row.hasShift)) continue;
    if (entryHoursByDay.has(dayIso)) continue;
    plannerFallbackByDay.set(dayIso, Math.max(0, Number(row.workedHours) || 0));
  }
  const workedHours =
    Array.from(entryHoursByDay.values()).reduce((acc, h) => acc + h, 0) +
    Array.from(plannerFallbackByDay.values()).reduce((acc, h) => acc + h, 0);
  const workedDaySet = new Set([
    ...Array.from(entryHoursByDay.keys()),
    ...Array.from(plannerFallbackByDay.keys()),
  ]);
  const workingDays = workedDaySet.size;
  const avgPerDay = workingDays > 0 ? workedHours / workingDays : 0;
  const currentExpenseByCategory = sumExpenseByCategory(scoped, reportCurrency, fx);
  const previousExpenseByCategory = sumExpenseByCategory(previousScoped, reportCurrency, fx);
  const achievementLines = await buildAchievementLines({
    reportType,
    summary,
    prevSummary: previousSummary,
    currentExpenseByCategory,
    previousExpenseByCategory,
    dbConn,
    userId,
    txs: Array.isArray(txs) ? txs : [],
    today,
    tz,
    fxPayload: fx,
    workedHours,
    workingDays,
    rangeSet,
  });
  const text = buildReportText(reportType, periodLabel, scoped, comparison, {
    summary,
    workedHours,
    workingDays,
    avgPerDay,
    reportCurrency,
    fxPayload: fx,
    previousIncome: previousSummary.income,
    previousExpense: previousSummary.expense,
    previousNet: previousSummary.net,
    periodEndDay,
    recommendationLines,
    achievementLines,
  });
  try {
    await bot.sendMessage(chatId, text, {
      disable_web_page_preview: true,
      parse_mode: 'Markdown',
    });
    return true;
  } catch (e) {
    console.error('[bot] sendUserReport failed', { userId, chatId, reportType, err: e });
    return false;
  }
};
const sendFinancialAdvice = async (dbConn, userId, chatId, periodDaysRaw, timeZone) => {
  if (!bot) return;
  const tz = normalizeTimeZone(timeZone);
  const periodDays = clamp(parseAdvicePeriodDays(periodDaysRaw), 7, 30);
  const nowIso = new Date().toISOString();
  const today = dayFromIsoInZone(nowIso, tz) || nowIso.slice(0, 10);
  const currentSet = new Set();
  for (let i = 0; i < periodDays; i += 1) currentSet.add(shiftIsoDay(today, -i));
  const previousSet = new Set(Array.from(currentSet).map((d) => shiftIsoDay(d, -periodDays)));
  const txs = await dbConn.all(
    'SELECT amount, currency, categoryId, type, date FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 5000',
    [userId]
  );
  const allTxs = Array.isArray(txs) ? txs : [];
  const currentTxs = allTxs.filter((tx) => currentSet.has(dayFromIsoInZone(tx.date, tz)));
  const previousTxs = allTxs.filter((tx) => previousSet.has(dayFromIsoInZone(tx.date, tz)));
  const reportCurrency = normalizeCurrency(detectPrimaryCurrency(currentTxs));
  const fx = await fetchFxRates();
  const items = await buildRecommendationItems({
    dbConn,
    userId,
    txs: allTxs,
    currentTxs,
    previousTxs,
    periodDays,
    today,
    tz,
    reportCurrency,
  });
  const section = formatRecommendationsSection(items);
  const summary = summarizeTransactions(currentTxs, reportCurrency, fx);
  const header = [
    `📌 Поради за останні ${periodDays} днів`,
    `Баланс: ${summary.net >= 0 ? '+' : '-'}${formatMoney(summary.net)} ${currencySymbol(reportCurrency)}`,
    '',
  ].join('\n');
  await bot.sendMessage(chatId, `${header}${section}`, {
    disable_web_page_preview: true,
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

const createAutomationToken = () => crypto.randomBytes(24).toString('hex');

const ensurePlannerUserSettings = async (dbConn, userId) => {
  const now = new Date().toISOString();
  await dbConn.run(
    `INSERT INTO planner_user_settings (user_id, default_shift_template_id, automation_token, updated_at)
     VALUES (?, NULL, ?, ?)
     ON CONFLICT(user_id) DO NOTHING`,
    [userId, createAutomationToken(), now]
  );
  const row = await dbConn.get(
    'SELECT automation_token FROM planner_user_settings WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (!row?.automation_token) {
    await dbConn.run(
      `UPDATE planner_user_settings SET automation_token = ?, updated_at = ? WHERE user_id = ?`,
      [createAutomationToken(), now, userId]
    );
  }
};

const resolveAutomationUserId = async (dbConn, req) => {
  const bearer = String(req.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const token = bearer || String(req.query?.token ?? '').trim();
  if (!token) return null;
  const row = await dbConn.get(
    'SELECT user_id FROM planner_user_settings WHERE automation_token = ? LIMIT 1',
    [token]
  );
  return row?.user_id ? String(row.user_id) : null;
};

const buildAutomationShiftUrls = (req, token) => {
  const proto = String(req.get('x-forwarded-proto') ?? req.protocol ?? 'https').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') ?? req.get('host') ?? '').split(',')[0].trim();
  const base = host ? `${proto}://${host}` : '';
  const q = `token=${encodeURIComponent(token)}`;
  return {
    startUrl: `${base}/api/automation/shift/start?${q}`,
    endUrl: `${base}/api/automation/shift/end?${q}`,
  };
};

const getPlannerUserSettings = async (dbConn, userId) => {
  await ensurePlannerUserSettings(dbConn, userId);
  const row = await dbConn.get(
    'SELECT default_shift_template_id FROM planner_user_settings WHERE user_id = ? LIMIT 1',
    [userId]
  );
  const raw = row?.default_shift_template_id;
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { defaultShiftTemplateId: null };
  }
  const id = String(raw).trim();
  if (id === 'none') {
    return { defaultShiftTemplateId: 'none' };
  }
  const tpl = await dbConn.get(
    'SELECT id FROM planner_shift_templates WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, id]
  );
  if (!tpl?.id) {
    await dbConn.run(
      `UPDATE planner_user_settings SET default_shift_template_id = NULL, updated_at = ? WHERE user_id = ?`,
      [new Date().toISOString(), userId]
    );
    return { defaultShiftTemplateId: null };
  }
  return { defaultShiftTemplateId: id };
};

const updatePlannerUserSettings = async (dbConn, userId, patch) => {
  await ensurePlannerUserSettings(dbConn, userId);
  if (patch.defaultShiftTemplateId === undefined) {
    return getPlannerUserSettings(dbConn, userId);
  }
  let stored = null;
  const next = patch.defaultShiftTemplateId;
  if (next === null || next === '') {
    stored = null;
  } else if (next === 'none') {
    stored = 'none';
  } else {
    const tpl = await dbConn.get(
      'SELECT id FROM planner_shift_templates WHERE user_id = ? AND id = ? LIMIT 1',
      [userId, String(next)]
    );
    if (!tpl?.id) {
      return { error: 'TEMPLATE_NOT_FOUND' };
    }
    stored = String(tpl.id);
  }
  const now = new Date().toISOString();
  await dbConn.run(
    `UPDATE planner_user_settings SET default_shift_template_id = ?, updated_at = ? WHERE user_id = ?`,
    [stored, now, userId]
  );
  return getPlannerUserSettings(dbConn, userId);
};

const resolveShiftTemplateFields = async (dbConn, userId, templateId) => {
  if (!templateId || templateId === 'none') {
    return {
      templateId: null,
      salaryRate: 0,
      salaryAmount: 0,
      salaryCurrency: 'UAH',
      shiftNote: '',
    };
  }
  const tpl = await dbConn.get(
    `SELECT id, name, symbol, salary_rate, salary_amount, currency
     FROM planner_shift_templates
     WHERE user_id = ? AND id = ?
     LIMIT 1`,
    [userId, String(templateId)]
  );
  if (!tpl?.id) return null;
  return {
    templateId: String(tpl.id),
    salaryRate: Math.max(0, Number(tpl.salary_rate) || 0),
    salaryAmount: Math.max(0, Number(tpl.salary_amount) || 0),
    salaryCurrency: normalizeCurrency(tpl.currency) === 'PLN' ? 'PLN' : 'UAH',
    shiftNote: [String(tpl.name ?? '').trim(), String(tpl.symbol ?? '').trim()].filter(Boolean).join(' • '),
  };
};

const startActiveShiftForUser = async (dbConn, userId, options = {}) => {
  const userTimeZone = normalizeTimeZone(
    options.userTimeZone ?? (await getUserTimeZone(dbConn, userId))
  );
  const active = await dbConn.get(
    'SELECT started_at FROM bot_active_shifts WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (active?.started_at) {
    return { ok: false, code: 'ALREADY_ACTIVE', startedAt: active.started_at, userTimeZone };
  }
  const startedAt = options.startedAt ?? new Date().toISOString();
  const startedDay =
    options.startedDay ||
    dayFromIsoInZone(startedAt, userTimeZone) ||
    String(startedAt).slice(0, 10);
  const templateKey =
    options.templateId === undefined || options.templateId === null
      ? null
      : options.templateId === 'none'
        ? 'none'
        : String(options.templateId);
  const fields = await resolveShiftTemplateFields(dbConn, userId, templateKey);
  if (templateKey && templateKey !== 'none' && !fields) {
    return { ok: false, code: 'TEMPLATE_NOT_FOUND' };
  }
  const resolved = fields ?? {
    templateId: null,
    salaryRate: 0,
    salaryAmount: 0,
    salaryCurrency: 'UAH',
    shiftNote: '',
  };
  await dbConn.run(
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
      userId,
      startedAt,
      startedDay,
      resolved.templateId,
      resolved.salaryRate,
      resolved.salaryAmount,
      resolved.salaryCurrency,
      resolved.shiftNote,
      startedAt,
    ]
  );
  await upsertPlannerDay(dbConn, userId, startedDay, {
    hasShift: true,
    salaryRate: resolved.salaryRate,
    salaryAmount: resolved.salaryAmount,
    salaryCurrency: resolved.salaryCurrency === 'PLN' ? 'PLN' : 'UAH',
    note: resolved.shiftNote,
  });
  return {
    ok: true,
    startedAt,
    startedDay,
    userTimeZone,
    ...resolved,
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
app.use(express.json({ limit: '15mb' }));
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
    [{ text: '🟢 Почати зміну' }],
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
  bot.onText(/\/advice(?:\s+(.+))?/i, async (msg, match) => {
    if (!msg.from?.id || !msg.chat?.id) return;
    const userId = String(msg.from.id);
    await upsertBotUser(db, msg.from.id, msg.chat.id);
    const tz = await getUserTimeZone(db, userId);
    await sendFinancialAdvice(db, userId, msg.chat.id, match?.[1], tz);
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
  const sendBotShiftStartPicker = async (chatId, userId, userTimeZone) => {
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
    pendingShiftStarts.set(chatId, {
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
    bot.sendMessage(chatId, 'Оберіть шаблон зміни:', { reply_markup: { inline_keyboard: templateButtons } });
  };

  const botStartShiftWithDefault = async (msg) => {
    if (!msg.from?.id || !msg.chat?.id) return;
    const userId = String(msg.from.id);
    await upsertBotUser(db, msg.from.id, msg.chat.id);
    const userTimeZone = await getUserTimeZone(db, userId);
    const plannerSettings = await getPlannerUserSettings(db, userId);
    const defaultId = plannerSettings.defaultShiftTemplateId;
    if (!defaultId) {
      bot.sendMessage(
        msg.chat.id,
        'Шаблон за замовчуванням не заданий. Відкрийте планер у Denga → «Шаблон за замовчуванням», або надішліть /shift_start.'
      );
      return;
    }
    const result = await startActiveShiftForUser(db, userId, {
      templateId: defaultId,
      userTimeZone,
    });
    if (!result.ok) {
      if (result.code === 'ALREADY_ACTIVE') {
        bot.sendMessage(msg.chat.id, `⚠️ Зміна вже розпочата о ${parseTimeFromIso(result.startedAt, userTimeZone)}.`);
        return;
      }
      if (result.code === 'TEMPLATE_NOT_FOUND') {
        bot.sendMessage(msg.chat.id, '⚠️ Шаблон за замовчуванням не знайдено. Оновіть налаштування в планері.');
        return;
      }
      return;
    }
    bot.sendMessage(
      msg.chat.id,
      `🟢 Зміну розпочато (${parseTimeFromIso(result.startedAt, userTimeZone)}). Синхронізовано з календарем.`
    );
  };

  bot.onText(/\/shift_start_default/i, async (msg) => {
    await botStartShiftWithDefault(msg);
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
    await sendBotShiftStartPicker(msg.chat.id, userId, userTimeZone);
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
    const startedMs = shiftStartedAtToUtcMs(active.started_at, userTimeZone);
    if (!Number.isFinite(startedMs)) {
      await db.run('DELETE FROM bot_active_shifts WHERE user_id = ?', [userId]);
      bot.sendMessage(msg.chat.id, '⚠️ Стан зміни був пошкоджений. Почніть нову через /shift_start.');
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
    const diffHours = Math.max(0, (now.getTime() - startedMs) / (1000 * 60 * 60));
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
      `🔴 Зміну завершено (${parseTimeFromIso(now.toISOString(), userTimeZone)}). Відпрацьовано: ${formatHoursAsHoursMinutes(roundedHours)}.`
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
      const userId = String(msg.from.id);
      const plannerSettings = await getPlannerUserSettings(db, userId);
      if (plannerSettings.defaultShiftTemplateId) {
        await botStartShiftWithDefault(msg);
        return;
      }
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
    if (
      /(^| )рекомендац(ія|ії|ии)($| )/i.test(normalizedText) ||
      /(^| )совет(ы)?($| )/i.test(normalizedText) ||
      /(^| )advice($| )/i.test(normalizedText) ||
      normalizedText === 'рекомендації'
    ) {
      bot.processUpdate({
        update_id: Date.now() + 4,
        message: {
          ...msg,
          text: '/advice',
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
          'Не зрозумів суму. Надішліть число (наприклад, 100) або використайте /shift_start, /shift_end чи /advice.'
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
      const userTimeZone = normalizeTimeZone(pendingShift.userTimeZone);
      const result = await startActiveShiftForUser(db, pendingShift.userId, {
        templateId: picked === 'none' ? 'none' : picked,
        startedAt: pendingShift.startedAt,
        startedDay: pendingShift.startedDay,
        userTimeZone,
      });
      if (!result.ok) {
        if (result.code === 'TEMPLATE_NOT_FOUND') {
          bot.answerCallbackQuery(callbackQuery.id, { text: 'Шаблон не знайдено.' });
          return;
        }
        if (result.code === 'ALREADY_ACTIVE') {
          bot.answerCallbackQuery(callbackQuery.id, { text: 'Зміна вже відкрита.' });
          pendingShiftStarts.delete(chatId);
          return;
        }
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Не вдалося почати зміну.' });
        return;
      }
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
      await applyTransactionEffects(db, transaction.user_id, transaction);
      pendingTransactions.delete(chatId);
      bot.answerCallbackQuery(callbackQuery.id);
      const category = CATEGORIES.find((c) => c.id === pending.categoryId);
      bot.sendMessage(chatId, `✅ Транзакцію ${pending.amount} (${category ? category.name : pending.categoryId}) додано!`);
    }
  });
} else {
  console.warn('Telegram bot is disabled: TELEGRAM_BOT_TOKEN is missing');
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
    if (nowLocal.time === settings.sendTime) {
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
    }
    const reminders = await listReminders(db, userId);
    for (const reminder of reminders) {
      if (!reminder.enabled || nowLocal.time !== reminder.timeHHMM) continue;
      const slot = `${nowLocal.day}:${reminder.timeHHMM}`;
      await dispatchReminder(db, userId, reminder, tz, chatId, slot);
    }
  }
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

async function runSubscriptionsAutopayTick() {
  const users = await db.all('SELECT DISTINCT user_id AS userId FROM subscriptions WHERE active = 1');
  if (!Array.isArray(users) || users.length === 0) return;
  for (const u of users) {
    const userId = String(u.userId ?? '');
    if (!userId) continue;
    try {
      await runSubscriptionAutopayForUser(userId);
    } catch (e) {
      console.error('[subscriptions] autopay tick failed for user', userId, e);
    }
  }
}

setTimeout(() => {
  runSubscriptionsAutopayTick().catch((e) => {
    console.error('[subscriptions] autopay initial tick failed', e);
  });
}, 8000);
setInterval(() => {
  runSubscriptionsAutopayTick().catch((e) => {
    console.error('[subscriptions] autopay tick failed', e);
  });
}, 60 * 60 * 1000);

// --- Shortcuts / automation (personal token, no Telegram initData) ---
app.get('/api/automation/shift/start', async (req, res) => {
  const userId = await resolveAutomationUserId(db, req);
  if (!userId) {
    res.status(401).json({ error: 'Invalid or missing token' });
    return;
  }
  const plannerSettings = await getPlannerUserSettings(db, userId);
  if (!plannerSettings.defaultShiftTemplateId) {
    res.status(400).json({
      error: 'Default shift template is not set in Denga planner',
      code: 'DEFAULT_TEMPLATE_MISSING',
    });
    return;
  }
  const userTimeZone = await getUserTimeZone(db, userId);
  const result = await startActiveShiftForUser(db, userId, {
    templateId: plannerSettings.defaultShiftTemplateId,
    userTimeZone,
  });
  if (!result.ok) {
    if (result.code === 'ALREADY_ACTIVE') {
      res.status(409).json({ error: 'Shift already active', code: result.code });
      return;
    }
    res.status(400).json({ error: 'Could not start shift', code: result.code ?? 'UNKNOWN' });
    return;
  }
  res.json({
    ok: true,
    action: 'start',
    startedAt: result.startedAt,
    shiftNote: result.shiftNote,
  });
});

app.get('/api/automation/shift/end', async (req, res) => {
  const userId = await resolveAutomationUserId(db, req);
  if (!userId) {
    res.status(401).json({ error: 'Invalid or missing token' });
    return;
  }
  const active = await db.get(
    'SELECT started_at, started_day, template_id, salary_rate, salary_amount, salary_currency, shift_note FROM bot_active_shifts WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (!active?.started_at) {
    res.status(400).json({ error: 'No active shift', code: 'NO_ACTIVE_SHIFT' });
    return;
  }
  const userTimeZone = await getUserTimeZone(db, userId);
  const startedMs = shiftStartedAtToUtcMs(active.started_at, userTimeZone);
  if (!Number.isFinite(startedMs)) {
    await db.run('DELETE FROM bot_active_shifts WHERE user_id = ?', [userId]);
    res.status(400).json({ error: 'Corrupted shift state', code: 'INVALID_SHIFT' });
    return;
  }
  const deleteActive = await db.run(
    'DELETE FROM bot_active_shifts WHERE user_id = ? AND started_at = ?',
    [userId, active.started_at]
  );
  if (!deleteActive?.changes) {
    res.status(409).json({ error: 'Shift already ended', code: 'ALREADY_ENDED' });
    return;
  }
  const now = new Date();
  const diffHours = Math.max(0, (now.getTime() - startedMs) / (1000 * 60 * 60));
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
  res.json({
    ok: true,
    action: 'end',
    workedHours: roundedHours,
    endedAt: nowIso,
  });
});

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
  const sent = await sendUserReport(db, userId, Number(user.chatId), 'weekly', user.timezone);
  if (!sent) {
    res.status(503).json({ error: 'Telegram report could not be sent', code: 'TELEGRAM_REPORT_FAILED' });
    return;
  }
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
  const sent = await sendUserReport(db, userId, Number(user.chatId), 'monthly', user.timezone);
  if (!sent) {
    res.status(503).json({ error: 'Telegram report could not be sent', code: 'TELEGRAM_REPORT_FAILED' });
    return;
  }
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
  const kind = String(current.kind);
  if (req.body?.kind !== undefined && String(req.body.kind) !== kind) {
    res.status(400).json({ error: 'kind cannot be changed' });
    return;
  }
  if (!isValidReminderKind(kind)) {
    res.status(400).json({ error: 'invalid reminder kind' });
    return;
  }
  const nextTime = req.body?.timeHHMM === undefined ? undefined : parseSendTime(req.body.timeHHMM);
  if (req.body?.timeHHMM !== undefined && !nextTime) {
    res.status(400).json({ error: 'timeHHMM must be HH:MM' });
    return;
  }
  const leadDaysRaw = req.body?.leadDays;
  let leadDays;
  if (leadDaysRaw !== undefined) {
    const n = Number(leadDaysRaw);
    const raw = Number.isFinite(n) ? Math.trunc(n) : 0;
    if (kind === 'fx_change') leadDays = Math.min(100, Math.max(1, raw));
    else if (kind === 'inactivity') leadDays = Math.min(90, Math.max(1, raw));
    else if (kind === 'shift_evening_before') leadDays = Math.min(30, Math.max(1, raw));
    else if (kind === 'shift_unclosed') leadDays = 0;
    else if (kind === 'subscriptions') leadDays = Math.min(31, Math.max(0, raw));
    else leadDays = 0;
  }
  await db.run(
    `UPDATE user_reminders
     SET title = COALESCE(?, title),
         enabled = COALESCE(?, enabled),
         time_hhmm = COALESCE(?, time_hhmm),
         lead_days = COALESCE(?, lead_days),
         updated_at = ?
     WHERE user_id = ? AND id = ?`,
    [
      req.body?.title === undefined ? null : String(req.body.title).trim(),
      req.body?.enabled === undefined ? null : (req.body.enabled ? 1 : 0),
      nextTime ?? null,
      leadDays === undefined ? null : leadDays,
      new Date().toISOString(),
      userId,
      id,
    ]
  );
  const reminders = await listReminders(db, userId);
  res.json(reminders.find((r) => r.id === id) ?? null);
});

app.get('/api/budgets', async (req, res) => {
  const userId = String(req.authUserId ?? '').trim();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const rows = await db.all(
    `SELECT category_id AS categoryId, monthly_limit AS monthlyLimit, currency FROM category_budgets WHERE user_id = ? ORDER BY category_id ASC`,
    [userId]
  );
  res.json(rows || []);
});

app.put('/api/budgets/:categoryId', async (req, res) => {
  const userId = String(req.authUserId ?? '').trim();
  const categoryId = String(req.params.categoryId ?? '').trim();
  if (!userId || !categoryId) {
    res.status(400).json({ error: 'invalid categoryId' });
    return;
  }
  const limit = Number(req.body?.monthlyLimit);
  if (!Number.isFinite(limit) || limit < 0) {
    res.status(400).json({ error: 'monthlyLimit must be a number >= 0' });
    return;
  }
  const currency = normalizeCurrency(req.body?.currency);
  const now = new Date().toISOString();
  if (limit === 0) {
    await db.run('DELETE FROM category_budgets WHERE user_id = ? AND category_id = ?', [userId, categoryId]);
    res.json({ categoryId, monthlyLimit: 0, currency });
    return;
  }
  await db.run(
    `INSERT INTO category_budgets (user_id, category_id, monthly_limit, currency, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, category_id) DO UPDATE SET
       monthly_limit = excluded.monthly_limit,
       currency = excluded.currency,
       updated_at = excluded.updated_at`,
    [userId, categoryId, limit, currency, now]
  );
  res.json({ categoryId, monthlyLimit: limit, currency });
});

app.delete('/api/budgets/:categoryId', async (req, res) => {
  const userId = String(req.authUserId ?? '').trim();
  const categoryId = String(req.params.categoryId ?? '').trim();
  if (!userId || !categoryId) {
    res.status(400).json({ error: 'invalid categoryId' });
    return;
  }
  await db.run('DELETE FROM category_budgets WHERE user_id = ? AND category_id = ?', [userId, categoryId]);
  res.status(204).end();
});

const GOAL_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const mapGoalRow = (row, saved, contributionsCount) => ({
  id: row.id,
  name: row.name,
  targetAmount: Number(row.target_amount) || 0,
  saved: Number(saved) || 0,
  contributionsCount: Number(contributionsCount) || 0,
  currency: normalizeCurrency(row.currency),
  deadline: row.deadline || null,
  icon: typeof row.icon === 'string' && row.icon.trim() ? row.icon.trim() : 'target',
  color: typeof row.color === 'string' && GOAL_COLOR_RE.test(row.color) ? row.color : '#7C5CFF',
  archived: Boolean(row.archived),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

app.get('/api/goals', async (req, res) => {
  const userId = String(req.authUserId ?? '').trim();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const rows = await db.all(
    `SELECT g.id, g.user_id, g.name, g.target_amount, g.currency, g.deadline, g.icon, g.color, g.archived, g.created_at, g.updated_at,
            COALESCE((SELECT SUM(amount) FROM goal_contributions WHERE goal_id = g.id), 0) AS saved,
            COALESCE((SELECT COUNT(*) FROM goal_contributions WHERE goal_id = g.id), 0) AS contributions_count
     FROM goals g
     WHERE g.user_id = ?
     ORDER BY g.archived ASC, g.updated_at DESC`,
    [userId]
  );
  res.json(
    (rows || []).map((r) =>
      mapGoalRow(r, r.saved, r.contributions_count)
    )
  );
});

app.post('/api/goals', async (req, res) => {
  const userId = String(req.authUserId ?? '').trim();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  const targetAmount = Number(req.body?.targetAmount);
  const currency = normalizeCurrency(req.body?.currency);
  const deadlineRaw = req.body?.deadline;
  const deadline =
    deadlineRaw === null || deadlineRaw === undefined || deadlineRaw === ''
      ? null
      : typeof deadlineRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(deadlineRaw)
        ? deadlineRaw
        : undefined;
  if (deadline === undefined && deadlineRaw !== null && deadlineRaw !== undefined && deadlineRaw !== '') {
    res.status(400).json({ error: 'deadline must be YYYY-MM-DD or empty' });
    return;
  }
  const icon = typeof req.body?.icon === 'string' && req.body.icon.trim() ? req.body.icon.trim().slice(0, 48) : 'target';
  const colorRaw = typeof req.body?.color === 'string' ? req.body.color.trim() : '';
  const color = GOAL_COLOR_RE.test(colorRaw) ? colorRaw : '#7C5CFF';

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    res.status(400).json({ error: 'targetAmount must be > 0' });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO goals (id, user_id, name, target_amount, currency, deadline, icon, color, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, userId, name, targetAmount, currency, deadline, icon, color, now, now]
  );
  const row = await db.get(
    `SELECT g.id, g.user_id, g.name, g.target_amount, g.currency, g.deadline, g.icon, g.color, g.archived, g.created_at, g.updated_at,
            0 AS saved, 0 AS contributions_count
     FROM goals g WHERE g.id = ? AND g.user_id = ?`,
    [id, userId]
  );
  res.status(201).json(mapGoalRow(row, 0, 0));
});

app.patch('/api/goals/:id', async (req, res) => {
  const userId = String(req.authUserId ?? '').trim();
  const id = String(req.params.id ?? '').trim();
  if (!userId || !id) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const current = await db.get('SELECT * FROM goals WHERE user_id = ? AND id = ? LIMIT 1', [userId, id]);
  if (!current) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }

  const name =
    typeof req.body?.name === 'string'
      ? req.body.name.trim().replace(/\s+/g, ' ')
      : current.name;
  const targetAmount =
    req.body?.targetAmount === undefined ? Number(current.target_amount) : Number(req.body.targetAmount);
  const currency = req.body?.currency === undefined ? normalizeCurrency(current.currency) : normalizeCurrency(req.body.currency);
  let deadline = current.deadline;
  if (req.body?.deadline !== undefined) {
    const d = req.body.deadline;
    if (d === null || d === '') deadline = null;
    else if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) deadline = d;
    else {
      res.status(400).json({ error: 'deadline must be YYYY-MM-DD or null' });
      return;
    }
  }
  const icon =
    typeof req.body?.icon === 'string' && req.body.icon.trim()
      ? req.body.icon.trim().slice(0, 48)
      : current.icon;
  const colorRaw = req.body?.color === undefined ? current.color : String(req.body.color ?? '').trim();
  const color = GOAL_COLOR_RE.test(colorRaw) ? colorRaw : current.color;
  const archived = req.body?.archived === undefined ? Boolean(current.archived) : Boolean(req.body.archived);

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    res.status(400).json({ error: 'targetAmount must be > 0' });
    return;
  }

  const now = new Date().toISOString();
  await db.run(
    `UPDATE goals SET name = ?, target_amount = ?, currency = ?, deadline = ?, icon = ?, color = ?, archived = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [name, targetAmount, currency, deadline, icon, color, archived ? 1 : 0, now, id, userId]
  );

  const agg = await db.get(
    `SELECT COALESCE(SUM(amount), 0) AS saved, COUNT(*) AS cnt FROM goal_contributions WHERE goal_id = ?`,
    [id]
  );
  const row = await db.get(
    `SELECT g.id, g.user_id, g.name, g.target_amount, g.currency, g.deadline, g.icon, g.color, g.archived, g.created_at, g.updated_at
     FROM goals g WHERE g.id = ? AND g.user_id = ?`,
    [id, userId]
  );
  res.json(mapGoalRow(row, agg?.saved, agg?.cnt));
});

app.delete('/api/goals/:id', async (req, res) => {
  const userId = String(req.authUserId ?? '').trim();
  const id = String(req.params.id ?? '').trim();
  if (!userId || !id) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const cur = await db.get('SELECT id FROM goals WHERE user_id = ? AND id = ?', [userId, id]);
  if (!cur) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }
  const linked = await db.all(
    'SELECT transaction_id AS transactionId FROM goal_contributions WHERE goal_id = ? AND user_id = ? AND transaction_id IS NOT NULL',
    [id, userId]
  );
  for (const row of linked || []) {
    const tid = row?.transactionId ? String(row.transactionId).trim() : '';
    if (!tid) continue;
    const txRow = await db.get('SELECT * FROM transactions WHERE user_id = ? AND id = ? LIMIT 1', [userId, tid]);
    if (txRow) {
      await applyTransactionEffects(db, userId, txRow, -1);
      await db.run('DELETE FROM transactions WHERE user_id = ? AND id = ?', [userId, tid]);
    }
  }
  await db.run('DELETE FROM goal_contributions WHERE goal_id = ? AND user_id = ?', [id, userId]);
  await db.run('DELETE FROM goals WHERE id = ? AND user_id = ?', [id, userId]);
  res.status(204).end();
});

app.get('/api/goals/:id', async (req, res) => {
  const userId = String(req.authUserId ?? '').trim();
  const id = String(req.params.id ?? '').trim();
  if (!userId || !id) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const row = await db.get(
    `SELECT g.id, g.user_id, g.name, g.target_amount, g.currency, g.deadline, g.icon, g.color, g.archived, g.created_at, g.updated_at,
            COALESCE((SELECT SUM(amount) FROM goal_contributions WHERE goal_id = g.id), 0) AS saved,
            COALESCE((SELECT COUNT(*) FROM goal_contributions WHERE goal_id = g.id), 0) AS contributions_count
     FROM goals g
     WHERE g.user_id = ? AND g.id = ?`,
    [userId, id]
  );
  if (!row) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }
  res.json(mapGoalRow(row, row.saved, row.contributions_count));
});

app.get('/api/goals/:id/contributions', async (req, res) => {
  const userId = String(req.authUserId ?? '').trim();
  const goalId = String(req.params.id ?? '').trim();
  if (!userId || !goalId) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const goal = await db.get('SELECT id FROM goals WHERE user_id = ? AND id = ?', [userId, goalId]);
  if (!goal) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }
  const rows = await db.all(
    `SELECT id, goal_id AS goalId, amount, date, note, created_at AS createdAt, transaction_id AS transactionId
     FROM goal_contributions
     WHERE goal_id = ? AND user_id = ?
     ORDER BY date DESC, created_at DESC`,
    [goalId, userId]
  );
  res.json(
    (rows || []).map((r) => ({
      id: r.id,
      goalId: r.goalId,
      amount: Number(r.amount) || 0,
      date: r.date,
      note: r.note ?? '',
      createdAt: r.createdAt,
      transactionId: r.transactionId ? String(r.transactionId) : null,
    }))
  );
});

app.post('/api/goals/:id/contributions', async (req, res) => {
  const userId = String(req.authUserId ?? '').trim();
  const goalId = String(req.params.id ?? '').trim();
  if (!userId || !goalId) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const goalRow = await db.get(
    'SELECT id, name, currency FROM goals WHERE user_id = ? AND id = ?',
    [userId, goalId]
  );
  if (!goalRow) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }
  const amount = Number(req.body?.amount);
  const date = typeof req.body?.date === 'string' ? req.body.date : '';
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
  const accountKeyRaw = req.body?.accountKey;
  const accountKey =
    typeof accountKeyRaw === 'string' && accountKeyRaw.trim()
      ? String(accountKeyRaw).trim().toLowerCase().slice(0, 48)
      : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'amount must be > 0' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }

  const goalCurrency = normalizeCurrency(goalRow.currency);
  const goalName = String(goalRow.name || '').trim().slice(0, 80);
  const cid = uuidv4();
  const now = new Date().toISOString();

  if (accountKey) {
    const acct = await db.get(
      `SELECT account_key AS k, primary_currency AS pc
       FROM account_portfolio
       WHERE user_id = ? AND LOWER(account_key) = ?
       LIMIT 1`,
      [userId, accountKey]
    );
    if (!acct?.k) {
      res.status(400).json({ error: 'account not found', code: 'ACCOUNT_NOT_FOUND' });
      return;
    }
    const acctKey = String(acct.k).trim().toLowerCase();
    const acctCur = normalizeCurrency(acct.pc);
    if (acctCur !== goalCurrency) {
      res.status(400).json({
        error: 'account primary currency must match goal currency',
        code: 'ACCOUNT_CURRENCY_MISMATCH',
      });
      return;
    }
    const userNote = note.slice(0, 80);
    const goalPrefix = `Ціль: ${goalName}`.slice(0, 80);
    const baseNote = userNote ? `${goalPrefix}. ${userNote}` : goalPrefix;
    let txNote = mergeAccountIntoNote(baseNote, acctKey);
    if (txNote.length > 120) txNote = txNote.slice(0, 120);
    const txId = uuidv4();
    const txDate = `${date}T12:00:00.000Z`;

    await db.run('BEGIN IMMEDIATE');
    try {
      await db.run(
        `INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date, note)
         VALUES (?, ?, ?, ?, 'other_expense', 'expense', ?, ?)`,
        [txId, userId, amount, goalCurrency, txDate, txNote]
      );
      await applyTransactionEffects(db, userId, {
        amount,
        currency: goalCurrency,
        type: 'expense',
        note: txNote,
      });
      await checkBudgetThresholdsAfterExpense(userId, 'other_expense');
      await db.run(
        `INSERT INTO goal_contributions (id, goal_id, user_id, amount, date, note, created_at, transaction_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cid, goalId, userId, amount, date, note || null, now, txId]
      );
      await db.run('UPDATE goals SET updated_at = ? WHERE id = ? AND user_id = ?', [now, goalId, userId]);
      await db.run('COMMIT');
    } catch (e) {
      try {
        await db.run('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('[goals] contribution with account failed', e);
      res.status(500).json({ error: 'failed to save contribution', code: 'CONTRIBUTION_SAVE_FAILED' });
      return;
    }

    res.status(201).json({
      id: cid,
      goalId,
      amount,
      date,
      note,
      createdAt: now,
      transactionId: txId,
    });
    return;
  }

  await db.run(
    `INSERT INTO goal_contributions (id, goal_id, user_id, amount, date, note, created_at, transaction_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    [cid, goalId, userId, amount, date, note || null, now]
  );
  await db.run('UPDATE goals SET updated_at = ? WHERE id = ? AND user_id = ?', [now, goalId, userId]);

  res.status(201).json({
    id: cid,
    goalId,
    amount,
    date,
    note,
    createdAt: now,
    transactionId: null,
  });
});

app.delete('/api/goals/:id/contributions/:contribId', async (req, res) => {
  const userId = String(req.authUserId ?? '').trim();
  const goalId = String(req.params.id ?? '').trim();
  const contribId = String(req.params.contribId ?? '').trim();
  if (!userId || !goalId || !contribId) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const row = await db.get(
    'SELECT id, transaction_id AS transactionId FROM goal_contributions WHERE id = ? AND goal_id = ? AND user_id = ?',
    [contribId, goalId, userId]
  );
  if (!row) {
    res.status(404).json({ error: 'Contribution not found' });
    return;
  }
  const linkedTxId = row.transactionId ? String(row.transactionId).trim() : '';
  if (linkedTxId) {
    const txRow = await db.get('SELECT * FROM transactions WHERE user_id = ? AND id = ? LIMIT 1', [userId, linkedTxId]);
    if (txRow) {
      await applyTransactionEffects(db, userId, txRow, -1);
      await db.run('DELETE FROM transactions WHERE user_id = ? AND id = ?', [userId, linkedTxId]);
    }
  }
  await db.run('DELETE FROM goal_contributions WHERE id = ? AND goal_id = ? AND user_id = ?', [contribId, goalId, userId]);
  const now = new Date().toISOString();
  await db.run('UPDATE goals SET updated_at = ? WHERE id = ? AND user_id = ?', [now, goalId, userId]);
  res.status(204).end();
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

app.get('/api/crypto-prices-history', async (_req, res) => {
  const payload = await fetchCryptoUsdHistory();
  res.json(payload);
});

const ACCOUNT_ICON_KEYS_ALLOWED = new Set([
  'CreditCard',
  'Landmark',
  'Wallet',
  'Banknote',
  'PiggyBank',
  'Coins',
  'CircleDollarSign',
  'HandCoins',
]);

const normalizeAccountBadge = (raw) => {
  const s = String(raw ?? '')
    .trim()
    .replace(/[^\p{L}\p{N}]/gu, '');
  const out = s.slice(0, 3);
  return out ? out.toUpperCase() : '';
};

const normalizeAccountIconKey = (raw) => {
  const k = raw == null ? '' : typeof raw === 'string' ? raw.trim() : '';
  if (!k || k === 'auto') return null;
  return ACCOUNT_ICON_KEYS_ALLOWED.has(k) ? k : null;
};

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
       icon_key AS iconKey,
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
  const badge = normalizeAccountBadge(typeof req.body?.badge === 'string' ? req.body.badge : '');
  const iconKey = normalizeAccountIconKey(req.body?.iconKey);
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
  if (!['bank', 'cash', 'crypto', 'stocks', 'debt'].includes(section)) {
    res.status(400).json({ error: 'section must be bank, cash, crypto, stocks, or debt' });
    return;
  }
  if (!Number.isFinite(sortIndex)) {
    res.status(400).json({ error: 'sortIndex must be a number' });
    return;
  }
  if (!['bank', 'cash', 'crypto', 'stocks', 'debt', 'neutral'].includes(iconTone)) {
    res.status(400).json({ error: 'iconTone must be bank, cash, crypto, stocks, debt, or neutral' });
    return;
  }

  const normalizedBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'account';
  const userSlug = String(userId).replace(/[^a-z0-9]/gi, '');
  let accountKey = `${userSlug}_${normalizedBase}`;
  let suffix = 2;
  while (await db.get('SELECT 1 FROM account_portfolio WHERE account_key = ? LIMIT 1', [accountKey])) {
    accountKey = `${userSlug}_${normalizedBase}_${suffix}`;
    suffix += 1;
  }

  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO account_portfolio
     (account_key, user_id, section, sort_index, name, primary_amount, primary_currency, sub_text, icon_tone, badge, icon_key, debt_phrase, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      iconKey,
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
       icon_key AS iconKey,
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
  const badge = normalizeAccountBadge(typeof req.body?.badge === 'string' ? req.body.badge : '');
  const iconKey = normalizeAccountIconKey(req.body?.iconKey);
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
  if (!['bank', 'cash', 'crypto', 'stocks', 'debt'].includes(section)) {
    res.status(400).json({ error: 'section must be bank, cash, crypto, stocks, or debt' });
    return;
  }
  if (!Number.isFinite(sortIndex)) {
    res.status(400).json({ error: 'sortIndex must be a number' });
    return;
  }
  if (!['bank', 'cash', 'crypto', 'stocks', 'debt', 'neutral'].includes(iconTone)) {
    res.status(400).json({ error: 'iconTone must be bank, cash, crypto, stocks, debt, or neutral' });
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
         icon_key = ?,
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
      iconKey,
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
       icon_key AS iconKey,
       debt_phrase AS debtPhrase,
       updatedAt
     FROM account_portfolio
     WHERE user_id = ? AND account_key = ?
     LIMIT 1`,
    [userId, accountKey]
  );

  res.json(row);
});

app.post('/api/accounts/:key/payment', authMiddleware, async (req, res) => {
  const userId = req.authUserId;
  const accountKey = String(req.params.key ?? '').trim();
  const amount = Number(req.body?.amount);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

  if (!accountKey) { res.status(400).json({ error: 'invalid key' }); return; }
  if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: 'amount must be positive' }); return; }

  const account = await db.get(
    `SELECT primary_amount, primary_currency, name FROM account_portfolio
     WHERE user_id = ? AND account_key = ? AND section = 'debt' LIMIT 1`,
    [userId, accountKey]
  );
  if (!account) { res.status(404).json({ error: 'debt account not found' }); return; }

  const newAmount = Math.max(0, Number(account.primary_amount) - amount);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const txId = uuidv4();
  const currency = account.primary_currency === 'PLN' ? 'PLN' : 'UAH';

  await db.run('BEGIN IMMEDIATE');
  try {
    await db.run(
      'UPDATE account_portfolio SET primary_amount = ?, updatedAt = ? WHERE user_id = ? AND account_key = ?',
      [newAmount, now, userId, accountKey]
    );
    await db.run(
      `INSERT INTO transactions (id, user_id, type, amount, currency, categoryId, date, note, fromAccountKey, toAccountKey)
       VALUES (?, ?, 'income', ?, ?, 'debt_return', ?, ?, ?, NULL)`,
      [txId, userId, amount, currency, today,
       note || `Повернення: ${account.name}`, accountKey]
    );
    await db.run('COMMIT');
  } catch (e) {
    await db.run('ROLLBACK');
    throw e;
  }
  res.json({ newAmount, transactionId: txId });
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
  const transactions = await db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, rowid DESC', [userId]);
  res.json(transactions);
});

app.post('/api/transactions', async (req, res) => {
  const userId = req.authUserId;
  const amount = parseAmount(req.body?.amount);
  const currency = normalizeCurrency(req.body?.currency);
  const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId.trim() : '';
  const type =
    req.body?.type === 'income' || req.body?.type === 'expense' || req.body?.type === 'transfer'
      ? req.body.type
      : '';
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  const parsedTxDate = req.body?.date === undefined ? new Date() : parseIsoDate(req.body.date);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'amount must be > 0', code: 'INVALID_AMOUNT' });
    return;
  }
  if (!type) {
    res.status(400).json({ error: 'type must be income, expense, or transfer', code: 'INVALID_TYPE' });
    return;
  }
  if (type !== 'transfer' && !categoryId) {
    res.status(400).json({ error: 'categoryId is required', code: 'INVALID_CATEGORY' });
    return;
  }
  if (note.length > 120) {
    res.status(400).json({ error: 'note must be <= 120 chars', code: 'INVALID_NOTE' });
    return;
  }
  if (!parsedTxDate) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD', code: 'INVALID_DATE' });
    return;
  }

  let transferFields = {
    fromAccountKey: null,
    toAccountKey: null,
    transferToAmount: null,
    transferToCurrency: null,
  };
  if (type === 'transfer') {
    const accountsByKey = await getAccountsByKeys(db, userId, [req.body?.fromAccountKey, req.body?.toAccountKey]);
    const validated = validateTransferPayload({
      amount,
      currency,
      fromAccountKey: req.body?.fromAccountKey,
      toAccountKey: req.body?.toAccountKey,
      transferToAmount: req.body?.transferToAmount,
      transferToCurrency: req.body?.transferToCurrency,
      accountsByKey,
    });
    if (!validated.ok) {
      res.status(validated.status).json({ error: validated.error, code: validated.code });
      return;
    }
    transferFields = {
      fromAccountKey: validated.fromAccountKey,
      toAccountKey: validated.toAccountKey,
      transferToAmount: validated.transferToAmount,
      transferToCurrency: validated.transferToCurrency,
    };
  }

  const transaction = {
    id: uuidv4(),
    user_id: userId,
    amount,
    currency,
    categoryId: type === 'transfer' ? 'transfer' : categoryId,
    type,
    date: parsedTxDate.toISOString(),
    note: note || undefined,
    ...transferFields,
  };

  await db.run(
    `INSERT INTO transactions
      (id, user_id, amount, currency, transferToAmount, transferToCurrency, categoryId, type, date, note, fromAccountKey, toAccountKey)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transaction.id,
      transaction.user_id,
      transaction.amount,
      transaction.currency,
      transaction.transferToAmount,
      transaction.transferToCurrency,
      transaction.categoryId,
      transaction.type,
      transaction.date,
      transaction.note ?? null,
      transaction.fromAccountKey,
      transaction.toAccountKey,
    ]
  );
  await applyTransactionEffects(db, userId, transaction);
  if (type === 'expense') {
    await checkBudgetThresholdsAfterExpense(userId, categoryId);
  }

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
  const type =
    req.body?.type === 'income' || req.body?.type === 'expense' || req.body?.type === 'transfer'
      ? req.body.type
      : current.type;
  const parsedTxDate = req.body?.date === undefined ? new Date(current.date) : parseIsoDate(req.body.date);
  const note = req.body?.note === undefined
    ? (current.note ?? '')
    : (typeof req.body.note === 'string' ? req.body.note.trim() : '');
  const fromAccountKey = req.body?.fromAccountKey === undefined ? current.fromAccountKey : req.body.fromAccountKey;
  const toAccountKey = req.body?.toAccountKey === undefined ? current.toAccountKey : req.body.toAccountKey;
  const transferToAmount = req.body?.transferToAmount === undefined ? current.transferToAmount : req.body.transferToAmount;
  const transferToCurrency = req.body?.transferToCurrency === undefined ? current.transferToCurrency : req.body.transferToCurrency;

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'amount must be > 0' });
    return;
  }
  if (type !== 'transfer' && !categoryId) {
    res.status(400).json({ error: 'categoryId is required' });
    return;
  }
  if (type !== 'income' && type !== 'expense' && type !== 'transfer') {
    res.status(400).json({ error: 'type must be income, expense, or transfer' });
    return;
  }
  if (!parsedTxDate || Number.isNaN(parsedTxDate.getTime())) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }
  if (note.length > 120) {
    res.status(400).json({ error: 'note must be <= 120 chars' });
    return;
  }

  let nextTransferFields = {
    fromAccountKey: null,
    toAccountKey: null,
    transferToAmount: null,
    transferToCurrency: null,
  };
  if (type === 'transfer') {
    const accountsByKey = await getAccountsByKeys(db, userId, [fromAccountKey, toAccountKey]);
    const validated = validateTransferPayload({
      amount,
      currency,
      fromAccountKey,
      toAccountKey,
      transferToAmount,
      transferToCurrency,
      accountsByKey,
    });
    if (!validated.ok) {
      res.status(validated.status).json({ error: validated.error, code: validated.code });
      return;
    }
    nextTransferFields = {
      fromAccountKey: validated.fromAccountKey,
      toAccountKey: validated.toAccountKey,
      transferToAmount: validated.transferToAmount,
      transferToCurrency: validated.transferToCurrency,
    };
  }

  const nextTransaction = {
    ...current,
    amount,
    currency,
    categoryId: type === 'transfer' ? 'transfer' : categoryId,
    type,
    date: parsedTxDate.toISOString(),
    note: note || undefined,
    ...nextTransferFields,
  };

  await db.run(
    `UPDATE transactions
     SET amount = ?,
         currency = ?,
         transferToAmount = ?,
         transferToCurrency = ?,
         categoryId = ?,
         type = ?,
         date = ?,
         note = ?,
         fromAccountKey = ?,
         toAccountKey = ?
     WHERE user_id = ? AND id = ?`,
    [
      nextTransaction.amount,
      nextTransaction.currency,
      nextTransaction.transferToAmount,
      nextTransaction.transferToCurrency,
      nextTransaction.categoryId,
      nextTransaction.type,
      nextTransaction.date,
      nextTransaction.note ?? null,
      nextTransaction.fromAccountKey,
      nextTransaction.toAccountKey,
      userId,
      id,
    ]
  );
  await applyTransactionEffects(db, userId, current, -1);
  await applyTransactionEffects(db, userId, nextTransaction, 1);

  res.json(nextTransaction);
});

app.delete('/api/transactions/:id', async (req, res) => {
  const userId = req.authUserId;
  const { id } = req.params;
  const current = await db.get('SELECT * FROM transactions WHERE user_id = ? AND id = ? LIMIT 1', [userId, id]);
  if (!current) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }
  const linkedGoals = await db.all(
    'SELECT goal_id AS goalId FROM goal_contributions WHERE user_id = ? AND transaction_id = ?',
    [userId, id]
  );
  const now = new Date().toISOString();
  if (Array.isArray(linkedGoals) && linkedGoals.length > 0) {
    await db.run('DELETE FROM goal_contributions WHERE user_id = ? AND transaction_id = ?', [userId, id]);
    const seen = new Set();
    for (const row of linkedGoals) {
      const gid = row?.goalId ? String(row.goalId) : '';
      if (!gid || seen.has(gid)) continue;
      seen.add(gid);
      await db.run('UPDATE goals SET updated_at = ? WHERE id = ? AND user_id = ?', [now, gid, userId]);
    }
  }
  await applyTransactionEffects(db, userId, current, -1);
  await db.run('DELETE FROM transactions WHERE user_id = ? AND id = ?', [userId, id]);
  res.status(204).send();
});

// --- Receipt OCR scan ---
app.post('/api/receipts/scan', express.json({ limit: '12mb' }), createReceiptScanHandler());

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
    `SELECT id, name, amount, currency, categoryId, cycle, nextChargeDate, note, active, createdAt, updatedAt
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
      currency: normalizeCurrency(row.currency),
      categoryId: typeof row.categoryId === 'string' && row.categoryId.trim() ? row.categoryId : 'other_expense',
      active: Boolean(row.active),
    }))
  );
});

app.post('/api/subscriptions', async (req, res) => {
  const userId = req.authUserId;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  const amount = Number(req.body?.amount);
  const currency = normalizeCurrency(req.body?.currency);
  const categoryId = typeof req.body?.categoryId === 'string' && req.body.categoryId.trim()
    ? req.body.categoryId.trim()
    : 'other_expense';
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
    `INSERT INTO subscriptions (id, user_id, name, amount, currency, categoryId, cycle, nextChargeDate, note, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, userId, name, amount, currency, categoryId, cycle, nextChargeDate, note, now, now]
  );

  res.status(201).json({
    id,
    name,
    amount,
    currency,
    categoryId,
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
  const currency = req.body?.currency === undefined
    ? normalizeCurrency(current.currency)
    : normalizeCurrency(req.body.currency);
  const categoryId = req.body?.categoryId === undefined
    ? (typeof current.categoryId === 'string' && current.categoryId.trim() ? current.categoryId : 'other_expense')
    : (typeof req.body.categoryId === 'string' && req.body.categoryId.trim() ? req.body.categoryId.trim() : 'other_expense');
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
     SET name = ?, amount = ?, currency = ?, categoryId = ?, cycle = ?, nextChargeDate = ?, note = ?, active = ?, updatedAt = ?
     WHERE user_id = ? AND id = ?`,
    [name, amount, currency, categoryId, cycle, nextChargeDate, note, active ? 1 : 0, now, userId, id]
  );
  res.json({
    ...current,
    name,
    amount,
    currency,
    categoryId,
    cycle,
    nextChargeDate,
    note,
    active,
    updatedAt: now,
  });
});

app.delete('/api/subscriptions/:id', async (req, res) => {
  const userId = req.authUserId;
  const { id } = req.params;
  const result = await db.run('DELETE FROM subscriptions WHERE user_id = ? AND id = ?', [userId, id]);
  if (!result || result.changes === 0) {
    res.status(404).json({ error: 'Subscription not found' });
    return;
  }
  res.json({ id, deleted: true });
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

app.get('/api/planner/settings', async (req, res) => {
  const userId = req.authUserId;
  const settings = await getPlannerUserSettings(db, userId);
  res.json(settings);
});

app.put('/api/planner/settings', async (req, res) => {
  const userId = req.authUserId;
  if (req.body?.defaultShiftTemplateId !== undefined && req.body.defaultShiftTemplateId !== null) {
    const v = req.body.defaultShiftTemplateId;
    if (v !== 'none' && typeof v !== 'string') {
      res.status(400).json({ error: 'defaultShiftTemplateId must be template id, "none", or null' });
      return;
    }
  }
  const updated = await updatePlannerUserSettings(db, userId, {
    defaultShiftTemplateId: req.body?.defaultShiftTemplateId,
  });
  if (updated?.error === 'TEMPLATE_NOT_FOUND') {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(updated);
});

app.get('/api/planner/automation', async (req, res) => {
  const userId = req.authUserId;
  await ensurePlannerUserSettings(db, userId);
  const row = await db.get(
    'SELECT automation_token FROM planner_user_settings WHERE user_id = ? LIMIT 1',
    [userId]
  );
  const token = String(row?.automation_token ?? '');
  res.json({
    token,
    ...buildAutomationShiftUrls(req, token),
  });
});

app.post('/api/planner/automation/rotate-token', async (req, res) => {
  const userId = req.authUserId;
  await ensurePlannerUserSettings(db, userId);
  const token = createAutomationToken();
  await db.run(
    `UPDATE planner_user_settings SET automation_token = ?, updated_at = ? WHERE user_id = ?`,
    [token, new Date().toISOString(), userId]
  );
  res.json({
    token,
    ...buildAutomationShiftUrls(req, token),
  });
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
  await db.run(
    `UPDATE planner_user_settings SET default_shift_template_id = NULL, updated_at = ?
     WHERE user_id = ? AND default_shift_template_id = ?`,
    [new Date().toISOString(), userId, id]
  );
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
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const { templateId, startedAt, startedDay } = body;
  const now = new Date().toISOString();
  const userTimeZone = await getUserTimeZone(db, userId);
  const startIso = normalizeClientShiftStartIso(typeof startedAt === 'string' ? startedAt : '', now, userTimeZone);
  const startDayLocal =
    (typeof startedDay === 'string' && startedDay.trim()) ||
    dayFromIsoInZone(startIso, userTimeZone) ||
    startIso.slice(0, 10);
  const result = await startActiveShiftForUser(db, userId, {
    templateId: typeof templateId === 'string' && templateId.trim() ? templateId.trim() : null,
    startedAt: startIso,
    startedDay: startDayLocal,
    userTimeZone,
  });
  if (!result.ok) {
    if (result.code === 'ALREADY_ACTIVE') {
      res.status(400).json({ error: 'Shift already active' });
      return;
    }
    if (result.code === 'TEMPLATE_NOT_FOUND') {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.status(400).json({ error: 'Could not start shift' });
    return;
  }
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
  const userTimeZone = await getUserTimeZone(db, userId);
  const startedMs = shiftStartedAtToUtcMs(active.started_at, userTimeZone);
  if (!Number.isFinite(startedMs)) {
    res.status(400).json({ error: 'Invalid shift start timestamp' });
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
  const diffHours = Math.max(0, (now.getTime() - startedMs) / (1000 * 60 * 60));
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

app.delete('/api/me', authMiddleware, async (req, res) => {
  const userId = req.authUserId;
  const USER_TABLES = [
    'transactions',
    'custom_categories',
    'subscriptions',
    'planner_days',
    'planner_shift_entries',
    'planner_shift_templates',
    'planner_user_settings',
    'account_portfolio',
    'bot_active_shifts',
    'bot_report_settings',
    'bot_report_deliveries',
    'user_reminders',
    'reminder_deliveries',
    'category_budgets',
    'budget_alerts',
    'goals',
    'goal_contributions',
  ];
  await db.run('BEGIN IMMEDIATE');
  try {
    for (const table of USER_TABLES) {
      await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    }
    await db.run('DELETE FROM users WHERE telegram_id = ?', [Number(userId)]);
    await db.run('COMMIT');
  } catch (e) {
    await db.run('ROLLBACK');
    throw e;
  }
  res.status(204).end();
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
