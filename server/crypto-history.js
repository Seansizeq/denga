export const selectMonthStartAndLatestPrices = (prices, now = new Date()) => {
  const rows = (Array.isArray(prices) ? prices : [])
    .map((row) => [Number(row?.[0]), Number(row?.[1])])
    .filter(([timestamp, price]) => Number.isFinite(timestamp) && Number.isFinite(price) && price > 0)
    .sort((a, b) => a[0] - b[0]);
  if (rows.length === 0) return null;

  const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const firstAtOrAfterMonthStart = rows.find(([timestamp]) => timestamp >= monthStartMs) ?? rows[0];
  const latest = rows[rows.length - 1];
  return {
    monthStart: firstAtOrAfterMonthStart[1],
    now: latest[1],
  };
};
