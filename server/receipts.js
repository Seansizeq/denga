// Pure parser for receipt OCR text. No I/O, no external deps.
// Used by POST /api/receipts/scan after Google Vision returns plain text.

const TOTAL_KEYWORDS = [
  'СУМА',
  'СУМА ДО СПЛАТИ',
  'УСЬОГО',
  'ВСЬОГО',
  'ВСЕГО',
  'ИТОГО',
  'ИТОГ',
  'ПIДСУМОК',
  'ПІДСУМОК',
  'РАЗОМ',
  'RAZEM',
  'SUMA',
  'TOTAL',
  'GRAND TOTAL',
  'TO PAY',
  'ДО СПЛАТИ',
  'К ОПЛАТЕ',
  'DO ZAPLATY',
  'DO ZAPŁATY',
];

// Map of well-known shop names → categoryId. Keys lowercased and accent-folded.
const SHOP_CATEGORY = {
  // Grocery
  'атб': 'food',
  'atb': 'food',
  'сільпо': 'food',
  'сильпо': 'food',
  'silpo': 'food',
  'велика кишеня': 'food',
  'novus': 'food',
  'новус': 'food',
  'metro': 'food',
  'auchan': 'food',
  'ашан': 'food',
  'fora': 'food',
  'фора': 'food',
  'varus': 'food',
  'варус': 'food',
  'megamarket': 'food',
  'мегамаркет': 'food',
  'biedronka': 'food',
  'lidl': 'food',
  'kaufland': 'food',
  'carrefour': 'food',
  'tesco': 'food',
  'żabka': 'food',
  'zabka': 'food',
  // Fuel
  'okko': 'transport',
  'окко': 'transport',
  'wog': 'transport',
  'вог': 'transport',
  'shell': 'transport',
  'orlen': 'transport',
  'lotos': 'transport',
  'bp': 'transport',
  'socar': 'transport',
  'упг': 'transport',
  // Home / DIY
  'епіцентр': 'home',
  'эпицентр': 'home',
  'epicentr': 'home',
  'castorama': 'home',
  'leroy merlin': 'home',
  'леруа': 'home',
  'obi': 'home',
  'ikea': 'home',
  'jysk': 'home',
  'нова лінія': 'home',
  // Pharmacy
  'аптека': 'health',
  'apteka': 'health',
  'pharmacy': 'health',
  'rossmann': 'health',
  'россманн': 'health',
  'подорожник': 'health',
  'ананас': 'health',
  'doc.ua': 'health',
  // Cafes / restaurants / fast food
  'mcdonald': 'entertainment',
  'макдональдс': 'entertainment',
  'kfc': 'entertainment',
  'burger king': 'entertainment',
  'starbucks': 'entertainment',
  'subway': 'entertainment',
  'puzata hata': 'entertainment',
  'пузата хата': 'entertainment',
  'aroma kava': 'entertainment',
  'арома кава': 'entertainment',
  'львівські круасани': 'entertainment',
  'кафе': 'entertainment',
  'cafe': 'entertainment',
  'café': 'entertainment',
  'restaurant': 'entertainment',
  'ресторан': 'entertainment',
  'pizza': 'entertainment',
  'піца': 'entertainment',
  'пицца': 'entertainment',
  'sushi': 'entertainment',
  'суші': 'entertainment',
  'суши': 'entertainment',
};

// Keyword → category fallback when shop is unknown.
const ITEM_KEYWORD_CATEGORY = {
  // food
  food: [
    'хліб',
    'хлеб',
    'молоко',
    'сир',
    'сыр',
    'яйц',
    'м\'ясо',
    'мясо',
    'риба',
    'рыба',
    'овоч',
    'овощ',
    'фрукт',
    'ковбас',
    'колбас',
    'йогурт',
    'кефір',
    'кефир',
    'масло',
    'цукор',
    'сахар',
    'borshch',
    'piwo',
    'пиво',
    'cukier',
    'mleko',
    'chleb',
    'jajka',
  ],
  transport: [
    'бензин',
    'дизель',
    'дт',
    'a92',
    'a95',
    'a98',
    '95',
    '98',
    'олива',
    'мастило',
    'олі',
    'oil',
    'paliwo',
    'lpg',
    'gas',
    'газ',
  ],
  health: [
    'таблет',
    'парацетам',
    'ібупроф',
    'ибупроф',
    'аспірин',
    'аспирин',
    'мазь',
    'спрей',
    'вітамі',
    'витами',
    'пластир',
    'пластыр',
    'antibiotyk',
    'maść',
    'lek',
  ],
  home: [
    'фарба',
    'краска',
    'цвях',
    'гвоздь',
    'шуруп',
    'дрель',
    'молоток',
    'плитка',
    'стіл',
    'стол',
    'крісло',
    'кресло',
    'диван',
    'meble',
    'farba',
  ],
  entertainment: [
    'кава',
    'кофе',
    'coffee',
    'latte',
    'капучино',
    'еспресо',
    'espresso',
    'piwo',
    'beer',
    'pizza',
    'burger',
    'булочка',
    'тістечко',
    'десерт',
  ],
};

const KNOWN_CATEGORY_IDS = new Set([
  'food',
  'transport',
  'home',
  'entertainment',
  'health',
  'other_expense',
]);

const foldText = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[`'"´’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const splitLines = (text) =>
  String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

// Parse "1 234,56" / "1234.56" / "1.234,56" → 1234.56
const parseNumber = (raw) => {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  s = s.replace(/[\u00A0\s]/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // assume the rightmost separator is the decimal one
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Single comma → decimal
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const NUMBER_RE = /-?\d{1,3}(?:[\s\u00A0]?\d{3})*(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/g;
const TOTAL_EXCLUDE_RE = /\b(ptu|vat|tax|подат|ндс|пдв)\b/i;
const CURRENCY_HINT_RE = /\b(pln|uah|usd)\b|zł|₴|\$/i;
const MONEY_LIKE_RE = /(?:\d[\s\u00A0]\d{3}(?:[.,]\d{1,2})?|\d+[.,]\d{2})$/;

const findNumbersInLine = (line) => {
  const matches = String(line ?? '').match(NUMBER_RE);
  if (!matches) return [];
  return matches
    .map((m) => parseNumber(m))
    .filter((n) => Number.isFinite(n));
};

const findMoneyNumbersInLine = (line) => {
  const matches = String(line ?? '').match(NUMBER_RE);
  if (!matches) return [];
  return matches
    .filter((raw) => {
      const v = String(raw).trim();
      // Keep values that look like money: decimals ("44,99") or grouped thousands ("1 159").
      if (MONEY_LIKE_RE.test(v)) return true;
      // Avoid catching time parts from "14:49" as "49".
      return false;
    })
    .map((m) => parseNumber(m))
    .filter((n) => Number.isFinite(n) && n > 0);
};

export const extractTotal = (text) => {
  const lines = splitLines(text);
  if (lines.length === 0) return null;

  const folded = lines.map((l) => foldText(l));
  const keywords = TOTAL_KEYWORDS.map((k) => foldText(k)).sort((a, b) => b.length - a.length);
  const candidates = [];

  // First pass: collect scored candidates around total-like keywords.
  for (let i = 0; i < lines.length; i++) {
    const line = folded[i];
    if (!line) continue;
    const matched = keywords.find((k) => line.includes(k));
    if (!matched) continue;

    const hasTaxWord = TOTAL_EXCLUDE_RE.test(lines[i]);
    const hasCurrencyHint = CURRENCY_HINT_RE.test(lines[i]);
    const inBottomHalf = i >= Math.floor(lines.length / 2);

    const numbers = findMoneyNumbersInLine(lines[i]);
    if (numbers.length > 0) {
      const n = numbers[numbers.length - 1];
      if (n > 0) {
        let score = 0;
        if (matched.includes('suma') || matched.includes('разом') || matched.includes('total')) score += 4;
        if (hasCurrencyHint) score += 3;
        if (inBottomHalf) score += 2;
        if (hasTaxWord) score -= 5;
        candidates.push({ value: n, score, line: i });
      }
    }
    // Sometimes keyword and number are on adjacent lines.
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const next = findMoneyNumbersInLine(lines[j]);
      if (next.length > 0) {
        const n = next[next.length - 1];
        if (n > 0) {
          let score = 0;
          if (matched.includes('suma') || matched.includes('разом') || matched.includes('total')) score += 3;
          if (hasCurrencyHint || CURRENCY_HINT_RE.test(lines[j])) score += 2;
          if (j >= Math.floor(lines.length / 2)) score += 2;
          if (hasTaxWord || TOTAL_EXCLUDE_RE.test(lines[j])) score -= 5;
          candidates.push({ value: n, score, line: j });
        }
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.value !== a.value) return b.value - a.value;
      return b.line - a.line;
    });
    const top = candidates[0];
    if (top && top.value > 0) return top.value;
  }

  // Fallback 1: sum-like lines in lower half, ignore tax/VAT lines, pick max.
  const lowerHalf = lines.slice(Math.floor(lines.length / 2));
  let bestSumLike = null;
  for (const line of lowerHalf) {
    const f = foldText(line);
    if (!/(suma|razem|total|до сплати|к оплате|усього|всього|итого|разом)/i.test(f)) continue;
    if (TOTAL_EXCLUDE_RE.test(line)) continue;
    const nums = findMoneyNumbersInLine(line).filter((n) => n > 0);
    if (nums.length === 0) continue;
    const n = nums[nums.length - 1];
    if (bestSumLike == null || n > bestSumLike) bestSumLike = n;
  }
  if (bestSumLike != null) return bestSumLike;

  // Fallback 2: largest decimal number in the bottom 40% of the receipt.
  const tail = lines.slice(Math.floor(lines.length * 0.6));
  let best = null;
  for (const line of tail) {
    for (const m of String(line).match(NUMBER_RE) ?? []) {
      if (!/[.,]\d{1,2}$/.test(m)) continue;
      const n = parseNumber(m);
      if (!Number.isFinite(n) || n <= 0) continue;
      if (best == null || n > best) best = n;
    }
  }
  return best;
};

export const extractCurrency = (text) => {
  const t = String(text ?? '');
  if (/zł|pln|pln\b|złoty|zlotych/i.test(t)) return 'PLN';
  if (/\$|usd|dollar/i.test(t)) return 'USD';
  if (/€|eur/i.test(t)) return 'UAH'; // we don't support EUR; default safe
  if (/грн|uah|₴|гривен|гривень/i.test(t)) return 'UAH';
  return 'UAH';
};

export const extractDate = (text) => {
  const t = String(text ?? '');
  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const m1 = t.match(/\b(\d{2})[.\-/](\d{2})[.\-/](\d{4})\b/);
  if (m1) {
    const [, d, mo, y] = m1;
    return `${y}-${mo}-${d}`;
  }
  // YYYY-MM-DD
  const m2 = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
};

export const extractShop = (text) => {
  const lines = splitLines(text);
  if (lines.length === 0) return null;

  // Look for known shop in the first 8 lines first (logo/header area).
  const head = lines.slice(0, 8);
  for (const line of head) {
    const folded = foldText(line);
    if (!folded) continue;
    for (const key of Object.keys(SHOP_CATEGORY)) {
      if (folded.includes(key)) {
        return prettifyShopName(line);
      }
    }
  }

  // Otherwise — first non-empty line that looks like a name (has letters, not too long).
  for (const line of head) {
    const stripped = line.replace(/[^\p{L}\d \-&'"./№#]/gu, '').trim();
    if (stripped.length >= 3 && stripped.length <= 40 && /\p{L}/u.test(stripped)) {
      return prettifyShopName(stripped);
    }
  }
  return null;
};

const prettifyShopName = (raw) => {
  const cleaned = String(raw ?? '')
    .replace(/[«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  // Title-case acronyms preserved (keep as-is for short upper words).
  return cleaned.length > 40 ? cleaned.slice(0, 40) : cleaned;
};

const TRAILING_AMOUNT_RE = /^(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:[А-Яа-яA-Za-zₐ-ₜ.]*?)?\s*$/u;
const ITEM_EXCLUDE_RE = /\b(nip|regon|bdo|paragon|fiskaln|fiskalny|ul\.|ulica|warszawa|sprzed|kwota ptu|ptu|vat|reszta|platnosc|płatno|gotowka|gotówka|rozliczenie|wydr|nr)\b/i;

export const extractItems = (text) => {
  const lines = splitLines(text);
  const out = [];
  for (const line of lines) {
    const folded = foldText(line);
    if (!folded) continue;
    // Skip lines containing total keywords — those are not items.
    if (TOTAL_KEYWORDS.some((k) => folded.includes(foldText(k)))) continue;
    if (ITEM_EXCLUDE_RE.test(line)) continue;
    if (/\b\d{2}-\d{3}\b/.test(line)) continue; // postal code / address block
    // Item-line heuristic: must end with a number, must contain at least 3 letters.
    const m = line.match(TRAILING_AMOUNT_RE);
    if (!m) continue;
    const namePart = m[1].trim();
    const amount = parseNumber(m[2]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const letters = (namePart.match(/\p{L}/gu) ?? []).length;
    if (letters < 3) continue;
    if (namePart.length > 60) continue;
    out.push({ name: namePart.replace(/\s{2,}/g, ' ').slice(0, 60), amount });
    if (out.length >= 30) break;
  }
  return out;
};

export const pickCategoryId = (shop, items) => {
  const shopFolded = foldText(shop ?? '');
  if (shopFolded) {
    for (const key of Object.keys(SHOP_CATEGORY)) {
      if (shopFolded.includes(key)) return SHOP_CATEGORY[key];
    }
  }
  // Score by item keywords.
  const scores = { food: 0, transport: 0, home: 0, health: 0, entertainment: 0 };
  const itemsText = (items ?? [])
    .map((i) => foldText(i?.name ?? ''))
    .join(' ');
  if (itemsText) {
    for (const [cat, words] of Object.entries(ITEM_KEYWORD_CATEGORY)) {
      for (const w of words) {
        if (!w) continue;
        if (itemsText.includes(w)) scores[cat] += 1;
      }
    }
    let best = null;
    let bestScore = 0;
    for (const [cat, score] of Object.entries(scores)) {
      if (score > bestScore) {
        best = cat;
        bestScore = score;
      }
    }
    if (best && KNOWN_CATEGORY_IDS.has(best)) return best;
  }
  return 'other_expense';
};

export const parseReceipt = (text) => {
  const safeText = typeof text === 'string' ? text : '';
  const shop = extractShop(safeText);
  const total = extractTotal(safeText);
  const currency = extractCurrency(safeText);
  const date = extractDate(safeText);
  const rawItems = extractItems(safeText);
  const maxItemAmount = Number.isFinite(total) && total > 0 ? total * 1.05 : Infinity;
  const items = rawItems.filter((i) => i.amount > 0 && i.amount <= maxItemAmount);
  const categoryId = pickCategoryId(shop, items);
  return {
    shop,
    total: Number.isFinite(total) ? Number(total) : null,
    currency,
    date,
    categoryId,
    items,
  };
};
