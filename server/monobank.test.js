import { describe, expect, it, vi } from 'vitest';
import {
  MonobankError,
  currencyFromNumericCode,
  describeMonobankAccounts,
  fetchMonobankClientInfo,
  normalizeStatementEvent,
  setMonobankWebhook,
  statementToEntry,
} from './monobank.js';

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

const statement = (overrides = {}) => ({
  id: 'u2_xxx',
  time: 1_700_000_000,
  description: 'Silpo',
  mcc: 5411,
  hold: false,
  amount: -34_000,
  operationAmount: -34_000,
  currencyCode: 980,
  balance: 100_000,
  ...overrides,
});

describe('normalizeStatementEvent', () => {
  it('приймає виписку в тому вигляді, у якому її шле банк', () => {
    const event = normalizeStatementEvent({
      type: 'StatementItem',
      data: { account: 'acc-1', statementItem: statement() },
    });
    expect(event).toMatchObject({ accountId: 'acc-1' });
    expect(event.item.id).toBe('u2_xxx');
  });

  it('відкидає перевірковий запит без тіла', () => {
    // Перш ніж увімкнути вебхук, monobank стукає на адресу порожнім запитом.
    // Якби він проходив далі, кожне підключення писало б порожню операцію.
    expect(normalizeStatementEvent(undefined)).toBeNull();
    expect(normalizeStatementEvent({})).toBeNull();
    expect(normalizeStatementEvent({ type: 'StatementItem' })).toBeNull();
  });

  it('відкидає рядок без id або суми — провести його нікуди', () => {
    expect(
      normalizeStatementEvent({ type: 'StatementItem', data: { account: 'a', statementItem: { amount: -1 } } }),
    ).toBeNull();
    expect(
      normalizeStatementEvent({ type: 'StatementItem', data: { account: 'a', statementItem: { id: 'x' } } }),
    ).toBeNull();
  });
});

describe('statementToEntry', () => {
  it('переводить копійки в гроші й читає напрямок зі знака', () => {
    const entry = statementToEntry({ item: statement(), accountCurrency: 'UAH' });
    expect(entry).toMatchObject({ type: 'expense', amount: 340, currency: 'UAH', mcc: 5411 });
  });

  it('додатна сума — це надходження', () => {
    const entry = statementToEntry({ item: statement({ amount: 1_250_000 }), accountCurrency: 'UAH' });
    expect(entry).toMatchObject({ type: 'income', amount: 12_500 });
  });

  it('валюта береться з рахунку, а не з виписки', () => {
    // `currencyCode` описує то валюту рахунку, то операції — залежно від того,
    // кого читати. Покупка в Варшаві з гривневої картки має лягти гривнею, бо
    // саме її списано з балансу.
    const entry = statementToEntry({
      item: statement({ amount: -34_000, operationAmount: -3_000, currencyCode: 985 }),
      accountCurrency: 'UAH',
    });
    expect(entry.currency).toBe('UAH');
    expect(entry.amount).toBe(340);
  });

  it('заблокована сума проводиться так само, як списана', () => {
    const entry = statementToEntry({ item: statement({ hold: true }), accountCurrency: 'UAH' });
    expect(entry).toMatchObject({ hold: true, amount: 340 });
  });

  it('коментар до переказу конкретніший за опис', () => {
    const entry = statementToEntry({
      item: statement({ description: 'Від: Іван І.', comment: 'за каву' }),
      accountCurrency: 'UAH',
    });
    expect(entry.merchant).toBe('за каву');
  });

  it('нульова сума не є операцією', () => {
    expect(statementToEntry({ item: statement({ amount: 0 }), accountCurrency: 'UAH' })).toBeNull();
  });

  it('час без значення не ламає запис', () => {
    const entry = statementToEntry({ item: statement({ time: 0 }), accountCurrency: 'UAH' });
    expect(Number.isFinite(entry.timeMs)).toBe(true);
  });
});

describe('describeMonobankAccounts', () => {
  it('показує картку за типом і останніми цифрами', () => {
    const [account] = describeMonobankAccounts({
      accounts: [{ id: 'a1', type: 'black', currencyCode: 980, balance: 123_456, maskedPan: ['537541******1234'] }],
    });
    expect(account).toMatchObject({ id: 'a1', label: 'Чорна ·· 1234', currency: 'UAH', balance: 1234.56 });
  });

  it('банки теж придатні для звʼязування', () => {
    const rows = describeMonobankAccounts({ jars: [{ id: 'j1', title: 'На відпустку', currencyCode: 980 }] });
    expect(rows[0]).toMatchObject({ id: 'j1', kind: 'jar' });
    expect(rows[0].label).toContain('На відпустку');
  });

  it('рядок без id пропускається — звʼязати його однаково нема з чим', () => {
    expect(describeMonobankAccounts({ accounts: [{ type: 'black' }] })).toEqual([]);
  });
});

describe('currencyFromNumericCode', () => {
  it('знає коди, якими користується гаманець', () => {
    expect(currencyFromNumericCode(980)).toBe('UAH');
    expect(currencyFromNumericCode(985)).toBe('PLN');
  });

  it('невідомий код не вгадується', () => {
    expect(currencyFromNumericCode(999)).toBeNull();
  });
});

describe('запити до банку', () => {
  it('відмову за токеном відрізняє від збою банку', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, text: async () => '' }));
    await expect(fetchMonobankClientInfo('t', { fetchImpl })).rejects.toMatchObject({ code: 'BAD_TOKEN' });
  });

  it('ліміт раз на хвилину — окремий випадок, а не помилка налаштування', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429, text: async () => '' }));
    await expect(fetchMonobankClientInfo('t', { fetchImpl })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('токен їде заголовком, а не в адресі', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ accounts: [] }));
    await fetchMonobankClientInfo('secret-token', { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).not.toContain('secret-token');
    expect(init.headers['X-Token']).toBe('secret-token');
  });

  it('відключення — це порожня адреса, іншого способу банк не дає', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    await setMonobankWebhook('t', '', { fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ webHookUrl: '' });
  });

  it('зіпсована відповідь не видається за успішну', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'not json' }));
    await expect(fetchMonobankClientInfo('t', { fetchImpl })).rejects.toBeInstanceOf(MonobankError);
  });
});
