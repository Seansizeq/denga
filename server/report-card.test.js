import { describe, expect, it } from 'vitest';
import { renderFinancialReportCardPng } from './report-card.js';

describe('financial report card', () => {
  it('renders a 1080x1350 PNG with long values and category names', async () => {
    const png = await renderFinancialReportCardPng({
      reportType: 'monthly',
      periodLabel: '01.07 — 31.07.2026',
      reportCurrency: 'PLN',
      summary: {
        income: 128456.78,
        expense: 87321.45,
        net: 41135.33,
        incomeCount: 12,
        expenseCount: 74,
      },
      comparison: { expenseDelta: -1450.2 },
      topExpenses: [
        { name: 'Житло та комунальні послуги', amount: 42000 },
        { name: 'Продукти', amount: 17350 },
        { name: 'Транспорт', amount: 9200 },
        { name: 'Розваги', amount: 6100 },
      ],
    });

    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.length).toBeGreaterThan(20_000);
  });
});
