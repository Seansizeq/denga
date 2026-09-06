/**
 * Словники по мовах.
 *
 * Раніше всі три мови лежали одним файлом на 104 КБ, і він цілком потрапляв у
 * критичний шлях: людина, яка бачить український інтерфейс, однаково платила за
 * російський та англійський тексти при кожному холодному відкритті.
 *
 * Тепер статично їде лише мова за замовчуванням, решта — окремими чанками на
 * вимогу. Цей файл лишився як спільна точка входу, щоб десяток місць, які
 * беруть звідси `Language`, `CategoryKey` чи список мов, не довелося чіпати.
 */
import uk from './locales/uk';
import type { Dict, Language } from './dictionary';

export {
  LANGUAGES,
  LANGUAGE_LABELS,
  LANGUAGE_FLAGS,
  LOCALE_MAP,
} from './dictionary';
export type { Dict, Language, CategoryKey } from './dictionary';

/** Мова, яку показуємо, поки обрана ще вантажиться. */
export const DEFAULT_LANGUAGE: Language = 'uk';

/** Уже завантажені словники. `uk` тут із самого початку. */
const loaded = new Map<Language, Dict>([['uk', uk]]);

export const getLoadedDictionary = (language: Language): Dict | undefined => loaded.get(language);

/**
 * Довантажує словник обраної мови.
 *
 * Гілки навмисно явні, а не `import(\`./locales/${lang}\`)`: так у збірці
 * зʼявляється рівно два додаткові чанки з передбачуваними іменами, а не
 * результат роботи glob-евристики збирача.
 */
export const loadDictionary = async (language: Language): Promise<Dict> => {
  const cached = loaded.get(language);
  if (cached) return cached;

  const mod = language === 'ru' ? await import('./locales/ru') : await import('./locales/en');
  loaded.set(language, mod.default);
  return mod.default;
};
