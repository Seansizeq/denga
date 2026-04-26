import express from 'express';
import cors from 'cors';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDatabasePath, initDb } from './db.js';
import { startScheduledDatabaseBackups } from './backup.js';
import path from 'path';
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
const getAccountSlugFromNote = (note) => {
  if (typeof note !== 'string' || !note.trim()) return null;
  const m = note.match(/\bAccount:\s*([a-z0-9_]{1,48})\b/i);
  if (!m?.[1]) return null;
  return m[1].toLowerCase();
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
          categoryId: 'other_expense',
          type: 'expense',
          date: txDate,
          note: note || undefined,
        };
        await db.run(
          'INSERT INTO transactions (id, user_id, amount, categoryId, type, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [tx.id, tx.user_id, tx.amount, tx.categoryId, tx.type, tx.date, tx.note ?? null]
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
  { id: 'other_income', name: 'Дохід (інше)' },
  { id: 'other_expense', name: 'Інше' },
];

const pendingTransactions = new Map();
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

if (bot) {
  bot.onText(/\/start/, async (msg) => {
    await db.run(
      'INSERT OR REPLACE INTO users (telegram_id, chat_id) VALUES (?, ?)',
      [msg.from.id, msg.chat.id]
    );
    bot.sendMessage(msg.chat.id, 'Привіт! Я твій помічник Denga. Надішли мені суму (наприклад, 100), щоб додати транзакцію.');
  });

  bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
      const amount = parseFloat(msg.text);
      if (!isNaN(amount)) {
        pendingTransactions.set(msg.chat.id, { amount });

        const keyboard = {
          inline_keyboard: CATEGORIES.map(c => [{ text: c.name, callback_data: `cat_${c.id}` }])
        };

        bot.sendMessage(msg.chat.id, `Виберіть категорію для суми ${amount}:`, { reply_markup: keyboard });
      }
    }
  });

  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const pending = pendingTransactions.get(chatId);

    if (pending && callbackQuery.data.startsWith('cat_')) {
      const categoryId = callbackQuery.data.replace('cat_', '');
      const category = CATEGORIES.find(c => c.id === categoryId);

      const type = (categoryId === 'salary' || categoryId === 'other_income') ? 'income' : 'expense';

      const transaction = {
        id: uuidv4(),
        user_id: String(callbackQuery.from.id),
        amount: pending.amount,
        categoryId,
        type,
        date: new Date().toISOString(),
        note: 'Added via Telegram Bot',
        telegram_user_id: callbackQuery.from.id
      };

      await db.run(
        'INSERT INTO transactions (id, user_id, amount, categoryId, type, date, note, telegram_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [transaction.id, transaction.user_id, transaction.amount, transaction.categoryId, transaction.type, transaction.date, transaction.note, transaction.telegram_user_id]
      );

      pendingTransactions.delete(chatId);
      bot.answerCallbackQuery(callbackQuery.id);
      bot.sendMessage(chatId, `✅ Транзакцію ${pending.amount} (${category.name}) додано!`);
    }
  });
} else {
  console.warn('Telegram bot is disabled: TELEGRAM_BOT_TOKEN is missing');
}

// --- API Logic ---
app.use('/api', authMiddleware);

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
  const existing = await db.get('SELECT account_key FROM account_portfolio WHERE user_id = ? AND account_key = ? LIMIT 1', [userId, accountKey]);
  if (!existing) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

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
    categoryId,
    type,
    date: new Date().toISOString(),
    note: note || undefined
  };

  await db.run(
    'INSERT INTO transactions (id, user_id, amount, categoryId, type, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [transaction.id, transaction.user_id, transaction.amount, transaction.categoryId, transaction.type, transaction.date, transaction.note ?? null]
  );
  await applyAccountDelta(db, userId, getAccountSlugFromNote(transaction.note), accountDeltaForTx(transaction));

  // Notify all users about new web transaction
  try {
    const users = bot ? await db.all('SELECT chat_id FROM users WHERE telegram_id = ?', [Number(userId)]) : [];
    const category = CATEGORIES.find(c => c.id === categoryId);
    for (const user of users) {
      bot.sendMessage(user.chat_id, `🌐 Нова транзакція через сайт: ${amount} (${category ? category.name : categoryId})`);
    }
  } catch (err) {
    console.error('Error notifying users:', err);
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

  await db.run('UPDATE transactions SET amount = ?, categoryId = ?, type = ?, note = ? WHERE user_id = ? AND id = ?', [amount, categoryId, type, note || null, userId, id]);
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

  res.json(
    days.map((row) => ({
      day: plannerDayFromStored(userId, row.day),
      hasShift: Boolean(row.hasShift),
      workedHours: Number(row.workedHours) || 0,
      salaryRate: Number(row.salaryRate) || 0,
      salaryAmount: Number(row.salaryAmount) || 0,
      salaryCurrency: row.salary_currency === 'PLN' ? 'PLN' : 'UAH',
      note: row.note ?? '',
      updatedAt: row.updatedAt,
    }))
  );
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
      salaryCurrency: row.currency === 'PLN' ? 'PLN' : 'UAH',
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
