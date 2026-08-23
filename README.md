# Denga — фінансовий трекер

Telegram Mini App + Express API + SQLite + React (Vite).

## Dev

```bash
npm install
npm run dev       # Vite на :5173
npm run server    # API + Telegram bot на :3001
```

Чтобы открыть веб-версию в браузере минуя Telegram-заглушку — перейдите на `http://localhost:5173/?dev=1`.

## Deploy через GitHub

Новый деплой-флоу устроен так:

```
local  ── git push ──▶  GitHub (origin/main)  ── git pull ──▶  production server  ── pm2 restart
```

### Первичная настройка

1. Скопируйте шаблон окружения:

   ```bash
   cp .deploy.env.example .deploy.env
   ```

   И заполните реальные значения: SSH-доступ к продакшн-серверу, URL git-репо, ветка, имя pm2-процесса. Файл `.deploy.env` в `.gitignore` — не коммитится.

2. **Приватный репозиторий** — выберите один способ:

   - **HTTPS + токен (проще всего):** создайте [fine-grained token](https://github.com/settings/personal-access-tokens/new) с доступом **Contents: Read** только к репозиторию `Seansizeq/denga`. В `.deploy.env` укажите:

     ```
     GITHUB_USER=Seansizeq
     GITHUB_TOKEN=ghp_...
     ```

     Скрипт подставит токен в URL только на этапе `git clone` / `git fetch` на сервере (локальный `git push` у вас по-прежнему через ваш обычный Git credential).

   - **SSH deploy key:** выполните `npm run show-deploy-key` — вставьте выведенную строку в [Deploy keys](https://github.com/Seansizeq/denga/settings/keys) репозитория (read-only). Тогда в `.deploy.env` можно оставить `GIT_REMOTE_URL=git@github.com:Seansizeq/denga.git` и **не** задавать `GITHUB_TOKEN`.

3. Запустите первый деплой:

   ```bash
   npm run deploy
   ```

   При первом запуске на сервере `DEPLOY_APP_DIR` ещё не является git-репозиторием — скрипт:
   - делает резервную копию `.env` и `database.sqlite`;
   - клонирует репозиторий;
   - возвращает `.env` и БД на место;
   - ставит зависимости, билдит, перезапускает pm2.

   На всех последующих запусках он просто делает `git fetch && git reset --hard origin/<branch>`.

### Обычный деплой

```bash
npm run deploy
```

Скрипт:
1. `git add -A && git commit -m "deploy: <timestamp>"` (если есть изменения).
2. `git push origin <branch>`.
3. SSH-ится на сервер и выполняет `git pull`, `npm install`, `npm run build`, `pm2 restart`.

Если нужно просто пересобрать сервер без локальных изменений — коммит не создаётся, `git push` просто подтверждает актуальность, сервер подтянет свою `origin/<branch>`.

### Сброс сервера на чистый клон

Если на сервере нужно выкинуть всё локальное и заново синхронизироваться с GitHub:

```bash
ssh root@<HOST>
cd /root/denga && git fetch origin && git reset --hard origin/main && git clean -fdx -e .env -e database.sqlite
```

## Переменные окружения сервера

`/root/denga/.env` на продакшн-сервере (не коммитится, создаётся вручную). Минимум:

```
TELEGRAM_BOT_TOKEN=...
PORT=3001
# Только после того, как nginx начал слать X-Forwarded-For (см. «Безопасность»).
# TRUST_PROXY=1
```

Полный список с пояснениями — в [`.env.example`](.env.example). Ни один секрет в репозиторий не попадает: `.env`, `.deploy.env`, `database.sqlite` и `backups/` в `.gitignore`.

## Безопасность

**Авторизация.** Каждый запрос к `/api` несёт `initData` мини-приложения в заголовке `x-telegram-init-data`; подпись проверяется HMAC-SHA256 по токену бота ([`server/telegram-auth.js`](server/telegram-auth.js)). Без `TELEGRAM_BOT_TOKEN` сервер не стартует: проверять подпись было бы нечем, а «пропустить» в таком состоянии означает отдать чужие данные любому желающему.

Обход авторизации (`ALLOW_DEV_AUTH_BYPASS=1`) работает только вместе с `NODE_ENV=development`. На сервере `NODE_ENV` не выставляется, поэтому забытый флаг там игнорируется с предупреждением в лог.

**CORS.** Запрос на собственный хост разрешается всегда (фронтенд отдаёт тот же Express), посторонние origin — только из списка `CORS_ORIGINS`. Пустой список никого не добавляет.

**Ограничение частоты.** Три счётчика, каждый со своим ключом ([`server/rate-limit.js`](server/rate-limit.js)):

| Область | Ключ | По умолчанию |
| --- | --- | --- |
| весь `/api`, до авторизации | адрес клиента | 600/мин |
| `/api` после авторизации | id пользователя | 300/мин |
| `/api/automation` | адрес **и** токен ярлыка | 120 и 60/мин |

Ключ по адресу работает, только если nginx шлёт `X-Forwarded-For`, а на сервере выставлен `TRUST_PROXY=1`. Иначе все клиенты видны как `127.0.0.1`, и лимит по адресу становится общим потолком на всё приложение вместо персонального. Актуальный `setup_domain.js` этот заголовок настраивает; если nginx настраивали раньше — перезапустите скрипт или добавьте директивы вручную.

**Логи.** Токен автоматизации ездит в `?token=` (иначе ярлык на iPhone не умеет — там обычный GET без заголовков), поэтому `setup_domain.js` ставит формат лога с `$uri` вместо `$request`: путь пишется без параметров запроса.

**Известное.** Девять уязвимостей из `npm audit` — транзитивные, все из устаревшей цепочки `request` внутри `node-telegram-bot-api@0.67`. Они закрываются только переходом на `node-telegram-bot-api@2.0.0` (нулевые зависимости, но библиотека переписана с нуля и совместимости с v1 не имеет). Достижимость в этом приложении низкая: цепочка обслуживает разговор бота с `api.telegram.org`, а имена файлов в multipart генерирует само приложение.

## Домен и SSL

Разовый скрипт `node setup_domain.js` настраивает Nginx на `DEPLOY_DOMAIN` (по умолчанию `denga.vibelearn.site`) и выписывает SSL через certbot. Требует корректный `.deploy.env`.

## Лицензия

[MIT](LICENSE).
