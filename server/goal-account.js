/**
 * У кожної цілі є власний рахунок у гаманці.
 *
 * Доки цілі рахунку не мали, гроші, відкладені в ціль, просто зникали з
 * капіталу: списання з рахунку-джерела було, а приймати їх не було чому. Тепер
 * ціль — це справжній рядок у `account_portfolio`, тож:
 *
 * - дохід у ціль додає гроші і в ціль, і в загальний капітал;
 * - витрата з цілі знімає їх звідти й з капіталу;
 * - переказ із іншого рахунку капітал не змінює — гроші лише перекладаються.
 *
 * Прогрес цілі — це і є баланс її рахунку, а не окремий лічильник.
 */

/** Секція, під якою рахунки цілей живуть у портфелі. */
export const GOAL_SECTION = 'goal';

/** Секції, які користувач може створити сам. `goal` тут немає — його веде ціль. */
export const USER_CREATABLE_SECTIONS = ['bank', 'cash', 'crypto', 'stocks', 'debt'];

/**
 * Ключ рахунку для цілі. Прив'язаний до id цілі, а не до назви: назву можна
 * перейменувати, і ключ від цього не мусить змінюватись — на нього посилаються
 * транзакції.
 *
 * Довжина навмисно скромна. Для доходу й витрати рахунок їде в примітці маркером
 * `Account: <slug>`, а той розпізнається регуляркою з межею 48 символів — тож
 * задовгий ключ просто перестав би читатися, і транзакція втратила б рахунок.
 * 16 шістнадцяткових символів id тримають ключ у ~32 символах навіть для довгого
 * telegram-id, а в межах одного користувача цього для унікальності досить.
 */
export const GOAL_ACCOUNT_KEY_MAX = 48;

export const goalAccountKey = (userId, goalId) => {
  const slug = String(userId).replace(/[^a-z0-9]/gi, '');
  const id = String(goalId).replace(/[^a-z0-9]/gi, '').slice(0, 16);
  return `${slug}_goal_${id}`.toLowerCase().slice(0, GOAL_ACCOUNT_KEY_MAX);
};

/**
 * Назва рахунку цілі. Обрізана до тієї ж межі, що й решта назв рахунків.
 */
export const goalAccountName = (goalName) => String(goalName ?? '').trim().slice(0, 40) || 'Ціль';

/**
 * Створює рахунок цілі, якщо його ще немає.
 *
 * `openingBalance` — стартова сума цілі: гроші, які вже були відкладені до того,
 * як ціль з'явилася. Транзакції за нею немає, як і за початковим залишком
 * будь-якого рахунку, доданого вручну.
 */
export const ensureGoalAccount = async (db, userId, goal) => {
  const accountKey = goalAccountKey(userId, goal.id);
  const existing = await db.get(
    'SELECT account_key AS accountKey FROM account_portfolio WHERE account_key = ? AND user_id = ? LIMIT 1',
    [accountKey, userId]
  );
  if (existing?.accountKey) return accountKey;

  const now = new Date().toISOString();
  const nextIndex = await db.get(
    'SELECT COALESCE(MAX(sort_index), -1) + 1 AS idx FROM account_portfolio WHERE user_id = ?',
    [userId]
  );
  await db.run(
    `INSERT INTO account_portfolio
     (account_key, user_id, section, sort_index, name, primary_amount, primary_currency, sub_text, icon_tone, badge, debt_phrase, icon_key, debt_direction, debt_initial_amount, debt_created_at, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'neutral', NULL, NULL, NULL, NULL, NULL, NULL, ?)`,
    [
      accountKey,
      userId,
      GOAL_SECTION,
      Number(nextIndex?.idx) || 0,
      goalAccountName(goal.name),
      Number(goal.openingBalance) || 0,
      goal.currency,
      now,
    ]
  );
  return accountKey;
};

/** Тримає назву й валюту рахунку в синхроні з ціллю. */
export const syncGoalAccount = async (db, userId, accountKey, { name, currency }) => {
  if (!accountKey) return;
  await db.run(
    `UPDATE account_portfolio SET name = ?, primary_currency = ?, updatedAt = ?
     WHERE account_key = ? AND user_id = ?`,
    [goalAccountName(name), currency, new Date().toISOString(), accountKey, userId]
  );
};

export const deleteGoalAccount = async (db, userId, accountKey) => {
  if (!accountKey) return;
  await db.run('DELETE FROM account_portfolio WHERE account_key = ? AND user_id = ? AND section = ?', [
    accountKey,
    userId,
    GOAL_SECTION,
  ]);
};

/**
 * Дає цілі рахунок, якщо вона його ще не має, і переносить на нього прогрес.
 *
 * Стартовий баланс — це той самий `saved`, який ціль показувала досі, тож після
 * оновлення число на екрані не стрибає. Заодно давнім переказам-внескам
 * дописується рахунок-приймач: досі вони були односторонніми, і відкладені
 * гроші просто зникали з капіталу.
 *
 * Ідемпотентна: ціль із уже заповненим `account_key` пропускається. FX сюди
 * приходить готовим лічильником, бо в міграціях `db.js` курсів немає.
 */
export const backfillGoalAccount = async (db, userId, goalRow, savedInGoalCurrency) => {
  const existingKey = String(goalRow.account_key ?? '').trim();
  if (existingKey) return existingKey;

  const accountKey = await ensureGoalAccount(db, userId, {
    id: goalRow.id,
    name: goalRow.name,
    currency: goalRow.currency,
    openingBalance: savedInGoalCurrency,
  });
  await db.run('UPDATE goals SET account_key = ? WHERE id = ? AND user_id = ?', [accountKey, goalRow.id, userId]);

  // Транзакції давніх внесків із рахунку — переказ без приймача. Тепер приймач є.
  await db.run(
    `UPDATE transactions SET toAccountKey = ?
     WHERE user_id = ? AND type = 'transfer' AND (toAccountKey IS NULL OR toAccountKey = '')
       AND id IN (SELECT transaction_id FROM goal_contributions WHERE goal_id = ? AND transaction_id IS NOT NULL)`,
    [accountKey, userId, goalRow.id]
  );
  return accountKey;
};

const roundMoney = (value) => Math.round(value * 100) / 100;

/**
 * Баланс рахунку цілі й її стартова сума після правки цілі.
 *
 * Раніше зміна валюти цілі міняла лише підпис рахунку: 40 000 ₴ ставали
 * 40 000 $, і на ту саму різницю виростав загальний капітал. Тепер баланс
 * переводиться за курсом.
 *
 * Стартова сума — частина балансу, тож іде за ним. Форма надсилає її завжди,
 * тому розрізнити «не чіпали» і «ввели нову» можна лише за числом: те саме
 * число, що й було, означає старе значення в старій валюті — воно
 * переводиться. Інше число — нове значення, вже в новій валюті, і різниця з
 * переведеною старою лягає на баланс так само, як і без зміни валюти.
 *
 * @param {(amount: number, from: string, to: string) => number} convert
 * @returns {{ balance: number, baseline: number }}
 */
export const rebaseGoalAccount = ({
  balance,
  previousCurrency,
  nextCurrency,
  previousBaseline,
  requestedBaseline,
  convert,
}) => {
  const current = Number(balance) || 0;
  const before = Number(previousBaseline) || 0;
  const requested = Number(requestedBaseline) || 0;
  if (previousCurrency === nextCurrency) {
    return { balance: current + (requested - before), baseline: requested };
  }
  const rebasedBalance = roundMoney(convert(current, previousCurrency, nextCurrency));
  const rebasedBaseline = roundMoney(convert(before, previousCurrency, nextCurrency));
  const baseline = requested === before ? rebasedBaseline : requested;
  return { balance: roundMoney(rebasedBalance + (baseline - rebasedBaseline)), baseline };
};

/**
 * Які внески повернути на рахунки, коли ціль видаляють.
 *
 * Раніше відкочувались усі внески — незалежно від того, що сталося з грошима
 * далі. Якщо з рахунку цілі вже оплатили покупку, видалення цілі повертало ці
 * гроші на картку вдруге: зʼявлялися гроші, яких не існує.
 *
 * Тепер повертається рівно те, що ще лежить у цілі. Внески перебираються від
 * найновішого: вони й повертаються першими, бо давніші частіше вже
 * витрачені. Той, що вміщується лише частково, повертається частково. Решта
 * лишається в історії як була — ці гроші пішли з цілі раніше.
 *
 * Стартова сума при цьому вважається витраченою першою: на рахунки в
 * застосунку вона не повертається, бо звідти й не приходила.
 *
 * @param {{ id: string, goalDelta: number }[]} contributions від найновішого;
 *   `goalDelta` — скільки внесок додав рахунку цілі в його одиниці
 * @param {number} balance скільки на рахунку цілі зараз; `Infinity`, якщо
 *   рахунку немає (давня ціль) — тоді повертається все, як і раніше
 * @returns {{ refundIds: string[], partial: { id: string, share: number } | null }}
 */
export const planGoalRefund = (contributions, balance, { epsilon = 0.01 } = {}) => {
  let remaining = Number.isNaN(Number(balance)) ? 0 : Number(balance);
  const refundIds = [];
  for (const { id, goalDelta } of contributions ?? []) {
    const delta = Math.max(0, Number(goalDelta) || 0);
    if (delta <= remaining + epsilon) {
      refundIds.push(id);
      remaining -= delta;
      continue;
    }
    if (remaining > epsilon) return { refundIds, partial: { id, share: remaining / delta } };
    break;
  }
  return { refundIds, partial: null };
};

/**
 * Внесок, з якого повертається лише частка: у транзакції лишається те, що
 * справді пішло з цілі раніше. Обидві сторони переказу зменшуються в тій самій
 * пропорції.
 */
export const shrinkContribution = (txRow, keepShare) => {
  const keep = Math.min(1, Math.max(0, Number(keepShare) || 0));
  const amount = roundMoney((Number(txRow.amount) || 0) * keep);
  const toAmount = Number(txRow.transferToAmount);
  // Записана сума в одиниці рахунку зменшується в тій самій частці: інакше
  // залишок внеску відкотився б колись на повну, ще не зменшену суму.
  const booked = Number(txRow.accountAmount);
  return {
    ...txRow,
    amount,
    transferToAmount: Number.isFinite(toAmount) && toAmount > 0 ? roundMoney(toAmount * keep) : txRow.transferToAmount,
    accountAmount: Number.isFinite(booked) && booked > 0 ? booked * keep : txRow.accountAmount,
  };
};

export const getGoalAccountBalance = async (db, userId, accountKey) => {
  if (!accountKey) return 0;
  const row = await db.get(
    'SELECT primary_amount AS amount FROM account_portfolio WHERE account_key = ? AND user_id = ? LIMIT 1',
    [accountKey, userId]
  );
  return Number(row?.amount) || 0;
};
