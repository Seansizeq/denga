export type CryptoSymbol = 'BTC' | 'ETH' | 'SOL' | 'TON' | 'USDT';

export function parseCryptoPosition(subText?: string | null): { symbol: CryptoSymbol; amount: number } | null {
  if (!subText) return null;
  const m = subText.match(/([0-9][0-9\s\u00A0\u202F]*(?:[.,][0-9]+)?)\s*([A-Za-z]{3,5})/);
  if (!m?.[1] || !m?.[2]) return null;
  const amount = Number(m[1].replace(/[\s\u00A0\u202F]+/g, '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const symbol = m[2].toUpperCase();
  if (symbol === 'BTC' || symbol === 'ETH' || symbol === 'SOL' || symbol === 'TON' || symbol === 'USDT') {
    return { symbol, amount };
  }
  return null;
}
