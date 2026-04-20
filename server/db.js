import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../database.sqlite');

export async function initDb() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      categoryId TEXT NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      telegram_user_id INTEGER
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      chat_id INTEGER NOT NULL
    )
  `);

  return db;
}
