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
 *   2. MCC;
 *   3. «Інше».
 *
 * Правило стоїть над MCC, бо MCC описує торговця, а не витрату. Заправка з
 * магазином має код пального, і той, хто щоразу купує там каву, має рацію
 * проти таблиці.
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
 * Категорія для однієї операції.
 *
 * @param merchant назва торговця так, як її передав банк або Wallet.
 * @param mcc код виду діяльності; у ярлика його немає — і це нормально.
 * @param type 'expense' | 'income' — рахується за знаком суми, не вгадується.
 * @param rules `ключ торговця -> id категорії`, вивчене цією людиною.
 * @param categories власні й вбудовані категорії користувача: id звідси
 *   гарантовано існує, тож у транзакцію не потрапить категорія-привид.
 * @returns {{ categoryId: string, categoryName: string, source: 'rule'|'mcc'|'fallback' }}
 */
export const resolveBankCategory = ({
  merchant = '',
  mcc = null,
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
