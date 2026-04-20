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

2. (Если репо приватный.) Укажите в `.deploy.env` `GITHUB_USER` и `GITHUB_TOKEN` (Personal Access Token с `repo:read`). Скрипт автоматически впишет токен в `origin` URL на сервере, чтобы `git pull` работал без интерактивного логина.

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

`/root/denga/.env` на продакшн-сервере (не коммитится, создаётся вручную):

```
TELEGRAM_BOT_TOKEN=...
PORT=3001
```

## Домен и SSL

Разовый скрипт `node setup_domain.js` настраивает Nginx на `DEPLOY_DOMAIN` (по умолчанию `denga.vibelearn.site`) и выписывает SSL через certbot. Требует корректный `.deploy.env`.
