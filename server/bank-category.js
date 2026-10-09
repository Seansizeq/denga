/**
 * Категорія для операції, яку ніхто не набирав руками: вона прийшла з вебхука
 * банку або з ярлика на телефоні, що спрацював на дотик картки.
 *
 * Тут навмисно немає моделі. Розпізнавання тексту виправдане, коли людина
 * пише «кава 55 карткою» — там треба зрозуміти фразу. А тут на вході рівно
 * два поля, обидва машинні: назва торговця в тому вигляді, у якому її передав
 * термінал, і MCC — чотиризначний код виду діяльності за ISO 18245, який
 * банк проставляє сам. Питати про це модель означало б платити мережевим
 * викликом і чужою квотою за відповідь, яку дає таблиця; до того ж операції
 * йдуть пачками (три покупки в ТЦ за десять хвилин), і саме тоді модель на
 * ноутбуці спить або впирається в ліміт.
 *
 * Порядок джерел — від найточнішого до найзагальнішого:
 *
 *   1. правило, якому людина навчила сама, виправивши категорію на картці;
 *   2. відома мережа за назвою (Biedronka, Orlen, Netflix);
 *   3. категорія, яку банк назвав словами (Privat24: «Транспорт»);
 *   4. MCC;
 *   5. «Інше».
 *
 * Правило стоїть над MCC, бо MCC описує торговця, а не витрату. Заправка з
 * магазином має код пального, і той, хто щоразу купує там каву, має рацію
 * проти таблиці.
 *
 * Мережа стоїть над MCC з тієї ж причини, тільки слабшої: назва точніша за
 * код. Netflix має код кабельного ТБ (4899 — у таблиці це «Житло»), а людина
 * з категорією «Підписки» чекає його саме там. Але головне, навіщо список
 * існує, — джерела без MCC узагалі: сповіщення Bybit і Wallet передають лише
 * назву, і без списку кожен новий магазин падав би в «Інше».
 */

/**
 * MCC → вбудована категорія.
 *
 * Список свідомо неповний. Вбудованих категорій витрат лише пʼять, і
 * розписувати сюди всі ~450 кодів ISO означало б вигадувати, куди подіти
 * ювелірні крамниці й ветеринарів; усе невідоме чесніше віддати в «Інше» й
 * дати людині виправити один раз — далі спрацює правило.
 */
export const MCC_CATEGORY = {
  // Їжа: магазини, ринки, кафе, ресторани, фастфуд, алкоголь.
  5411: 'food', 5412: 'food', 5422: 'food', 5441: 'food', 5451: 'food',
  5462: 'food', 5499: 'food', 5921: 'food',
  5811: 'food', 5812: 'food', 5813: 'food', 5814: 'food',

  // Транспорт: проїзд, таксі, пальне, стоянки, сервіс, переліт.
  4111: 'transport', 4112: 'transport', 4121: 'transport', 4131: 'transport',
  4304: 'transport', 4411: 'transport', 4511: 'transport', 4582: 'transport',
  4784: 'transport', 4789: 'transport',
  5533: 'transport', 5541: 'transport', 5542: 'transport', 5571: 'transport',
  7512: 'transport', 7523: 'transport', 7531: 'transport', 7538: 'transport',
  7542: 'transport',

  // Житло: комуналка, звʼязок, інтернет, оренда, будматеріали, меблі, техніка.
  4812: 'home', 4814: 'home', 4816: 'home', 4899: 'home', 4900: 'home',
  5200: 'home', 5211: 'home', 5231: 'home', 5251: 'home', 5261: 'home',
  5712: 'home', 5713: 'home', 5714: 'home', 5719: 'home', 5722: 'home',
  6513: 'home', 7349: 'home', 7623: 'home', 7629: 'home', 7641: 'home',

  // Здоровʼя: аптеки, лікарі, лабораторії, лікарні.
  5912: 'health', 5975: 'health', 5976: 'health',
  8011: 'health', 8021: 'health', 8031: 'health', 8041: 'health',
  8042: 'health', 8043: 'health', 8049: 'health', 8050: 'health',
  8062: 'health', 8071: 'health', 8099: 'health',

  // Розваги: кіно, театри, клуби, спорт, ігри, цифровий контент.
  5735: 'entertainment', 5815: 'entertainment', 5816: 'entertainment',
  5817: 'entertainment', 5818: 'entertainment',
  7832: 'entertainment', 7841: 'entertainment', 7911: 'entertainment',
  7922: 'entertainment', 7929: 'entertainment', 7932: 'entertainment',
  7933: 'entertainment', 7941: 'entertainment', 7991: 'entertainment',
  7992: 'entertainment', 7993: 'entertainment', 7994: 'entertainment',
  7996: 'entertainment', 7997: 'entertainment', 7998: 'entertainment',
  7999: 'entertainment',
};

export const FALLBACK_CATEGORY = { expense: 'other_expense', income: 'other_income' };

/**
 * Назва для звірки з мережами: нижній регістр, без діакритики й розділювачів.
 * `ŻABKA` і `Zabka`, `McDonald's` і `MCDONALD S` мають бути одним і тим самим.
 * `ł` — окремо, бо в Unicode це самостійна літера, а не `l` з рискою, і NFD її
 * не розкладає.
 */
const foldName = (raw) =>
  String(raw ?? '')
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Вид категорії, якої серед вбудованих немає, — її можна знайти лише серед
 * власних категорій людини, за початком слова в назві. «Одяг і взуття»,
 * «Clothes», «Підписки» знаходяться; «Цікаве» за маркером `кав` — ні, бо
 * маркер має стояти на початку слова.
 */
const CATEGORY_KINDS = {
  cafe: ['кафе', 'кав', 'ресторан', 'фастфуд', 'cafe', 'coffee', 'restaur', 'kawiarn'],
  clothing: ['одяг', 'одеж', 'взутт', 'обув', 'cloth', 'odziez', 'ubran'],
  subscriptions: ['підпис', 'подпис', 'subscript', 'subskryp'],
  electronics: ['технік', 'техник', 'електрон', 'электрон', 'electron', 'gadget', 'elektron'],
  beauty: ['космет', 'краса', 'догляд', 'beauty', 'kosmet', 'drogeri'],
  telecom: ['мобіл', 'телефон', 'інтернет', 'связ', 'mobile', 'phone', 'internet', 'telefon'],
  shopping: ['покуп', 'шопінг', 'shopping', 'zakup'],
};

const FOLDED_KINDS = Object.fromEntries(
  Object.entries(CATEGORY_KINDS).map(([kind, markers]) => [kind, markers.map(foldName)]),
);

/**
 * Відомі мережі. Кожен рядок — куди класти, у порядку переваги: `kind:` шукає
 * власну категорію людини, звичайний id — вбудовану. Нічого з цього не
 * знайшлося — мережа мовчить, і слово переходить до MCC.
 *
 * Вирішує **перша** мережа, що збіглася, тому порядок рядків має значення:
 * доставка стоїть перед таксі (`uber eats` раніше за `uber`), підписки — перед
 * магазинами (`amazon prime` раніше за `amazon`).
 *
 * Назва збігається лише цілим словом або словом, до якого приліплено номер
 * точки: `bolt` ловить `BOLT.EU` і `BOLT123`, але не `BOLTEX`; `dino` не
 * впізнає `DINOZAUR PARK`.
 */
const BRAND_RULES = [
  {
    to: ['kind:cafe', 'food'],
    brands: [
      'uber eats', 'ubereats', 'bolt food', 'glovo', 'wolt', 'pyszne', 'pizzaportal',
      'mcdonald', 'mcdonalds', 'kfc', 'burger king', 'subway', 'pizza hut', 'domino', 'dominos',
      'telepizza', 'starbucks', 'costa coffee', 'caffe nero', 'max premium burgers', 'north fish',
    ],
  },
  {
    to: ['kind:subscriptions', 'entertainment'],
    brands: [
      'netflix', 'spotify', 'youtube', 'disney', 'hbo', 'prime video', 'amazon prime', 'apple com bill',
      'apple music', 'google play', 'tidal', 'deezer', 'twitch', 'player pl', 'megogo', 'sweet tv',
    ],
  },
  {
    to: ['kind:subscriptions'],
    brands: [
      'icloud', 'google one', 'google storage', 'openai', 'chatgpt', 'anthropic', 'claude ai',
      'github', 'notion', 'adobe', 'microsoft', 'dropbox', 'duolingo', 'telegram', 'patreon',
      'canva', 'figma', 'jetbrains',
    ],
  },
  {
    to: ['food'],
    brands: [
      'biedronka', 'zabka', 'lidl', 'kaufland', 'carrefour', 'auchan', 'netto', 'dino', 'aldi',
      'lewiatan', 'stokrotka', 'intermarche', 'polomarket', 'spar', 'eurospar', 'freshmarket',
      'delikatesy centrum', 'groszek', 'topaz', 'frisco', 'piekarnia', 'cukiernia',
      'silpo', 'atb', 'novus', 'varus', 'fora', 'eko market', 'velmart', 'metro cash',
      'сільпо', 'атб', 'новус', 'варус', 'фора',
    ],
  },
  {
    to: ['transport'],
    brands: [
      'uber', 'bolt', 'freenow', 'free now', 'itaxi', 'uklon', 'blablacar', 'flixbus',
      'jakdojade', 'koleo', 'mobilet', 'skycash', 'pkp', 'intercity', 'polregio', 'koleje',
      'ztm', 'mpk', 'zkm', 'ryanair', 'wizz air', 'wizzair', 'ukrzaliznytsia',
      'orlen', 'bp', 'shell', 'circle k', 'moya', 'amic', 'lotos', 'okko', 'wog', 'upg', 'socar', 'brsm',
      'traficar', 'panek', 'lime', 'tier', 'dott', 'nextbike', 'veturilo', 'parking', 'parkomat',
    ],
  },
  {
    to: ['health'],
    brands: [
      'apteka', 'аптека', 'super pharm', 'superpharm', 'dr max', 'doz', 'ziko', 'cefarm',
      'luxmed', 'lux med', 'medicover', 'enel med', 'enelmed', 'diagnostyka', 'synevo', 'alab',
      'dobrobut', 'подорожник',
    ],
  },
  {
    to: ['entertainment'],
    brands: [
      'cinema city', 'multikino', 'helios', 'kino', 'planeta kino', 'multiplex', 'steam', 'steampowered',
      'playstation', 'xbox', 'nintendo', 'epic games', 'eventim', 'ebilet', 'biletomat',
    ],
  },
  {
    // Звʼязок у вбудованих — частина «Житла» (так само його кладе й MCC 4812).
    to: ['kind:telecom', 'home'],
    brands: [
      'doladowania', 'play pl', 'orange', 't mobile', 'tmobile', 'plus pl', 'heyah', 'upc', 'vectra',
      'netia', 'inea', 'kyivstar', 'vodafone', 'lifecell',
    ],
  },
  {
    to: ['home'],
    brands: [
      'ikea', 'castorama', 'leroy merlin', 'obi', 'jysk', 'bricomarche', 'agata meble', 'black red white',
      'homla', 'epicentr', 'tauron', 'pge', 'enea', 'energa', 'pgnig', 'innogy', 'veolia', 'mpwik',
      'yasno', 'dtek', 'naftogaz',
    ],
  },
  {
    to: ['kind:clothing'],
    brands: [
      'zara', 'reserved', 'sinsay', 'cropp', 'mohito', 'bershka', 'pull bear', 'stradivarius',
      'massimo dutti', 'new yorker', 'h m', 'hennes', 'tk maxx', 'tkmaxx', 'primark', 'pepco', 'kappahl',
      'mango', 'uniqlo', 'lc waikiki', 'half price', 'ccc', 'deichmann', 'zalando', 'answear', 'shein',
      'vinted', 'decathlon', '4f', 'nike', 'adidas', 'puma',
    ],
  },
  {
    to: ['kind:electronics'],
    brands: [
      'media expert', 'mediaexpert', 'media markt', 'mediamarkt', 'rtv euro agd', 'euro net', 'x kom', 'xkom',
      'komputronik', 'morele', 'neonet', 'apple store', 'samsung', 'xiaomi', 'rozetka', 'comfy', 'foxtrot', 'moyo',
    ],
  },
  {
    to: ['kind:beauty', 'kind:shopping'],
    brands: ['rossmann', 'hebe', 'notino', 'douglas', 'sephora', 'inglot'],
  },
  {
    to: ['kind:shopping'],
    brands: ['allegro', 'amazon', 'temu', 'aliexpress', 'olx', 'empik', 'action', 'tedi', 'kik', 'smyk'],
  },
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const COMPILED_BRAND_RULES = BRAND_RULES.map(({ to, brands }) => ({
  to,
  patterns: brands.map((brand) => new RegExp(`(?:^| )${escapeRegExp(foldName(brand))}(?=$| |\\d)`)),
}));

/** Куди класти цю мережу, або `null`, якщо назва нічого не нагадує. */
const brandTargets = (merchant) => {
  const name = foldName(merchant);
  if (!name) return null;
  return COMPILED_BRAND_RULES.find(({ patterns }) => patterns.some((pattern) => pattern.test(name)))?.to ?? null;
};

const FALLBACK_IDS = new Set(Object.values(FALLBACK_CATEGORY));

/** Власна категорія людини цього виду й напрямку, якщо така є. */
const findKindCategory = (kind, categories, wantedType) => {
  const markers = FOLDED_KINDS[kind];
  if (!markers) return null;
  return (
    categories.find((category) => {
      if (category?.type !== wantedType || FALLBACK_IDS.has(String(category?.id ?? ''))) return false;
      const words = foldName(category?.name).split(' ');
      return words.some((word) => markers.some((marker) => word.startsWith(marker)));
    }) ?? null
  );
};

/**
 * Скільки символів ключа торговця лишаємо. Назва з терміналу буває довгою й
 * із адресою всередині; для звірки «той самий магазин» вистачає початку.
 */
const MERCHANT_KEY_MAX = 48;

/**
 * Ключ, за яким «той самий магазин» упізнається наступного разу.
 *
 * Термінали дописують до назви номер точки, місто й сміття з пробілів:
 * `BIEDRONKA 1234 KRAKOW`, `Silpo 0271`, `SKLEP  NR 7`. Якщо лишити все як є,
 * правило, вивчене в одному «Сільпо», не спрацює в сусідньому — а це та сама
 * витрата з погляду обліку.
 *
 * Тому: до нижнього регістру, геть усе, крім літер і цифр, і **відкидаємо
 * суто числові слова**. Саме слова цілком, а не цифри взагалі: у «Multiplex
 * 4DX» число зрослося з літерами й несе сенс, а окреме «1234» між назвою та
 * містом — це номер точки й нічого більше.
 *
 * Назва з самих цифр лишається як є: інакше ключ став би порожнім, і всі такі
 * торговці склеїлися б в одного.
 */
export const merchantKey = (raw) => {
  const words = String(raw ?? '')
    .toLocaleLowerCase('uk-UA')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const named = words.filter((word) => !/^\d+$/.test(word));
  return (named.length > 0 ? named : words).join(' ').slice(0, MERCHANT_KEY_MAX);
};

/**
 * Категорія, яку назвав сам банк («Транспорт», «Кафе та ресторани»), у
 * категоріях людини.
 *
 * Слова звіряються за основою — `аптеки` з `аптека`, `продукти` з `продукт`, —
 * бо банк і людина рідко пишуть одне слово в одній формі. Порядок пошуку —
 * від власного до загального: спершу назви категорій, тоді види (власна
 * «Кава» для банківського «Кафе»), і аж потім вбудовані синоніми — інакше
 * синонім `кафе` у вбудованих «Продуктах» перехоплював би власну категорію.
 */
const findBankCategory = (hint, categories, wantedType) => {
  const words = foldName(hint).split(' ').filter(Boolean);
  if (words.length === 0) return null;
  const candidates = categories.filter(
    (category) => category?.type === wantedType && !FALLBACK_IDS.has(String(category?.id ?? '')),
  );
  const stemMatches = (term) => {
    const stem = term.slice(0, Math.max(4, term.length - 1));
    return words.some((word) => word.startsWith(stem));
  };
  const matchesAny = (terms) =>
    terms
      .flatMap((term) => foldName(term).split(' '))
      .filter((term) => term.length >= 4)
      .some(stemMatches);

  const byName = candidates.find((category) => matchesAny([category?.name]));
  if (byName) return byName;

  for (const [kind, markers] of Object.entries(FOLDED_KINDS)) {
    if (!words.some((word) => markers.some((marker) => word.startsWith(marker)))) continue;
    const own = findKindCategory(kind, candidates, wantedType);
    if (own) return own;
  }

  return candidates.find((category) => matchesAny(category?.aliases ?? [])) ?? null;
};

/**
 * Категорія для однієї операції.
 *
 * @param merchant назва торговця так, як її передав банк або Wallet.
 * @param mcc код виду діяльності; у ярлика його немає — і це нормально.
 * @param bankCategory категорія словами від самого банку (Privat24 пише її в
 *   пуші); важить стільки ж, скільки MCC, і стоїть перед ним, бо вже
 *   сказана людською мовою.
 * @param type 'expense' | 'income' — рахується за знаком суми, не вгадується.
 * @param rules `ключ торговця -> id категорії`, вивчене цією людиною.
 * @param categories власні й вбудовані категорії користувача: id звідси
 *   гарантовано існує, тож у транзакцію не потрапить категорія-привид.
 * @returns {{ categoryId: string, categoryName: string,
 *   source: 'rule'|'brand'|'bank'|'mcc'|'fallback' }}
 */
export const resolveBankCategory = ({
  merchant = '',
  mcc = null,
  bankCategory = null,
  type = 'expense',
  rules = {},
  categories = [],
} = {}) => {
  const wantedType = type === 'income' ? 'income' : 'expense';
  const byId = new Map(
    categories.filter((c) => c?.id != null).map((c) => [String(c.id), c]),
  );

  /** Категорія існує і саме того напрямку, що й операція — інакше не береться. */
  const pick = (id, source) => {
    const found = byId.get(String(id ?? ''));
    if (!found || found.type !== wantedType) return null;
    return { categoryId: String(found.id), categoryName: String(found.name ?? found.id), source };
  };

  const key = merchantKey(merchant);
  const learned = key ? pick(rules?.[key], 'rule') : null;
  if (learned) return learned;

  for (const target of brandTargets(merchant) ?? []) {
    const id = target.startsWith('kind:')
      ? findKindCategory(target.slice('kind:'.length), categories, wantedType)?.id
      : target;
    const byBrand = id ? pick(id, 'brand') : null;
    if (byBrand) return byBrand;
  }

  const fromBank = bankCategory ? findBankCategory(bankCategory, categories, wantedType) : null;
  const byBank = fromBank ? pick(fromBank.id, 'bank') : null;
  if (byBank) return byBank;

  const code = Number.parseInt(String(mcc ?? ''), 10);
  const byMcc = Number.isInteger(code) ? pick(MCC_CATEGORY[code], 'mcc') : null;
  if (byMcc) return byMcc;

  const fallbackId = FALLBACK_CATEGORY[wantedType];
  return (
    pick(fallbackId, 'fallback')
    // Список категорій приходить із бази, і теоретично може бути порожнім
    // (перший запуск, збій читання). Операцію через це губити не можна:
    // вбудовані id однаково валідні самі по собі.
    ?? { categoryId: fallbackId, categoryName: fallbackId, source: 'fallback' }
  );
};
