import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_ENDPOINTS = ['https://api.bybit.com', 'https://api.bybit.eu'];
const SUPPORTED_CURRENCIES = new Set(['UAH', 'PLN', 'USD']);
const RECV_WINDOW = '5000';
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const TRACKED_BALANCE_COINS = ['BTC', 'ETH', 'SOL', 'TON', 'USDT'];

const createIntegrationError = (integrationCode, message, cause) => {
  const error = new Error(message, cause ? { cause } : undefined);
  error.integrationCode = integrationCode;
  return error;
};

const apiCodeOf = (error) => String(error?.code ?? '');

export const toBybitPublicError = (error) => {
  if (error?.integrationCode) {
    return { code: error.integrationCode, error: error.message };
  }
  const apiCode = apiCodeOf(error);
  if (apiCode === '81007') {
    return {
      code: 'BYBIT_EU_THIRD_PARTY_REQUIRED',
      error: 'Bybit EU only allows API access through approved third-party application connections.',
    };
  }
  if (apiCode === '10010') {
    return {
      code: 'BYBIT_IP_MISMATCH',
      error: 'This API key is restricted to different IP addresses. Add the Denga server IP in Bybit or remove the IP restriction.',
    };
  }
  if (apiCode === '10009' || apiCode === '10024' || apiCode === '110132') {
    return {
      code: 'BYBIT_REGION_RESTRICTED',
      error: 'Bybit API access is restricted for this account or region.',
    };
  }
  if (apiCode === '10005') {
    return {
      code: 'BYBIT_PERMISSION_DENIED',
      error: 'The API key does not have the required read permissions.',
    };
  }
  if (apiCode === '10003') {
    return {
      code: 'BYBIT_ENDPOINT_MISMATCH',
      error: 'The API key is invalid or belongs to another Bybit domain. Bybit EU requires an approved third-party connection.',
    };
  }
  if (apiCode === '10004' || apiCode === '10007' || error?.httpStatus === 401) {
    return {
      code: 'BYBIT_INVALID_CREDENTIALS',
      error: 'The API key or secret is invalid.',
    };
  }
  if (error?.httpStatus === 403) {
    return {
      code: 'BYBIT_REGION_RESTRICTED',
      error: 'Bybit rejected access from this server region or IP address.',
    };
  }
  const message = String(error?.message ?? '').toLowerCase();
  if (
    String(error?.requestPath ?? '').startsWith('/v5/card/') &&
    (apiCode === '10001' || message.includes('param_illegal') || message.includes('parameter'))
  ) {
    return {
      code: 'BYBIT_CARD_REQUEST_REJECTED',
      error: 'Bybit rejected the Card history request. Retry synchronization; if it repeats, contact Denga support.',
    };
  }
  return {
    code: 'BYBIT_REQUEST_FAILED',
    error: 'Bybit could not complete the read-only request. Try again later.',
  };
};

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
 * - POST /v5/card/* → official docs put params in the query string and send an
 *   empty JSON object. For those we sign and send "{}".
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
    // GET, or POST with query-string params (Bybit Card endpoints).
    const query = buildQuery(params);
    payload = method === 'GET' ? query : '{}';
    bodyText = method === 'GET' ? undefined : '{}';
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
  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch {
    /* handled below as an HTTP error */
  }
  if (!response.ok || Number(responseBody?.retCode) !== 0) {
    const error = new Error(String(responseBody?.retMsg || `Bybit HTTP ${response.status}`));
    error.code = String(responseBody?.retCode ?? `HTTP_${response.status}`);
    error.httpStatus = response.status;
    error.endpoint = endpoint;
    error.requestPath = path;
    throw error;
  }
  return responseBody;
};

export const validateBybitCredentials = async ({ apiKey, secret, fetchImpl = fetch }) => {
  const attempts = [];
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
      if (Number(info.readOnly) !== 1) {
        throw createIntegrationError('BYBIT_READ_ONLY_REQUIRED', 'API key must be read-only.');
      }
      if (!Array.isArray(info?.permissions?.BitCard) || !info.permissions.BitCard.includes('BitCard')) {
        throw createIntegrationError('BYBIT_CARD_PERMISSION_REQUIRED', 'Enable the read-only Bybit Card permission for this API key.');
      }
      if (info.isMaster !== true) {
        throw createIntegrationError('BYBIT_MASTER_KEY_REQUIRED', 'Bybit Card requires a master account API key.');
      }
      return { endpoint, info };
    } catch (error) {
      if (error?.integrationCode) throw error;
      attempts.push(error);
    }
  }

  const publicErrors = attempts.map(toBybitPublicError);
  const preferred = publicErrors.find((item) => item.code !== 'BYBIT_ENDPOINT_MISMATCH')
    ?? publicErrors[0]
    ?? { code: 'BYBIT_REQUEST_FAILED', error: 'Could not connect to Bybit.' };
  throw createIntegrationError(preferred.code, preferred.error, attempts.at(-1));
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
      // Official docs: POST with params in the query string and an empty JSON body.
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

export const normalizeBybitBalances = ({ unified, funding }) => {
  const totals = new Map(TRACKED_BALANCE_COINS.map((coin) => [coin, 0]));
  const unifiedRows = Array.isArray(unified?.result?.list)
    ? unified.result.list.flatMap((account) => Array.isArray(account?.coin) ? account.coin : [])
    : [];
  for (const row of unifiedRows) {
    const coin = String(row?.coin ?? '').toUpperCase();
    if (!totals.has(coin)) continue;
    const amount = Number(row?.equity ?? row?.walletBalance);
    if (Number.isFinite(amount) && amount > 0) totals.set(coin, totals.get(coin) + amount);
  }
  const fundingRows = Array.isArray(funding?.result?.balance) ? funding.result.balance : [];
  for (const row of fundingRows) {
    const coin = String(row?.coin ?? '').toUpperCase();
    if (!totals.has(coin)) continue;
    const amount = Number(row?.walletBalance);
    if (Number.isFinite(amount) && amount > 0) totals.set(coin, totals.get(coin) + amount);
  }
  return [...totals.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([coin, amount]) => ({ coin, amount }));
};

const fetchBybitBalances = async ({ endpoint, apiKey, secret, fetchImpl }) => {
  const coin = TRACKED_BALANCE_COINS.join(',');
  const [unifiedResult, fundingResult] = await Promise.allSettled([
    requestBybit({
      endpoint,
      path: '/v5/account/wallet-balance',
      params: { accountType: 'UNIFIED', coin },
      apiKey,
      secret,
      fetchImpl,
    }),
    requestBybit({
      endpoint,
      path: '/v5/asset/transfer/query-account-coins-balance',
      params: { accountType: 'FUND', coin },
      apiKey,
      secret,
      fetchImpl,
    }),
  ]);
  const unified = unifiedResult.status === 'fulfilled' ? unifiedResult.value : null;
  const funding = fundingResult.status === 'fulfilled' ? fundingResult.value : null;
  if (!unified && !funding) {
    throw unifiedResult.reason ?? fundingResult.reason ?? new Error('Bybit balances unavailable');
  }
  return {
    balances: normalizeBybitBalances({ unified, funding }),
    complete: Boolean(unified && funding),
    warning: unified && funding
      ? null
      : 'Some Bybit balances could not be read. Check the API key permissions and account type.',
  };
};

const nextBybitAccountKey = async (db, userId, coin) => {
  const ownerHash = crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 10);
  const base = `bybit_${ownerHash}_${coin.toLowerCase()}`;
  let key = base;
  let suffix = 2;
  while (await db.get('SELECT 1 FROM account_portfolio WHERE account_key = ? LIMIT 1', [key])) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
};

const syncBybitAssetAccounts = async (db, userId, balances, clearMissing) => {
  const amounts = new Map(balances.map((item) => [item.coin, item.amount]));
  const links = await db.all(
    'SELECT coin, account_key AS accountKey FROM bybit_asset_accounts WHERE user_id = ?',
    [userId],
  );
  const linkByCoin = new Map(links.map((row) => [String(row.coin), String(row.accountKey)]));
  const coins = new Set([
    ...amounts.keys(),
    ...(clearMissing ? linkByCoin.keys() : []),
  ]);
  const now = new Date().toISOString();
  for (const coin of coins) {
    const amount = Number(amounts.get(coin) ?? 0);
    let accountKey = linkByCoin.get(coin);
    if (!accountKey && amount <= 0) continue;
    if (!accountKey) {
      accountKey = await nextBybitAccountKey(db, userId, coin);
      const sortRow = await db.get(
        "SELECT COALESCE(MAX(sort_index), 0) AS maxSort FROM account_portfolio WHERE user_id = ? AND section = 'crypto'",
        [userId],
      );
      await db.run(
        `INSERT INTO account_portfolio
          (account_key, user_id, section, sort_index, name, primary_amount, primary_currency,
           sub_text, icon_tone, badge, debt_phrase, icon_key, debt_direction,
           debt_initial_amount, debt_created_at, updatedAt)
         VALUES (?, ?, 'crypto', ?, ?, 0, 'UAH', ?, 'crypto', ?, NULL, NULL, NULL, NULL, NULL, ?)`,
        [accountKey, userId, Number(sortRow?.maxSort) + 10, `Bybit ${coin}`, `${amount} ${coin}`, coin.slice(0, 3), now],
      );
      await db.run(
        'INSERT INTO bybit_asset_accounts (user_id, coin, account_key, updated_at) VALUES (?, ?, ?, ?)',
        [userId, coin, accountKey, now],
      );
    } else {
      const account = await db.get(
        'SELECT 1 FROM account_portfolio WHERE user_id = ? AND account_key = ? LIMIT 1',
        [userId, accountKey],
      );
      if (!account) {
        await db.run('DELETE FROM bybit_asset_accounts WHERE user_id = ? AND coin = ?', [userId, coin]);
        if (amount > 0) {
          const recreated = await nextBybitAccountKey(db, userId, coin);
          const sortRow = await db.get(
            "SELECT COALESCE(MAX(sort_index), 0) AS maxSort FROM account_portfolio WHERE user_id = ? AND section = 'crypto'",
            [userId],
          );
          await db.run(
            `INSERT INTO account_portfolio
              (account_key, user_id, section, sort_index, name, primary_amount, primary_currency,
               sub_text, icon_tone, badge, debt_phrase, icon_key, debt_direction,
               debt_initial_amount, debt_created_at, updatedAt)
             VALUES (?, ?, 'crypto', ?, ?, 0, 'UAH', ?, 'crypto', ?, NULL, NULL, NULL, NULL, NULL, ?)`,
            [recreated, userId, Number(sortRow?.maxSort) + 10, `Bybit ${coin}`, `${amount} ${coin}`, coin.slice(0, 3), now],
          );
          await db.run(
            'INSERT INTO bybit_asset_accounts (user_id, coin, account_key, updated_at) VALUES (?, ?, ?, ?)',
            [userId, coin, recreated, now],
          );
        }
        continue;
      }
      await db.run(
        `UPDATE account_portfolio
         SET section = 'crypto', primary_amount = 0, primary_currency = 'UAH', sub_text = ?,
             icon_tone = 'crypto', badge = ?, updatedAt = ?
         WHERE user_id = ? AND account_key = ?`,
        [`${amount} ${coin}`, coin.slice(0, 3), now, userId, accountKey],
      );
      await db.run(
        'UPDATE bybit_asset_accounts SET updated_at = ? WHERE user_id = ? AND coin = ?',
        [now, userId, coin],
      );
    }
  }
};

const publicConnection = async (db, userId) => {
  const row = await db.get(
    `SELECT enabled, api_key_hint, endpoint, last_sync_at, last_error, last_error_code, last_balance_error, created_at
     FROM bybit_card_connections WHERE user_id = ?`,
    [userId]
  );
  if (!row) return { connected: false, enabled: false, importedCount: 0 };
  const count = await db.get('SELECT COUNT(*) AS count FROM bybit_card_imports WHERE user_id = ?', [userId]);
  const assetCount = await db.get('SELECT COUNT(*) AS count FROM bybit_asset_accounts WHERE user_id = ?', [userId]);
  return {
    connected: true,
    enabled: Boolean(row.enabled),
    keyHint: row.api_key_hint,
    endpoint: row.endpoint,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    lastErrorCode: row.last_error_code,
    balanceSyncError: row.last_balance_error,
    connectedAt: row.created_at,
    importedCount: Number(count?.count) || 0,
    syncedAssetCount: Number(assetCount?.count) || 0,
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
       last_error_code = NULL,
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
    const [rawRecords, balanceResult] = await Promise.all([
      fetchCardRecords({
        endpoint: connection.endpoint,
        apiKey,
        secret,
        fetchImpl,
        startTime,
        endTime,
      }),
      fetchBybitBalances({ endpoint: connection.endpoint, apiKey, secret, fetchImpl })
        .catch((error) => ({ balances: null, complete: false, warning: toBybitPublicError(error).error })),
    ]);

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
      if (balanceResult.balances) {
        await syncBybitAssetAccounts(db, userId, balanceResult.balances, balanceResult.complete);
      }
      await db.run(
        'UPDATE bybit_card_connections SET last_sync_at = ?, last_error = NULL, last_error_code = NULL, last_balance_error = ?, updated_at = ? WHERE user_id = ?',
        [new Date().toISOString(), balanceResult.warning, new Date().toISOString(), userId]
      );
      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
    return { ...(await publicConnection(db, userId)), imported, updated };
  } catch (error) {
    const publicError = toBybitPublicError(error);
    await db.run(
      'UPDATE bybit_card_connections SET last_error = ?, last_error_code = ?, updated_at = ? WHERE user_id = ?',
      [publicError.error.slice(0, 300), publicError.code, new Date().toISOString(), userId]
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
