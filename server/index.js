import express from 'express';
import cors from 'cors';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

app.use(cors());
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
      amount: pending.amount,
      categoryId,
      type,
      date: new Date().toISOString(),
      note: 'Added via Telegram Bot',
      telegram_user_id: callbackQuery.from.id
    };

    await db.run(
      'INSERT INTO transactions (id, amount, categoryId, type, date, note, telegram_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [transaction.id, transaction.amount, transaction.categoryId, transaction.type, transaction.date, transaction.note, transaction.telegram_user_id]
    );

    pendingTransactions.delete(chatId);
    bot.answerCallbackQuery(callbackQuery.id);
    bot.sendMessage(chatId, `✅ Транзакцію ${pending.amount} (${category.name}) додано!`);
  }
});

// --- API Logic ---

app.get('/api/transactions', async (req, res) => {
  const transactions = await db.all('SELECT * FROM transactions ORDER BY date DESC');
  res.json(transactions);
});

app.post('/api/transactions', async (req, res) => {
  const { amount, categoryId, type, note } = req.body;
  const transaction = {
    id: uuidv4(),
    amount,
    categoryId,
    type,
    date: new Date().toISOString(),
    note
  };

  await db.run(
    'INSERT INTO transactions (id, amount, categoryId, type, date, note) VALUES (?, ?, ?, ?, ?, ?)',
    [transaction.id, transaction.amount, transaction.categoryId, transaction.type, transaction.date, transaction.note]
  );

  // Notify all users about new web transaction
  try {
    const users = await db.all('SELECT chat_id FROM users');
    const category = CATEGORIES.find(c => c.id === categoryId);
    for (const user of users) {
      bot.sendMessage(user.chat_id, `🌐 Нова транзакція через сайт: ${amount} (${category ? category.name : categoryId})`);
    }
  } catch (err) {
    console.error('Error notifying users:', err);
  }
  
  res.status(201).json(transaction);
});

app.delete('/api/transactions/:id', async (req, res) => {
  const { id } = req.params;
  await db.run('DELETE FROM transactions WHERE id = ?', [id]);
  res.status(204).send();
});

app.get('/api/custom-categories', async (req, res) => {
  const type = String(req.query.type ?? '');
  if (type !== 'income' && type !== 'expense') {
    res.status(400).json({ error: 'type query must be income or expense' });
    return;
  }

  const stored = await db.all(
    'SELECT id, type, name, icon, color, updatedAt FROM custom_categories WHERE type = ? ORDER BY updatedAt DESC',
    [type]
  );

  const legacyRows = await db.all(
    'SELECT categoryId, MAX(date) AS lastUsedAt FROM transactions WHERE type = ? AND categoryId LIKE ? GROUP BY categoryId',
    [type, 'custom:%']
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
    'SELECT id, type, name, icon, color, updatedAt FROM custom_categories WHERE type = ? AND normalized_name = ? LIMIT 1',
    [type, normalizedName]
  );
  if (existing) {
    res.status(200).json(existing);
    return;
  }

  const id = createCustomCategoryId(name, icon, color);
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO custom_categories (id, type, name, normalized_name, icon, color, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, type, name, normalizedName, icon, color, now, now]
  );

  res.status(201).json({ id, type, name, icon, color, updatedAt: now });
});

app.get('/api/subscriptions', async (_req, res) => {
  const rows = await db.all(
    `SELECT id, name, amount, cycle, nextChargeDate, note, active, createdAt, updatedAt
     FROM subscriptions
     ORDER BY active DESC, nextChargeDate ASC, createdAt DESC`
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
    `INSERT INTO subscriptions (id, name, amount, cycle, nextChargeDate, note, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, name, amount, cycle, nextChargeDate, note, now, now]
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
  const { id } = req.params;
  const current = await db.get('SELECT * FROM subscriptions WHERE id = ? LIMIT 1', [id]);
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
     WHERE id = ?`,
    [name, amount, cycle, nextChargeDate, note, active ? 1 : 0, now, id]
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
  const month = String(req.query.month ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'month query must be in YYYY-MM format' });
    return;
  }

  const days = await db.all(
    'SELECT day, hasShift, workedHours, salaryRate, salaryAmount, salary_currency, note, updatedAt FROM planner_days WHERE day LIKE ? ORDER BY day ASC',
    [`${month}-%`]
  );

  res.json(
    days.map((row) => ({
      day: row.day,
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

  await db.run(
    `INSERT INTO planner_days (day, hasShift, workedHours, salaryRate, salaryAmount, salary_currency, note, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET
       hasShift = excluded.hasShift,
       workedHours = excluded.workedHours,
       salaryRate = excluded.salaryRate,
       salaryAmount = excluded.salaryAmount,
       salary_currency = excluded.salary_currency,
       note = excluded.note,
       updatedAt = excluded.updatedAt`,
    [day, hasShift, workedHours, salaryRate, salaryAmount, salaryCurrency, note, updatedAt]
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

app.get('/api/planner/shift-templates', async (_req, res) => {
  const rows = await db.all(
    `SELECT id, name, symbol, is_full_day, start_time, end_time, worked_hours, currency, updated_at
     FROM planner_shift_templates
     ORDER BY updated_at DESC`
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
      salaryCurrency: row.currency === 'PLN' ? 'PLN' : 'UAH',
      updatedAt: row.updated_at,
    }))
  );
});

app.post('/api/planner/shift-templates', async (req, res) => {
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
  const salaryCurrency = req.body.salaryCurrency === 'PLN' ? 'PLN' : 'UAH';

  const normalized_key = normalizeShiftTemplateKey(name, symbol, salaryCurrency);
  const now = new Date().toISOString();
  const existing = await db.get('SELECT id FROM planner_shift_templates WHERE normalized_key = ?', [normalized_key]);
  const id = existing?.id ?? uuidv4();

  if (existing) {
    await db.run(
      `UPDATE planner_shift_templates SET
        name = ?, symbol = ?, is_full_day = ?, start_time = ?, end_time = ?, worked_hours = ?, currency = ?, updated_at = ?
       WHERE id = ?`,
      [name, symbol, isFullDay ? 1 : 0, startTime, endTime, workedHours, salaryCurrency, now, id]
    );
  } else {
    await db.run(
      `INSERT INTO planner_shift_templates
        (id, normalized_key, name, symbol, is_full_day, start_time, end_time, worked_hours, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, normalized_key, name, symbol, isFullDay ? 1 : 0, startTime, endTime, workedHours, salaryCurrency, now, now]
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
    salaryCurrency,
    updatedAt: now,
  });
});

app.delete('/api/planner/shift-templates/:id', async (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const result = await db.run('DELETE FROM planner_shift_templates WHERE id = ?', [id]);
  if (!result.changes) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.status(204).end();
});

// Serve index.html for any other requests (SPA fallback)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
