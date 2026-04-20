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

// Serve index.html for any other requests (SPA fallback)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
