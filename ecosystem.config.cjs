/**
 * Опис процесів для pm2.
 *
 * Два процеси замість одного, і це не косметика. Раніше малювання картки звіту
 * (~0.5 с суцільного рахунку) відбувалося в тому самому процесі, що відповідає
 * на запити застосунку, — і на час малювання не відповідало нікому. А підняти
 * другу копію було неможливо: разом із нею піднялося б друге опитування
 * Telegram, а два поллери на один токен ділять апдейти навперемін і половина
 * повідомлень губиться.
 *
 * Тепер:
 *   denga-api — лише HTTP, скільки завгодно копій (cluster);
 *   denga-bot — Telegram і планувальники, рівно одна копія (fork).
 *
 * Запуск:  pm2 start ecosystem.config.cjs
 * Оновлення без простою:  pm2 reload denga-api && pm2 restart denga-bot
 */

/**
 * Скільки копій API. `max` віддав би всі ядра, не лишивши нічого бот-процесу,
 * який саме й займається важким рахунком. Два — розумний старт для VPS на
 * двох-чотирьох ядрах; піднімати варто разом із ядрами.
 */
const API_INSTANCES = Number(process.env.DENGA_API_INSTANCES) || 2;

/**
 * pm2 чекає стільки після SIGTERM, перш ніж надіслати SIGKILL.
 *
 * Типові 1600 мс — це та стеля, під яку підлаштований `SHUTDOWN_BUDGET_MS` у
 * `server/shutdown.js`. Піднімаємо обидва разом: коректне закриття бази має
 * встигнути, інакше після кожного деплою лишається -wal, більший за саму базу.
 */
const KILL_TIMEOUT_MS = 3000;
const SHUTDOWN_BUDGET_MS = 2800;

const shared = {
  cwd: __dirname,
  kill_timeout: KILL_TIMEOUT_MS,
  // Перезапуск по колу на зламаному конфізі лише ховає проблему в логах.
  max_restarts: 10,
  min_uptime: '20s',
  env: {
    NODE_ENV: 'production',
    SHUTDOWN_BUDGET_MS: String(SHUTDOWN_BUDGET_MS),
  },
};

module.exports = {
  apps: [
    {
      ...shared,
      name: 'denga-api',
      script: 'server/api.js',
      instances: API_INSTANCES,
      exec_mode: 'cluster',
      env: {
        ...shared.env,
        // Лічильники частоти живуть у памʼяті процесу, тож кожна копія має
        // знати, скільки їх усього, і ділити квоту на цю кількість.
        DENGA_API_INSTANCES: String(API_INSTANCES),
      },
    },
    {
      ...shared,
      name: 'denga-bot',
      script: 'server/bot.js',
      // Рівно один. `cluster` тут дав би друге опитування Telegram.
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
