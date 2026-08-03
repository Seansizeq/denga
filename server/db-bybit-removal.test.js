import { describe, expect, it } from 'vitest';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { removeRetiredBybitIntegration } from './db.js';

describe('retired Bybit integration cleanup', () => {
  it('removes only integration-linked accounts and keeps older accounts and transactions', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE account_portfolio (
        account_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL
      );
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        note TEXT
      );
      CREATE TABLE bybit_asset_accounts (
        user_id TEXT NOT NULL,
        coin TEXT NOT NULL,
        account_key TEXT NOT NULL,
        PRIMARY KEY (user_id, coin)
      );
      CREATE TABLE bybit_card_connections (user_id TEXT PRIMARY KEY);
      CREATE TABLE bybit_card_imports (
        user_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        PRIMARY KEY (user_id, external_id)
      );

      INSERT INTO account_portfolio (account_key, user_id, name)
      VALUES
        ('legacy-bybit-card', 'user-1', 'Bybit Card'),
        ('legacy-bybit-total', 'user-1', 'Bybit overall'),
        ('generated-bybit-btc', 'user-1', 'Bybit BTC');
      INSERT INTO transactions (id, user_id, note)
      VALUES ('tx-1', 'user-1', 'Existing transaction');
      INSERT INTO bybit_asset_accounts (user_id, coin, account_key)
      VALUES ('user-1', 'BTC', 'generated-bybit-btc');
      INSERT INTO bybit_card_connections (user_id) VALUES ('user-1');
      INSERT INTO bybit_card_imports (user_id, external_id, transaction_id)
      VALUES ('user-1', 'purchase-1', 'tx-1');
    `);

    try {
      await removeRetiredBybitIntegration(db);

      expect(await db.all('SELECT account_key, name FROM account_portfolio ORDER BY account_key')).toEqual([
        { account_key: 'legacy-bybit-card', name: 'Bybit Card' },
        { account_key: 'legacy-bybit-total', name: 'Bybit overall' },
      ]);
      expect(await db.all('SELECT id, note FROM transactions')).toEqual([
        { id: 'tx-1', note: 'Existing transaction' },
      ]);
      const retiredTables = await db.all(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'bybit_%'",
      );
      expect(retiredTables).toEqual([]);
    } finally {
      await db.close();
    }
  });

  it('is safe on a fresh database without integration tables', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec('CREATE TABLE account_portfolio (account_key TEXT PRIMARY KEY, user_id TEXT NOT NULL)');
    try {
      await expect(removeRetiredBybitIntegration(db)).resolves.toBeUndefined();
    } finally {
      await db.close();
    }
  });
});
