import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import {
  categoryForBybitRecord,
  connectBybitCard,
  decryptCredential,
  encryptCredential,
  normalizeBybitRecord,
  signBybitRequest,
  syncBybitCard,
} from './bybit-card.js';

describe('Bybit Card integration helpers', () => {
  const encryptionKey = crypto.randomBytes(32).toString('base64');

  it('encrypts and decrypts credentials', () => {
    const encrypted = encryptCredential('secret-value', encryptionKey);
    expect(encrypted).not.toContain('secret-value');
    expect(decryptCredential(encrypted, encryptionKey)).toBe('secret-value');
  });

  it('creates an HMAC signature using Bybit payload order', () => {
    const signature = signBybitRequest({
      timestamp: '1672192200000',
      apiKey: 'test-key',
      recvWindow: '5000',
      payload: 'limit=10',
      secret: 'test-secret',
    });
    expect(signature).toBe(
      crypto.createHmac('sha256', 'test-secret').update('1672192200000test-key5000limit=10').digest('hex')
    );
  });

  it('maps common merchant categories', () => {
    expect(categoryForBybitRecord({ mccCode: '5411' })).toBe('food');
    expect(categoryForBybitRecord({ mccCode: '4121' })).toBe('transport');
    expect(categoryForBybitRecord({ merchCategoryDesc: 'Pharmacy' })).toBe('health');
  });

  it('normalizes a supported purchase', () => {
    const result = normalizeBybitRecord(
      {
        orderNo: 'order-1',
        txnCreate: 1672211918471,
        transactionCurrencyAmount: '42.50',
        transactionCurrency: 'PLN',
        basicAmount: '10',
        basicCurrency: 'USD',
        merchName: 'Market',
        mccCode: '5411',
      },
      'purchase'
    );
    expect(result).toMatchObject({
      externalId: 'purchase:order-1',
      amount: 42.5,
      currency: 'PLN',
      categoryId: 'food',
      type: 'expense',
    });
  });

  it('uses paidAmount when transactionCurrencyAmount is missing', () => {
    const result = normalizeBybitRecord(
      {
        orderNo: 'order-paid',
        txnCreate: 1672211918471,
        paidAmount: '15.00',
        paidCurrency: 'UAH',
        merchName: 'Shop',
        mccCode: '5411',
      },
      'purchase'
    );
    expect(result).toMatchObject({
      amount: 15,
      currency: 'UAH',
      type: 'expense',
    });
  });

  it('skips currencies the app cannot represent safely', () => {
    expect(
      normalizeBybitRecord(
        {
          orderNo: 'order-2',
          txnCreate: 1672211918471,
          transactionCurrencyAmount: '10',
          transactionCurrency: 'EUR',
          basicAmount: '10',
          basicCurrency: 'EUR',
        },
        'purchase'
      )
    ).toBeNull();
  });

  it('imports a card purchase once across repeated syncs', async () => {
    const previousKey = process.env.BYBIT_CREDENTIALS_KEY;
    process.env.BYBIT_CREDENTIALS_KEY = encryptionKey;
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        categoryId TEXT NOT NULL,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        note TEXT,
        fromAccountKey TEXT,
        toAccountKey TEXT
      );
      CREATE TABLE bybit_card_connections (
        user_id TEXT PRIMARY KEY,
        api_key_enc TEXT NOT NULL,
        api_secret_enc TEXT NOT NULL,
        api_key_hint TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        sync_from TEXT NOT NULL,
        last_sync_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE bybit_card_imports (
        user_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        order_no TEXT,
        txn_id TEXT,
        transaction_id TEXT NOT NULL,
        record_status TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, external_id)
      );
    `);
    const fetchImpl = async (url) => {
      const textUrl = String(url);
      if (textUrl.includes('/v5/user/query-api')) {
        return new Response(JSON.stringify({
          retCode: 0,
          result: {
            readOnly: 1,
            isMaster: true,
            permissions: { BitCard: ['BitCard'] },
          },
        }), { status: 200 });
      }
      // Card endpoint: params in query string (official docs)
      const isFinancial = textUrl.includes('SIDE_QUERY_FINANCIAL');
      return new Response(JSON.stringify({
        retCode: 0,
        result: {
          data: isFinancial
            ? [{
                orderNo: 'order-100',
                txnId: 'txn-100',
                txnCreate: Date.now(),
                tradeStatus: '1',
                status: '1',
                side: '3',
                transactionCurrencyAmount: '19.99',
                transactionCurrency: 'PLN',
                merchName: 'Coffee Shop',
                mccCode: '5814',
              }]
            : [],
        },
      }), { status: 200 });
    };

    try {
      await connectBybitCard({
        db,
        userId: 'user-1',
        apiKey: 'api-key-value',
        secret: 'api-secret-value',
        fetchImpl,
      });
      const first = await syncBybitCard({ db, userId: 'user-1', fetchImpl });
      const second = await syncBybitCard({ db, userId: 'user-1', fetchImpl });
      const rows = await db.all('SELECT * FROM transactions');
      expect(first.imported).toBe(1);
      expect(second.imported).toBe(0);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ amount: 19.99, currency: 'PLN', categoryId: 'food', type: 'expense' });
    } finally {
      await db.close();
      if (previousKey === undefined) delete process.env.BYBIT_CREDENTIALS_KEY;
      else process.env.BYBIT_CREDENTIALS_KEY = previousKey;
    }
  });
});
