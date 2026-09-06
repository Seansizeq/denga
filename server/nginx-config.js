/**
 * Конфігурація nginx для Denga.
 *
 * Живе окремим модулем із двох причин. По-перше, її можна перевірити тестом —
 * а тут є рівно та помилка, яку інакше ніхто не помітить: за `proxy_pass`
 * типове `gzip_proxied off` означає, що **пропрокшений вміст не стискається
 * взагалі**. Тобто конфіг із `gzip on` виглядав би правильним і не робив би
 * нічого.
 *
 * По-друге, конфіг ділиться на дві частини з різною ціною застосування:
 *
 * - `http`-контекст (стиснення, оголошення зони лімітів) кладеться окремим
 *   файлом у `conf.d` і застосовується `nginx -s reload`. Це чисто додаткова
 *   зміна: блок `server` не переписується, certbot не чіпається, простою немає.
 * - блок `server` переписується цілком, а після нього certbot має заново
 *   вставити SSL. Це вже помітна операція, і робити її заради стиснення не
 *   треба.
 */

/**
 * Типи, які варто стискати.
 *
 * `text/html` тут навмисно немає: nginx стискає його завжди, а явна згадка дає
 * попередження про дублювання. `application/json` — найважливіший рядок
 * списку: відповіді API це основний трафік застосунку, і саме вони стискаються
 * найкраще.
 */
export const GZIP_TYPES = [
  'application/javascript',
  'application/json',
  'application/manifest+json',
  'application/wasm',
  'application/xml',
  'font/ttf',
  'font/woff',
  'font/woff2',
  'image/svg+xml',
  'text/css',
  'text/javascript',
  'text/plain',
  'text/xml',
];

/** Нижче цього стискати дорожче, ніж віддати як є. */
export const GZIP_MIN_LENGTH = 1024;

/**
 * 5 із 9. Далі виграш у розмірі йде на одиниці відсотків, а процесорний час —
 * помітно вгору; на VPS з одним-двома ядрами це поганий обмін.
 */
export const GZIP_COMP_LEVEL = 5;

/**
 * Стеля запитів з однієї адреси.
 *
 * Навмисно висока. Мобільні оператори ховають тисячі абонентів за одним
 * зовнішнім IP (CGNAT), а Telegram-застосунок відкривають переважно з телефона
 * — тож «одна адреса» тут запросто означає десятки різних людей. Один
 * клієнт із відкритим екраном робить близько 0.4 запиту на секунду, отже
 * 50 r/s — це приблизно сто одночасних людей за спільною адресою, перш ніж
 * хтось побачить 503.
 *
 * Персональні квоти рахує сам застосунок за `user_id` (див. `rate-limit.js`);
 * тут стоїть груба заслінка від потоку, і вона має спрацьовувати пізніше за
 * них, а не раніше.
 *
 * Увага: якщо перед nginx стоїть Cloudflare (як на проді), `$binary_remote_addr`
 * тут — це адреса краю CF, а не клієнта. Отже ця зона рахує краї, а не людей, і
 * стеля має бути щедрою. Персональний облік у такій схемі веде лише застосунок,
 * якому `TRUST_PROXY=2` дає справжню адресу.
 */
export const API_RATE_LIMIT = { rate: '50r/s', burst: 100, zoneSize: '10m' };

/**
 * Частина в `http`-контексті. Кладеться в `conf.d`, застосовується перезаван-
 * таженням nginx і нічого наявного не переписує.
 */
export const buildTuningConf = ({ includeGzipOn = true } = {}) =>
  [
    '# Denga: стиснення та зони лімітів. Керується scripts/apply-nginx-tuning.js.',
    '',
    // У типовому конфігу Debian `gzip on` уже стоїть у nginx.conf, а решта
    // директив закоментована. Повторне оголошення там — не попередження, а
    // помилка «duplicate directive», і nginx відмовляється стартувати.
    ...(includeGzipOn ? ['gzip on;'] : ['# gzip on — уже оголошено в nginx.conf']),
    '# Без цього рядка все інше не працює: за proxy_pass типове значення — off,',
    '# тобто відповіді, що прийшли від застосунку, не стискаються зовсім.',
    '# Саме так і було на проді: gzip увімкнений, а стиснення немає.',
    'gzip_proxied any;',
    '# Щоб проміжні кеші не віддали стиснуте клієнту, який його не приймає.',
    'gzip_vary on;',
    `gzip_min_length ${GZIP_MIN_LENGTH};`,
    `gzip_comp_level ${GZIP_COMP_LEVEL};`,
    `gzip_types ${GZIP_TYPES.join(' ')};`,
    '',
    '# Зона лічильників для /api. Саме обмеження вмикається в блоці server.',
    `limit_req_zone $binary_remote_addr zone=denga_api:${API_RATE_LIMIT.zoneSize} rate=${API_RATE_LIMIT.rate};`,
    '# Щоб перевищення ліміту не виглядало як падіння сервера.',
    'limit_req_status 429;',
    '',
  ].join('\n');

/**
 * Формат логу без рядка запиту.
 *
 * Токен автоматизації їздить у `?token=` — інакше ярлик на iPhone не вміє,
 * там звичайний GET без заголовків. Це постійний ключ на запис, і в
 * стандартному логу він осідає відкритим текстом назавжди: `access.log`
 * читає хто завгодно з доступом до сервера, він потрапляє в бекапи й у
 * будь-який збір логів. `$uri` пише шлях без параметрів — усе, що з логу
 * справді треба, лишається.
 */
export const buildLogFormatConf = () =>
  [
    "log_format denga_no_query '$remote_addr - $remote_user [$time_local] '",
    '                          \'"$request_method $uri $server_protocol" \'',
    '                          \'$status $body_bytes_sent "$http_referer" "$http_user_agent"\';',
    '',
  ].join('\n');

/**
 * Блок `server`. Переписується цілком, тож після нього потрібен certbot.
 *
 * @param {{ domain: string, port?: number }} params
 */
export const buildServerConf = ({ domain, port = 3001 }) => {
  if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) {
    throw new Error(`buildServerConf: некоректний домен "${domain}"`);
  }
  return `server {
    listen 80;
    server_name ${domain};

    access_log /var/log/nginx/access.log denga_no_query;

    # Скан чека шле картинку в base64; сам застосунок ріже її на ~1 МБ.
    client_max_body_size 12m;

    # Перевірка стану. Без обмеження частоти — її смикають постійно — і без
    # запису в лог: інакше access.log перетворюється на суцільний потік проб,
    # у якому вже не видно справжніх запитів.
    #
    # Активних перевірок upstream у відкритому nginx немає (це можливість
    # nginx Plus), тож цей шлях призначений зовнішньому моніторингу, а не
    # самому nginx: 200 означає «процес живий і база відповідає», 503 — ні.
    location = /healthz {
        access_log off;
        proxy_pass http://localhost:${port}/healthz;
        include /etc/nginx/conf.d/denga-proxy-headers.inc;
    }

    # Метрики назовні не віддаються взагалі: вони за токеном, але й сам факт
    # їхньої наявності стороннім знати не потрібно.
    location = /metrics {
        return 404;
    }

    location /api/ {
        # Груба заслінка від потоку. Персональні квоти рахує застосунок за
        # user_id — ця стеля має спрацьовувати пізніше за них, а не раніше.
        limit_req zone=denga_api burst=${API_RATE_LIMIT.burst} nodelay;
        proxy_pass http://localhost:${port};
        include /etc/nginx/conf.d/denga-proxy-headers.inc;
    }

    location / {
        proxy_pass http://localhost:${port};
        include /etc/nginx/conf.d/denga-proxy-headers.inc;
    }
}
`;
};

/**
 * Спільні заголовки проксі, винесені у файл, який підключають обидва
 * `location`. Доки вони були скопійовані двічі, будь-яка правка мала шанс
 * поїхати лише в одну копію — а різна поведінка `/api` і решти саме тут
 * найдорожча: від `X-Forwarded-For` залежить, чи бачить застосунок справжню
 * адресу клієнта.
 */
export const buildProxyHeadersConf = () =>
  `proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection 'upgrade';
proxy_set_header Host $host;
# Без цього застосунок бачить усіх клієнтів як 127.0.0.1, і обмеження
# частоти по адресі стає одним спільним відром на всіх.
# $proxy_add_x_forwarded_for дописує справжню адресу в кінець списку, а
# TRUST_PROXY=1 велить Express брати рівно один крок справа — тобто цей
# останній елемент. Заголовок, підроблений клієнтом, лишається лівіше й
# ігнорується. Разом із цим на сервері вмикається TRUST_PROXY=1.
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_cache_bypass $http_upgrade;
`;

/** Записати файл на сервері через heredoc, не боячись лапок усередині. */
export const writeRemoteFile = (remotePath, contents) =>
  `cat << 'DENGA_EOF' > ${remotePath}\n${contents}DENGA_EOF`;
