// Pure parser for receipt OCR text. No I/O, no external deps.

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
  'NALEZNOSC',
  'NALEŻNOŚĆ',
  'LACZNIE',
  'ŁĄCZNIE',
];

const BRANDED_SHOP_CATEGORY = {
  атб: 'food',
  atb: 'food',
  сільпо: 'food',
  сильпо: 'food',
  silpo: 'food',
  'велика кишеня': 'food',
  novus: 'food',
  новус: 'food',
  metro: 'food',
  auchan: 'food',
  ашан: 'food',
  fora: 'food',
  фора: 'food',
  varus: 'food',
  варус: 'food',
  megamarket: 'food',
  мегамаркет: 'food',
  biedronka: 'food',
  lidl: 'food',
  kaufland: 'food',
  carrefour: 'food',
  tesco: 'food',
  żabka: 'food',
  zabka: 'food',
  dino: 'food',
  netto: 'food',
  stokrotka: 'food',
  aldi: 'food',
  lewiatan: 'food',
  intermarche: 'food',
  spar: 'food',
  'delikatesy centrum': 'food',
  okko: 'transport',
  окко: 'transport',
  wog: 'transport',
  вог: 'transport',
  shell: 'transport',
  orlen: 'transport',
  lotos: 'transport',
  bp: 'transport',
  socar: 'transport',
  упг: 'transport',
  епіцентр: 'home',
  эпицентр: 'home',
  epicentr: 'home',
  castorama: 'home',
  'leroy merlin': 'home',
  леруа: 'home',
  obi: 'home',
  ikea: 'home',
  jysk: 'home',
  'нова лінія': 'home',
  rossmann: 'health',
  россманн: 'health',
  подорожник: 'health',
  ананас: 'health',
  'doc.ua': 'health',
  hebe: 'health',
  'super-pharm': 'health',
  'super pharm': 'health',
  doz: 'health',
  gemini: 'health',
  mcdonald: 'entertainment',
  макдональдс: 'entertainment',
  kfc: 'entertainment',
  'burger king': 'entertainment',
  starbucks: 'entertainment',
  subway: 'entertainment',
  'puzata hata': 'entertainment',
  'пузата хата': 'entertainment',
  'aroma kava': 'entertainment',
  'арома кава': 'entertainment',
  'львівські круасани': 'entertainment',
};

const GENERIC_SHOP_HINT_CATEGORY = {
  apteka: 'health',
  аптека: 'health',
  pharmacy: 'health',
  cafe: 'entertainment',
  café: 'entertainment',
  кафе: 'entertainment',
  restaurant: 'entertainment',
  ресторан: 'entertainment',
  pizza: 'entertainment',
  піца: 'entertainment',
  пицца: 'entertainment',
  sushi: 'entertainment',
  суші: 'entertainment',
  суши: 'entertainment',
};

const ITEM_KEYWORD_CATEGORY = {
  food: [
    'хліб',
    'хлеб',
    'молоко',
    'сир',
    'сыр',
    'яйц',
    'мясо',
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
    'cukier',
    'mleko',
    'chleb',
    'jajka',
    'ser',
    'maslo',
    'masło',
    'bulka',
    'bułka',
    'wedlin',
    'wędlin',
    'kielbas',
    'kiełbas',
    'woda',
    'sok',
    'jogurt',
    'makaron',
    'ryz',
    'ryż',
    'kurcz',
    'szynk',
    'jabl',
    'jabł',
    'banan',
    'chips',
    'chipsy',
    'czekolad',
    'kawa',
  ],
  transport: [
    'бензин',
    'дизель',
    'дт',
    'a92',
    'a95',
    'a98',
    'paliwo',
    'lpg',
    'benzyna',
    'diesel',
    'pb95',
    'pb98',
    'olej nap',
    'myjnia',
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
    'leki',
    'tabletki',
    'witamina',
    'syrop',
    'szampon',
    'krem',
    'zel',
    'żel',
    'pasta',
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
    'recznik',
    'ręcznik',
    'scier',
    'ścier',
    'mop',
    'lamp',
    'swiec',
    'świec',
    'kubek',
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

const TOTAL_KEYWORDS_FOLDED = TOTAL_KEYWORDS.map((k) => foldText(k)).sort((a, b) => b.length - a.length);
const MONEY_TOKEN_RE = /\d{1,3}(?:[\s\u00A0]\d{3})+(?:[.,]\d{1,2})?|\d+[.,]\d{1,2}|\d+/g;
const TOTAL_EXCLUDE_RE = /\b(ptu|vat|tax|подат|ндс|пдв)\b/i;
const ADDRESS_RE = /\b(ul\.|ulica|street|st\.|ave|avenue|вул\.|вулиця|просп|проспект|warszawa|warsaw|київ|kyiv|krakow|kraków|lodz|łódź)\b/i;
const PAYMENT_KEYWORD_RE = /\b(gotowka|gotówka|platnosc|płatność|zapłacono|card|karta|payment|blik|cash)\b/i;
const SAFE_PAYMENT_KEYWORD_RE = /\b(platnosc|płatność|zapłacono|card|karta|payment|blik)\b/i;
const CASH_PAYMENT_KEYWORD_RE = /\b(gotowka|gotówka|cash)\b/i;
const CHANGE_KEYWORD_RE = /\b(reszta|change|сдача)\b/i;
const ITEM_EXCLUDE_RE = /\b(nip|regon|bdo|paragon|fiskaln|fiskalny|sprzed|kwota ptu|suma ptu|ptu|vat|rozliczenie|wydr|nr|sp\.?\s*op)\b/i;
const POLISH_SIGNAL_RE = /[ąćęłńóśźż]|(?:\b(?:razem|platnosc|płatność|gotowka|gotówka|paragon|naleznosc|należność|lacznie|łącznie)\b)/i;
const CYRILLIC_SIGNAL_RE = /[А-Яа-яІіЇїЄєҐґЁё]/;
const DATE_RE = /\b(?:\d{2}[.\-/]\d{2}[.\-/]\d{4}|\d{4}-\d{2}-\d{2})\b/;

function foldText(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[`'"´’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const splitLines = (text) =>
  String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const parseNumber = (raw) => {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  s = s.replace(/[\u00A0\s]/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const isTimeToken = (line, index, raw) => {
  const prev = line[index - 1] ?? '';
  const next = line[index + raw.length] ?? '';
  return (prev === ':' || next === ':') && /^\d{1,2}$/.test(raw);
};

const extractMoneyTokens = (line) => {
  const out = [];
  const source = String(line ?? '');
  for (const match of source.matchAll(MONEY_TOKEN_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (isTimeToken(source, index, raw)) continue;
    const prev = source[index - 1] ?? '';
    const next = source[index + raw.length] ?? '';
    if (/\p{L}/u.test(prev) || /\p{L}/u.test(next)) continue;
    const value = parseNumber(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    out.push({
      raw,
      index,
      end: index + raw.length,
      value,
      hasDecimal: /[.,]\d{1,2}$/.test(raw),
      hasGrouping: /[\s\u00A0]\d{3}/.test(raw),
    });
  }
  return out;
};

const normalizeLines = (text) =>
  splitLines(text).map((line, index) => ({
    index,
    text: line,
    folded: foldText(line),
    moneyTokens: extractMoneyTokens(line),
  }));

const getBrandedShopCategoryId = (shop) => {
  const folded = foldText(shop);
  if (!folded) return null;
  for (const [key, categoryId] of Object.entries(BRANDED_SHOP_CATEGORY)) {
    if (folded.includes(foldText(key))) return categoryId;
  }
  return null;
};

const getSoftShopHintCategoryId = (shop) => {
  const folded = foldText(shop);
  if (!folded) return null;
  for (const [key, categoryId] of Object.entries(GENERIC_SHOP_HINT_CATEGORY)) {
    if (folded === foldText(key) || folded.startsWith(`${foldText(key)} `)) return categoryId;
  }
  return null;
};

const detectCurrency = (text) => {
  const t = String(text ?? '');
  if (/zł|\bpln\b|\bzl\b|złoty|zlotych/i.test(t)) return { currency: 'PLN', status: 'detected' };
  if (/\$|usd|dollar/i.test(t)) return { currency: 'USD', status: 'detected' };
  if (/грн|uah|₴|гривен|гривень/i.test(t)) return { currency: 'UAH', status: 'detected' };
  if (/€|eur/i.test(t)) return { currency: 'UAH', status: 'unsupported' };
  if (POLISH_SIGNAL_RE.test(t) && !CYRILLIC_SIGNAL_RE.test(t)) return { currency: 'PLN', status: 'inferred' };
  if (CYRILLIC_SIGNAL_RE.test(t)) return { currency: 'UAH', status: 'inferred' };
  return { currency: 'UAH', status: 'unknown' };
};

const prettifyShopName = (raw) => {
  const cleaned = String(raw ?? '')
    .replace(/[«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > 40 ? cleaned.slice(0, 40) : cleaned;
};

const isAddressLike = (line) => /\b\d{2}-\d{3}\b/.test(line) || ADDRESS_RE.test(line);
const looksLikeDateLine = (line) => DATE_RE.test(String(line ?? ''));

const looksLikeGenericShopWord = (line) => {
  const folded = foldText(line);
  if (!folded) return false;
  return Boolean(getSoftShopHintCategoryId(folded)) && !getBrandedShopCategoryId(folded);
};

const looksLikeShopFallback = (line) => {
  const text = String(line?.text ?? line ?? '').trim();
  if (!text || text.length < 3 || text.length > 40) return false;
  if (!/\p{L}/u.test(text)) return false;
  if (isAddressLike(text)) return false;
  if (Array.isArray(line?.moneyTokens) && line.moneyTokens.length > 0) return false;
  if (PAYMENT_KEYWORD_RE.test(text) || TOTAL_EXCLUDE_RE.test(text) || ITEM_EXCLUDE_RE.test(text)) return false;
  if (TOTAL_KEYWORDS_FOLDED.some((k) => foldText(text).includes(k))) return false;
  if (looksLikeGenericShopWord(text)) return false;
  const digitCount = (text.match(/\d/g) ?? []).length;
  return digitCount <= 6;
};

const hasTotalKeyword = (folded) => TOTAL_KEYWORDS_FOLDED.some((k) => folded.includes(k));

const scoreTotalKeyword = (keyword) => {
  if (!keyword) return 0;
  if (keyword.includes('suma') || keyword.includes('razem') || keyword.includes('razом') || keyword.includes('total')) return 4;
  if (keyword.includes('до сплати') || keyword.includes('к оплате')) return 3;
  return 2;
};

const getCandidateAmount = (line) => {
  const tokens = line.moneyTokens.filter((token) => token.value > 0);
  if (tokens.length === 0) return null;
  return tokens[tokens.length - 1];
};

const extractTotalFromLines = (lines) => {
  if (lines.length === 0) return null;
  const candidates = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const keyword = TOTAL_KEYWORDS_FOLDED.find((k) => line.folded.includes(k));
    if (!keyword) continue;
    const inBottomHalf = i >= Math.floor(lines.length / 2);
    const hasTaxWord = TOTAL_EXCLUDE_RE.test(line.text);
    const currentAmount = getCandidateAmount(line);
    if (currentAmount) {
      let score = scoreTotalKeyword(keyword);
      if (currentAmount.hasDecimal || currentAmount.hasGrouping) score += 2;
      if (/\b(pln|uah|usd|zl|грн)\b|zł|₴|\$/i.test(line.text)) score += 3;
      if (inBottomHalf) score += 2;
      if (hasTaxWord) score -= 6;
      candidates.push({ value: currentAmount.value, score, line: i });
    }
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j += 1) {
      if (looksLikeDateLine(lines[j].text)) continue;
      const nextAmount = getCandidateAmount(lines[j]);
      if (!nextAmount) continue;
      let score = scoreTotalKeyword(keyword) - 1;
      if (nextAmount.hasDecimal || nextAmount.hasGrouping) score += 2;
      if (/\b(pln|uah|usd|zl|грн)\b|zł|₴|\$/i.test(line.text) || /\b(pln|uah|usd|zl|грн)\b|zł|₴|\$/i.test(lines[j].text)) {
        score += 2;
      }
      if (j >= Math.floor(lines.length / 2)) score += 2;
      if (hasTaxWord || TOTAL_EXCLUDE_RE.test(lines[j].text)) score -= 6;
      candidates.push({ value: nextAmount.value, score, line: j });
    }
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.value !== a.value) return b.value - a.value;
      return b.line - a.line;
    });
    return candidates[0].value;
  }
  const lowerHalf = lines.slice(Math.floor(lines.length / 2));
  let best = null;
  for (const line of lowerHalf) {
    if (!hasTotalKeyword(line.folded)) continue;
    if (TOTAL_EXCLUDE_RE.test(line.text)) continue;
    const amount = getCandidateAmount(line);
    if (!amount) continue;
    if (best == null || amount.value > best) best = amount.value;
  }
  if (best != null) return best;
  const tail = lines.slice(Math.floor(lines.length * 0.6));
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    if (looksLikeDateLine(tail[i].text)) continue;
    const amount = tail[i].moneyTokens.findLast((token) => token.hasDecimal || token.hasGrouping);
    if (amount?.value) return amount.value;
  }
  return null;
};

const pickPaymentLineAmount = (line) => {
  const amount = getCandidateAmount(line);
  return amount?.value ?? null;
};

const inferPaymentAmount = (lines) => {
  const safePayments = [];
  const cashPayments = [];
  const changeAmounts = [];
  let carryPaymentKind = null;

  for (const line of lines) {
    const hasPayment = PAYMENT_KEYWORD_RE.test(line.text);
    const hasChange = CHANGE_KEYWORD_RE.test(line.text);
    if (hasChange) {
      const amount = pickPaymentLineAmount(line);
      if (amount) changeAmounts.push(amount);
      carryPaymentKind = null;
      continue;
    }
    const amount = pickPaymentLineAmount(line);
    if (SAFE_PAYMENT_KEYWORD_RE.test(line.text)) {
      if (amount) safePayments.push(amount);
      carryPaymentKind = 'safe';
      continue;
    }
    if (CASH_PAYMENT_KEYWORD_RE.test(line.text)) {
      if (amount) cashPayments.push(amount);
      carryPaymentKind = 'cash';
      continue;
    }
    if (!hasPayment && carryPaymentKind && amount && !looksLikeDateLine(line.text) && line.moneyTokens.length === 1) {
      if (carryPaymentKind === 'safe') safePayments.push(amount);
      if (carryPaymentKind === 'cash') cashPayments.push(amount);
    }
    carryPaymentKind = hasPayment ? carryPaymentKind : null;
  }

  if (safePayments.length > 0) {
    return { amount: Math.max(...safePayments), source: 'safe' };
  }
  if (cashPayments.length > 0 && changeAmounts.length > 0) {
    const paid = Math.max(...cashPayments);
    const change = Math.max(...changeAmounts);
    if (paid > change) return { amount: Number((paid - change).toFixed(2)), source: 'cash_change' };
  }
  if (cashPayments.length > 0) {
    return { amount: Math.max(...cashPayments), source: 'cash' };
  }
  return { amount: null, source: null };
};

const cleanItemName = (raw) => {
  let name = String(raw ?? '')
    .replace(/[_]+/g, ' ')
    .replace(/\s*[xх×*]\s*\d+(?:[.,]\d{1,2})?\s*=\s*$/u, '')
    .replace(/\s*[=:*]+\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return '';
  name = name.replace(/^[A-ZА-Я]\s+/u, '').trim();
  return name.slice(0, 60);
};

const extractItemsFromLines = (lines) => {
  const out = [];
  for (const line of lines) {
    if (line.moneyTokens.length === 0) continue;
    if (hasTotalKeyword(line.folded)) continue;
    if (PAYMENT_KEYWORD_RE.test(line.text) || CHANGE_KEYWORD_RE.test(line.text)) continue;
    if (ITEM_EXCLUDE_RE.test(line.text) || isAddressLike(line.text)) continue;
    const amountToken = line.moneyTokens[line.moneyTokens.length - 1];
    if (!amountToken) continue;
    const trailing = line.text.slice(amountToken.end).trim();
    if (trailing && !/^[\p{L}\s#.]*$/u.test(trailing)) continue;
    const name = cleanItemName(line.text.slice(0, amountToken.index));
    if (!name || /^pln$/i.test(name) || /^blik$/i.test(name) || looksLikeGenericShopWord(name)) continue;
    const letters = (name.match(/\p{L}/gu) ?? []).length;
    if (letters < 3) continue;
    out.push({ name, amount: amountToken.value });
    if (out.length >= 30) break;
  }
  return out;
};

const matchKeywordInText = (text, keyword) => {
  const folded = foldText(text);
  const word = foldText(keyword);
  if (!folded || !word) return false;
  if (word.includes(' ')) return folded.includes(word);
  const tokens = folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return tokens.some((token) => token.startsWith(word));
};

export const extractTotal = (text) => extractTotalFromLines(normalizeLines(text));

export const extractCurrency = (text) => detectCurrency(text).currency;

export const extractDate = (text) => {
  const t = String(text ?? '');
  const isValidYmd = (y, m, d) => {
    const yy = Number(y);
    const mm = Number(m);
    const dd = Number(d);
    if (!Number.isInteger(yy) || !Number.isInteger(mm) || !Number.isInteger(dd)) return false;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
    const dt = new Date(Date.UTC(yy, mm - 1, dd));
    return dt.getUTCFullYear() === yy && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd;
  };
  const m1 = t.match(/\b(\d{2})[.\-/](\d{2})[.\-/](\d{4})\b/);
  if (m1) {
    const [, d, mo, y] = m1;
    if (!isValidYmd(y, mo, d)) return null;
    return `${y}-${mo}-${d}`;
  }
  const m2 = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m2) {
    if (!isValidYmd(m2[1], m2[2], m2[3])) return null;
    return `${m2[1]}-${m2[2]}-${m2[3]}`;
  }
  return null;
};

export const extractShop = (text) => {
  const lines = normalizeLines(text);
  if (lines.length === 0) return null;
  const head = lines.slice(0, 8);
  for (const line of head) {
    if (isAddressLike(line.text)) continue;
    if (getBrandedShopCategoryId(line.text)) return prettifyShopName(line.text);
  }
  for (const line of head) {
    if (!looksLikeShopFallback(line)) continue;
    return prettifyShopName(line.text);
  }
  return null;
};

export const extractItems = (text) => extractItemsFromLines(normalizeLines(text));

export const pickCategoryId = (shop, items) => {
  const brandedCategory = getBrandedShopCategoryId(shop);
  if (brandedCategory) return brandedCategory;
  const scores = { food: 0, transport: 0, home: 0, health: 0, entertainment: 0 };
  const itemsText = (items ?? []).map((item) => foldText(item?.name ?? '')).join(' ');
  if (itemsText) {
    for (const [cat, words] of Object.entries(ITEM_KEYWORD_CATEGORY)) {
      for (const word of words) {
        if (matchKeywordInText(itemsText, word)) scores[cat] += 1;
      }
    }
  }
  const softShopHint = getSoftShopHintCategoryId(shop);
  if (softShopHint) scores[softShopHint] += 1;
  let best = null;
  let bestScore = 0;
  for (const [cat, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = cat;
      bestScore = score;
    }
  }
  if (best && KNOWN_CATEGORY_IDS.has(best)) return best;
  return 'other_expense';
};

export const parseReceipt = (text) => {
  const safeText = typeof text === 'string' ? text : '';
  const lines = normalizeLines(safeText);
  const shop = extractShop(safeText);
  let total = extractTotalFromLines(lines);
  const currencyInfo = detectCurrency(safeText);
  const date = extractDate(safeText);
  const rawItems = extractItemsFromLines(lines);
  const payment = inferPaymentAmount(lines);
  const reviewFlags = [];

  if (Number.isFinite(total) && total > 0 && Number.isFinite(payment.amount) && payment.amount > 0) {
    const shouldOverride =
      (payment.source === 'safe' || payment.source === 'cash_change') &&
      (total > payment.amount * 1.5 || total < payment.amount * 0.5);
    const shouldOverrideCashOnly = payment.source === 'cash' && total > payment.amount * 1.5;
    if (shouldOverride || shouldOverrideCashOnly) {
      total = payment.amount;
      reviewFlags.push('payment_total_override');
    }
  } else if ((!Number.isFinite(total) || total <= 0) && Number.isFinite(payment.amount) && payment.amount > 0) {
    if (payment.source !== 'cash') {
      total = payment.amount;
      reviewFlags.push('payment_total_fallback');
    }
  }

  if (currencyInfo.status !== 'detected') reviewFlags.push(`${currencyInfo.status}_currency`);
  if (!shop && rawItems.length > 0) reviewFlags.push('missing_shop');
  if (!Number.isFinite(total) || total <= 0) reviewFlags.push('missing_total');

  const totalCap = Number.isFinite(total) && total > 0 ? total * 1.1 : Infinity;
  const items = rawItems.filter((item) => item.amount > 0 && item.amount <= totalCap);
  if (rawItems.length > 0 && items.length === 0) reviewFlags.push('items_filtered');

  const categoryId = pickCategoryId(shop ?? '', items);
  return {
    shop,
    total: Number.isFinite(total) ? Number(total) : null,
    currency: currencyInfo.currency,
    date,
    categoryId,
    items,
    reviewFlags: Array.from(new Set(reviewFlags)),
    reviewRequired: reviewFlags.length > 0,
  };
};
