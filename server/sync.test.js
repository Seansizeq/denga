import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { matchesEtag, parseHistoryPage, readUserDataVersion, syncEtag } from './sync.js';

let db;

beforeEach(async () => {
  db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE user_data_version (
    user_id TEXT PRIMARY KEY, transactions_v INTEGER NOT NULL DEFAULT 0,
    accounts_v INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`);
});

afterEach(async () => {
  await db.close();
});

describe('readUserDataVersion', () => {
  it('читає лічильники', async () => {
    await db.run("INSERT INTO user_data_version VALUES ('u1', 7, 3, '')");
    expect(await readUserDataVersion(db, 'u1')).toEqual({ transactions: 7, accounts: 3 });
  });

  it('для людини без даних це нулі, а не помилка', async () => {
    expect(await readUserDataVersion(db, 'ніхто')).toEqual({ transactions: 0, accounts: 0 });
  });
});

describe('syncEtag', () => {
  it('змінюється, коли змінюється будь-який лічильник', () => {
    const base = syncEtag({ transactions: 1, accounts: 1 });
    expect(syncEtag({ transactions: 2, accounts: 1 })).not.toBe(base);
    expect(syncEtag({ transactions: 1, accounts: 2 })).not.toBe(base);
  });

  it('змінюється, коли змінюється форма відповіді', () => {
    // Інакше клієнт зі старою формою отримав би 304 і ніколи не побачив нових
    // полів: дані ті самі, лічильники ті самі, а сервер уже інший.
    const v = { transactions: 5, accounts: 5 };
    expect(syncEtag(v, 1)).not.toBe(syncEtag(v, 2));
  });

  it('слабкий — нас цікавить змістовна рівність, а не побайтова', () => {
    expect(syncEtag({ transactions: 1, accounts: 1 })).toMatch(/^W\//);
  });
});

describe('matchesEtag', () => {
  const etag = syncEtag({ transactions: 4, accounts: 2 });

  it('впізнає той самий ETag', () => {
    expect(matchesEtag(etag, etag)).toBe(true);
  });

  it('не впізнає інший', () => {
    expect(matchesEtag(syncEtag({ transactions: 5, accounts: 2 }), etag)).toBe(false);
  });

  it('терпить суфікс, який дописує nginx зі стисненням', () => {
    // Без цього кожна відповідь через gzip виглядала б як зміна, і сенс ETag
    // зникав би саме там, де ми його щойно ввімкнули.
    expect(matchesEtag(etag.replace(/"$/, '-gzip"'), etag)).toBe(true);
  });

  it('розуміє список через кому', () => {
    expect(matchesEtag(`W/"0-t0-a0", ${etag}`, etag)).toBe(true);
  });

  it('розуміє зірочку', () => {
    expect(matchesEtag('*', etag)).toBe(true);
  });

  it('порожній заголовок — це не збіг', () => {
    expect(matchesEtag('', etag)).toBe(false);
    expect(matchesEtag(undefined, etag)).toBe(false);
  });
});

describe('parseHistoryPage', () => {
  it('має розумні значення за замовчуванням', () => {
    expect(parseHistoryPage({})).toEqual({ limit: 200, offset: 0 });
  });

  it('приймає задані межі', () => {
    expect(parseHistoryPage({ limit: '50', offset: '100' })).toEqual({ limit: 50, offset: 100 });
  });

  it('не дає замовити скільки завгодно одним запитом', () => {
    expect(parseHistoryPage({ limit: '999999' }).limit).toBe(500);
  });

  it('ігнорує сміття замість чисел', () => {
    expect(parseHistoryPage({ limit: 'усе', offset: '-5' })).toEqual({ limit: 200, offset: 0 });
  });
});
