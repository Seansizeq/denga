/**
 * Складання листа про помилку, який бот приносить власнику застосунку.
 *
 * Окремим модулем, бо тут єдине справді крихке місце всієї фічі — межа між
 * тим, що написала людина, і тим, що стверджує сервер. Усе, що приходить з
 * клієнта, треба вважати текстом, який хтось міг скласти навмисно: якби
 * `screen` дозволяв переноси рядків, у ньому поїхав би підроблений рядок
 * «Від: @хтось-інший», і лист перестав би відрізняти автора від вигадки.
 *
 * Тому службові поля зводяться до одного рядка й обрізаються, а вільний текст
 * іде **останнім**, за розділювачем: підробити ним шапку вже нікуди.
 */

/** Стеля повідомлення в Telegram — 4096; решту місця лишаємо шапці. */
export const FEEDBACK_MAX_LENGTH = 2000;

const META_LIMIT = 120;
const ERROR_LIMIT = 400;

/** Один рядок без керівних символів: усе інше склеюється пробілами. */
const oneLine = (value, limit) => {
  if (typeof value !== 'string') return '';
  const flat = value.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
};

/**
 * Текст листа: порожній або з самих пробілів — не лист. Переноси всередині
 * лишаються, це нормальний абзац, а не службове поле.
 *
 * @returns {string | null} нормалізований текст або `null`, якщо писати нічого
 */
export const normalizeFeedbackText = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > FEEDBACK_MAX_LENGTH ? trimmed.slice(0, FEEDBACK_MAX_LENGTH) : trimmed;
};

/**
 * Стеля на знімок. Тіло запиту й так обмежене мегабайтом, але спиратися на
 * це не можна: разом із текстом межа проходила б не там, де здається, і
 * людина отримувала б замість зрозумілої відмови голий 413.
 */
export const FEEDBACK_IMAGE_MAX_BYTES = 700 * 1024;

/** Тільки те, з чого справді збереться картинка. */
const BASE64_ONLY = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Знімок приходить рядком base64 — тим самим шляхом, яким у застосунку вже
 * їде фото чека.
 *
 * @param {unknown} value
 * @returns {{ ok: true, image: string | null } | { ok: false, reason: 'malformed' | 'too_large' }}
 */
export const normalizeFeedbackImage = (value) => {
  if (value === undefined || value === null || value === '') return { ok: true, image: null };
  if (typeof value !== 'string') return { ok: false, reason: 'malformed' };

  // Коми в base64 не буває, тож усе до неї — це префікс `data:image/...`.
  const comma = value.indexOf(',');
  const raw = (comma >= 0 ? value.slice(comma + 1) : value).trim();
  if (!raw) return { ok: true, image: null };
  if (!BASE64_ONLY.test(raw)) return { ok: false, reason: 'malformed' };

  // Четвірка байтів тексту — три байти картинки; хвостові «=» не рахуються.
  const bytes = Math.floor((raw.length * 3) / 4);
  if (bytes > FEEDBACK_IMAGE_MAX_BYTES) return { ok: false, reason: 'too_large' };
  if (bytes < 64) return { ok: false, reason: 'malformed' };

  return { ok: true, image: raw };
};

/**
 * Підпис під знімком. Коротко й самодостатньо: знімок і текст їдуть різними
 * повідомленнями, тож із самого підпису має бути видно, чий він і до чого.
 */
export const buildFeedbackPhotoCaption = ({ userId, username } = {}) => {
  const who = oneLine(username, META_LIMIT);
  const id = oneLine(String(userId ?? ''), META_LIMIT) || '—';
  return `🖼 Знімок до скарги · ${who ? `@${who.replace(/^@/, '')} · ` : ''}id ${id}`;
};

/**
 * @param {{ text: string, userId: string, username?: string | null,
 *           screen?: string, appVersion?: string, platform?: string,
 *           tgVersion?: string, error?: string, hasImage?: boolean }} report
 * @returns {string} готовий текст повідомлення, без розмітки
 */
export const buildFeedbackReport = (report) => {
  const who = oneLine(report?.username, META_LIMIT);
  const lines = [
    '🐞 Скарга на помилку',
    '',
    `Від: ${who ? `@${who.replace(/^@/, '')} · ` : ''}id ${oneLine(String(report?.userId ?? ''), META_LIMIT) || '—'}`,
  ];

  const screen = oneLine(report?.screen, META_LIMIT);
  if (screen) lines.push(`Екран: ${screen}`);

  // Версії в один рядок: поодинці кожна з них шапку тільки роздуває.
  const build = [
    oneLine(report?.appVersion, META_LIMIT),
    oneLine(report?.platform, META_LIMIT),
    oneLine(report?.tgVersion, META_LIMIT) ? `Telegram ${oneLine(report?.tgVersion, META_LIMIT)}` : '',
  ].filter(Boolean);
  if (build.length) lines.push(`Збірка: ${build.join(' · ')}`);

  const error = oneLine(report?.error, ERROR_LIMIT);
  if (error) lines.push(`Помилка: ${error}`);

  // Знімок їде окремим повідомленням і може не доїхати зовсім (черга здається
  // після шести спроб). Без цього рядка про його існування ніхто б не дізнався.
  if (report?.hasImage) lines.push('Знімок: окремим повідомленням');

  lines.push('', '———', '', String(report?.text ?? ''));
  return lines.join('\n');
};
