import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_ENDPOINTS = ['https://api.bybit.com', 'https://api.bybit.eu'];
const SUPPORTED_CURRENCIES = new Set(['UAH', 'PLN', 'USD']);
const RECV_WINDOW = '5000';
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const parseEncryptionKey = (value = process.env.BYBIT_CREDENTIALS_KEY) => {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('BYBIT_CREDENTIALS_KEY is not configured');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('BYBIT_CREDENTIALS_KEY must be a base64-encoded 32-byte key');
  return key;
};

export const encryptCredential = (plainText, keyValue) => {
  const key = parseEncryptionKey(keyValue);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
};

export const decryptCredential = (encoded, keyValue) => {
  const key = parseEncryptionKey(keyValue);
  const [version, ivRaw, tagRaw, ciphertextRaw] = String(encoded ?? '').split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) throw new Error('Invalid encrypted credential');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

export const signBybitRequest = ({ timestamp, apiKey, recvWindow = RECV_WINDOW, payload = '', secret }) =>
  crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}${apiKey}${recvWindow}${payload}`)
    .digest('hex');

const buildQuery = (params = {}) => {
  // Stable alphabetical order — some Bybit gateways are picky about param order.
  const keys = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort();
  const query = new URLSearchParams();
  for (const key of keys) {
    query.set(key, String(params[key]));
  }
  return query.toString();
};

/**
 * Bybit V5 auth + card endpoints:
 * - GET  → sign queryString, params in URL
 * - POST (standard) → sign jsonBody, body = JSON
 * - POST /v5/card/* → official docs put params in the *query string* with no body.
 *   For those we sign an empty body string "" and put params on the URL.
 *
 * Use `queryParams: true` to force the card-style query-string POST.
 */
const requestBybit = async ({
  endpoint,
  path,
  method = 'GET',
  params,
  apiKey,
  secret,
  fetchImpl = fetch,
  queryParams = false,
}) => {
  const timestamp = String(Date.now());
  let url;
  let payload;
  let bodyText;

  if (method === 'POST' && !queryParams) {
    const bodyObj = {};
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null && value !== '') bodyObj[key] = value;
    }
    bodyText = JSON.stringify(bodyObj);
    payload = bodyText;
    url = `${endpoint}${path}`;
  } else {
    // GET, or POST with query-string params (Bybit Card endpoints)
    const query = buildQuery(params);
    payload = method === 'GET' ? query : '';
    bodyText = undefined;
    url = `${endpoint}${path}${query ? `?${query}` : ''}`;
  }

  const signature = signBybitRequest({ timestamp, apiKey, payload, secret });
  const response = await fetchImpl(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': RECV_WINDOW,
    },
    ...(bodyText !== undefined ? { body: bodyText } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Bybit HTTP ${response.status}`);
  const body = await response.json();
  if (Number(body?.retCode) !== 0) {
    const error = new Error(String(body?.retMsg || `Bybit error ${body?.retCode}`));
    error.code = String(body?.retCode ?? '');
    throw error;
  }
  return body;
};

export const validateBybitCredentials = async ({ apiKey, secret, fetchImpl = fetch }) => {
  let lastError;
  for (const endpoint of DEFAULT_ENDPOINTS) {
    try {
      const body = await requestBybit({
        endpoint,
        path: '/v5/user/query-api',
        apiKey,
        secret,
        fetchImpl,
      });
      const info = body?.result ?? {};
      if (Number(info.readOnly) !== 1) throw new Error('API key must be read-only');
      if (!Array.isArray(info?.permissions?.BitCard) || !info.permissions.BitCard.includes('BitCard')) {
        throw new Error('API key does not have BitCard permission');
      }
      if (info.isMaster !== true) throw new Error('BitCard requires a master account API key');
      return { endpoint, info };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Could not connect to Bybit');
};

const numericMcc = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const categoryForBybitRecord = (record) => {
  const mcc = numericMcc(record?.mccCode);
  const description = `${record?.merchCategoryDesc ?? ''} ${record?.merchName ?? ''}`.toLowerCase();
  if (
    [5411, 5422, 5441, 5451, 5462, 5499, 5811, 5812, 5813, 5814].includes(mcc) ||
    /grocery|supermarket|restaurant|cafe|coffee|food|bakery|market|продукт|ресторан|кафе/.test(description)
  ) return 'food';
  if (
    (mcc >= 3000 && mcc <= 3500) ||
    [4111, 4112, 4121, 4131, 4511, 4784, 4789, 5541, 5542, 7512, 7523].includes(mcc) ||
    /transport|taxi|uber|bolt|fuel|petrol|gas station|airline|railway|parking/.test(description)
  ) return 'transport';
  if (
    (mcc >= 8000 && mcc <= 8099) ||
    [5912, 5975, 5976].includes(mcc) ||
    /pharmacy|medical|doctor|dental|hospital|health/.test(description)
  ) return 'health';
  if (
    (mcc >= 5200 && mcc <= 5719) ||
    [4900, 7622, 7623, 7629, 7641].includes(mcc) ||
    /utility|electric|furniture|hardware|home/.test(description)
  ) return 'home';
  if (
    (mcc >= 7830 && mcc <= 7999) ||
    (mcc >= 5732 && mcc <= 5735) ||
    (mcc >= 5815 && mcc <= 5818) ||
    /cinema|movie|game|music|entertainment|streaming/.test(description)
  ) return 'entertainment';
  return 'other_expense';
};

const firstSupportedAmount = (record) => {
  const candidates = [
    [record?.transactionCurrencyAmount, record?.transactionCurrency],
    [record?.paidAmount, record?.paidCurrency],
    [record?.paidFiat, record?.paidCurrency || record?.basicCurrency],
    [record?.billAmount, record?.basicCurrency || record?.transactionCurrency],
    [record?.basicAmount, record?.basicCurrency],
    [record?.transactionAmount, record?.transactionCurrency],
  ];
  for (const [amountValue, currencyValue] of candidates) {
    const amount = Math.abs(Number(amountValue));
    const currency = String(currencyValue ?? '').toUpperCase();
    if (Number.isFinite(amount) && amount > 0 && SUPPORTED_CURRENCIES.has(currency)) {
      return { amount, currency };
    }
  }
  return null;
};

const recordId = (record, kind) => {
  const stable = String(
    kind === 'refund' ? record?.txnId || record?.orderNo : record?.orderNo || record?.txnId
  ).trim();
  if (stable) return `${kind}:${stable}`;
  const fallback = [
    kind,
    record?.side,
    record?.txnCreate,
    record?.merchName,
    record?.basicAmount,
    record?.basicCurrency,
  ].join('|');
  return `${kind}:hash:${crypto.createHash('sha256').update(fallback).digest('hex')}`;
};

export const normalizeBybitRecord = (record, kind) => {
  const amountInfo = firstSupportedAmount(record);
  if (!amountInfo) return null;
  const createdAtMs = Number(record?.txnCreate);
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return null;
  const merchant = String(record?.merchName || record?.merchCategoryDesc || 'Bybit Card')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  const isRefund = kind === 'refund' || ['4', '5', '6'].includes(String(record?.side));
  return {
    externalId: recordId(record, isRefund ? 'refund' : 'purchase'),
    amount: amountInfo.amount,
    currency: amountInfo.currency,
    categoryId: isRefund ? 'other_income' : categoryForBybitRecord(record),
    type: isRefund ? 'income' : 'expense',
    date: new Date(createdAtMs).toISOString(),
    note: `Bybit Card · ${merchant}`.slice(0, 120),
    merchant,
    orderNo: String(record?.orderNo ?? ''),
    txnId: String(record?.txnId ?? ''),
    status: String(record?.tradeStatus ?? record?.status ?? ''),
  };
};

const fetchCardRecords = async ({ endpoint, apiKey, secret, fetchImpl, startTime, endTime }) => {
  const all = [];
  const begin = Math.trunc(Number(startTime));
  const end = Math.trunc(Number(endTime));

  for (const [kind, type] of [
    ['financial', 'SIDE_QUERY_FINANCIAL'],
    ['refund', 'SIDE_QUERY_REFUND'],
  ]) {
    for (let page = 1; page <= 10; page += 1) {
      // Official docs: POST with params in the *query string*, no body.
      // https://bybit-exchange.github.io/docs/v5/bybit-card/asset-records
      let body;
      try {
        body = await requestBybit({
          endpoint,
          path: '/v5/card/transaction/query-asset-records',
          method: 'POST',
          queryParams: true,
          params: {
            type,
            createBeginTime: begin,
            createEndTime: end,
            limit: 100,
            page,
          },
          apiKey,
          secret,
          fetchImpl,
        });
      } catch (error) {
        error.message = `[${type} page ${page}] ${error.message}`;
        throw error;
      }
      const rows = Array.isArray(body?.result?.data) ? body.result.data : [];
      all.push(...rows.map((record) => ({ kind, record })));
      if (rows.length < 100) break;
    }
  }
  return all;
};

/**
 * Official side values (Bybit Card):
 *  1 Authorization, 2 Auth reversal, 3 Transaction, 4 Refund(unDeduct),
 *  5 Refund, 6 Chargeback, 7 Transaction(Direct), 8 Refund reversal,
 *  9 Chargeback reversal, 10 Refund request, 11 Refund reversal request,
 *  12 Chargeback fee, 13 ATM withdrawal
 *
 * tradeStatus: 0 In_Progress, 1 Completed, 2 Declined, 3 Reversal
 * status: -1 Init, 0 Pending, 1 Success, 2 Fail
 */
const shouldImport = ({ kind, record }) => {
  const tradeStatus = String(record?.tradeStatus ?? '');
  const status = String(record?.status ?? '');
  const side = String(record?.side ?? '');

  if (tradeStatus === '2' || tradeStatus === '3' || status === '2') return false;

  if (kind === 'financial') {
    const isPurchaseSide = ['3', '7', '13'].includes(side);
    const isDone = tradeStatus === '1' || status === '1';
    return isPurchaseSide && isDone;
  }

  if (kind === 'refund') {
    return ['4', '5', '6'].includes(side) && (tradeStatus === '1' || status === '1');
  }

  return false;
};

const publicConnection = async (db, userId) => {
  const row = await db.get(
    `SELECT enabled, api_key_hint, endpoint, last_sync_at, last_error, created_at
     FROM bybit_card_connections WHERE user_id = ?`,
    [userId]
  );
  if (!row) return { connected: false, enabled: false, importedCount: 0 };
  const count = await db.get('SELECT COUNT(*) AS count FROM bybit_card_imports WHERE user_id = ?', [userId]);
  return {
    connected: true,
    enabled: Boolean(row.enabled),
    keyHint: row.api_key_hint,
    endpoint: row.endpoint,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    connectedAt: row.created_at,
    importedCount: Number(count?.count) || 0,
  };
};

export const getBybitCardStatus = publicConnection;

export const connectBybitCard = async ({ db, userId, apiKey, secret, fetchImpl = fetch }) => {
  const cleanKey = String(apiKey ?? '').trim();
  const cleanSecret = String(secret ?? '').trim();
  if (cleanKey.length < 8 || cleanSecret.length < 8) throw new Error('Enter a valid API key and secret');
  parseEncryptionKey();
  const { endpoint } = await validateBybitCredentials({ apiKey: cleanKey, secret: cleanSecret, fetchImpl });
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO bybit_card_connections
      (user_id, api_key_enc, api_secret_enc, api_key_hint, endpoint, enabled, sync_from, last_sync_at, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, NULL, NULL, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       api_key_enc = excluded.api_key_enc,
       api_secret_enc = excluded.api_secret_enc,
       api_key_hint = excluded.api_key_hint,
       endpoint = excluded.endpoint,
       enabled = 1,
       sync_from = excluded.sync_from,
       last_sync_at = NULL,
       last_error = NULL,
       updated_at = excluded.updated_at`,
    [
      userId,
      encryptCredential(cleanKey),
      encryptCredential(cleanSecret),
      `••••${cleanKey.slice(-4)}`,
      endpoint,
      new Date(Date.now() - LOOKBACK_MS).toISOString(),
      now,
      now,
    ]
  );
  return publicConnection(db, userId);
};

const syncLocks = new Set();

export const syncBybitCard = async ({ db, userId, fetchImpl = fetch }) => {
  if (syncLocks.has(userId)) return { ...(await publicConnection(db, userId)), busy: true };
  syncLocks.add(userId);
  try {
    const connection = await db.get('SELECT * FROM bybit_card_connections WHERE user_id = ? AND enabled = 1', [userId]);
    if (!connection) throw new Error('Bybit Card is not connected');
    const apiKey = decryptCredential(connection.api_key_enc);
    const secret = decryptCredential(connection.api_secret_enc);
    const endTime = Date.now();
    const syncFromMs = Date.parse(connection.sync_from) || endTime - LOOKBACK_MS;
    const startTime = Math.max(syncFromMs, endTime - LOOKBACK_MS);
    const rawRecords = await fetchCardRecords({
      endpoint: connection.endpoint,
      apiKey,
      secret,
      fetchImpl,
      startTime,
      endTime,
    });

    const selected = new Map();
    for (const item of rawRecords) {
      if (!shouldImport(item)) continue;
      const normalized = normalizeBybitRecord(item.record, item.kind === 'refund' ? 'refund' : 'purchase');
      if (!normalized) continue;
      const priority = item.kind === 'financial' ? 2 : 3;
      const previous = selected.get(normalized.externalId);
      if (!previous || priority > previous.priority) selected.set(normalized.externalId, { ...normalized, priority });
    }

    let imported = 0;
    let updated = 0;
    await db.run('BEGIN IMMEDIATE');
    try {
      for (const item of selected.values()) {
        const existing = await db.get(
          'SELECT transaction_id FROM bybit_card_imports WHERE user_id = ? AND external_id = ?',
          [userId, item.externalId]
        );
        if (existing?.transaction_id) {
          await db.run(
            `UPDATE transactions SET amount = ?, currency = ?, categoryId = ?, type = ?, date = ?, note = ?
             WHERE id = ? AND user_id = ?`,
            [item.amount, item.currency, item.categoryId, item.type, item.date, item.note, existing.transaction_id, userId]
          );
          await db.run(
            `UPDATE bybit_card_imports SET order_no = ?, txn_id = ?, record_status = ?, updated_at = ?
             WHERE user_id = ? AND external_id = ?`,
            [item.orderNo, item.txnId, item.status, new Date().toISOString(), userId, item.externalId]
          );
          updated += 1;
          continue;
        }
        const transactionId = uuidv4();
        await db.run(
          `INSERT INTO transactions
            (id, user_id, amount, currency, categoryId, type, date, note, fromAccountKey, toAccountKey)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
          [transactionId, userId, item.amount, item.currency, item.categoryId, item.type, item.date, item.note]
        );
        await db.run(
          `INSERT INTO bybit_card_imports
            (user_id, external_id, order_no, txn_id, transaction_id, record_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            item.externalId,
            item.orderNo,
            item.txnId,
            transactionId,
            item.status,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
        imported += 1;
      }
      await db.run(
        'UPDATE bybit_card_connections SET last_sync_at = ?, last_error = NULL, updated_at = ? WHERE user_id = ?',
        [new Date().toISOString(), new Date().toISOString(), userId]
      );
      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
    return { ...(await publicConnection(db, userId)), imported, updated };
  } catch (error) {
    await db.run(
      'UPDATE bybit_card_connections SET last_error = ?, updated_at = ? WHERE user_id = ?',
      [String(error?.message || 'Sync failed').slice(0, 300), new Date().toISOString(), userId]
    );
    throw error;
  } finally {
    syncLocks.delete(userId);
  }
};

export const disconnectBybitCard = async (db, userId) => {
  await db.run('DELETE FROM bybit_card_connections WHERE user_id = ?', [userId]);
};

export const startBybitCardSync = ({ db, intervalMs = Number(process.env.BYBIT_SYNC_INTERVAL_MS) || 60_000 }) => {
  const run = async () => {
    const rows = await db.all('SELECT user_id FROM bybit_card_connections WHERE enabled = 1');
    for (const row of rows) {
      try {
        await syncBybitCard({ db, userId: String(row.user_id) });
      } catch (error) {
        console.error(`[bybit-card] Sync failed for user ${row.user_id}:`, error?.message || error);
      }
    }
  };
  const timer = setInterval(() => void run(), Math.max(30_000, intervalMs));
  timer.unref?.();
  return timer;
};
