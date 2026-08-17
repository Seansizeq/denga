/**
 * Скільки в цілі вже зібрано. Внесок можна зробити в іншій валюті, ніж сама
 * ціль (наприклад, заробіток у гривні в ціль на долари), тож це сума з
 * конверсією, а не звичайний SQL SUM — той складав би різні валюти в одне число.
 *
 * Курс фіксується на момент внеску в `converted_amount`. Доки конверсія
 * рахувалася наживо при кожному читанні, вже зроблений внесок «дихав» разом із
 * курсом, і прогрес цілі переписував свою ж історію. Рядки, записані до появи
 * колонки, тримають NULL і конвертуються наживо — історичних курсів для них
 * немає.
 */

/**
 * Сума одного внеску у валюті цілі.
 *
 * `convert` — `(amount, from, to) => number`.
 */
export const contributionInGoalCurrency = (row, goalCurrency, convert) => {
  const stored = row?.convertedAmount;
  // Перевірка на null/undefined мусить іти до Number(): `Number(null)` дає 0, а
  // `Number.isFinite(0)` — true, тож legacy-рядок проходив би за «збережений
  // нуль». Кожен давній внесок обнулявся б, і від цілі лишалася б лише
  // стартова сума.
  if (stored !== null && stored !== undefined) {
    const asNumber = Number(stored);
    if (Number.isFinite(asNumber)) return asNumber;
  }
  const cur = row?.currency ? row.currency : goalCurrency;
  return convert(Number(row?.amount) || 0, cur, goalCurrency);
};

export const sumGoalContributions = (contribRows, goalCurrency, convert, baseline = 0) => {
  let saved = Number(baseline) || 0;
  for (const row of contribRows || []) {
    saved += contributionInGoalCurrency(row, goalCurrency, convert);
  }
  return saved;
};

/**
 * Конверсія, зафіксована на момент запису: і сума, і курс, за яким її отримали.
 */
export const freezeContributionConversion = (amount, from, goalCurrency, convert) => {
  const converted = convert(amount, from, goalCurrency);
  return { converted, rate: amount > 0 ? converted / amount : 1 };
};
