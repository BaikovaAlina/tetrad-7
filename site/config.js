/* В репозиторий коммитится ТОЛЬКО этот шаблон. Секреты подставляются
   scripts/build.py в копию сайта на раннере Actions, не в git.
   ВАЖНО: режим direct раскрывает токен всем посетителям сайта. */
window.TRAINER_CONFIG = Object.freeze({
  schemaVersion: 1,
  title: 'Тетрадь 7',
  telegram: {
    mode: 'off', // off | proxy | direct
    botToken: '__TELEGRAM_BOT_TOKEN__',
    chatId: '__TELEGRAM_CHAT_ID__',
    proxyUrl: '__TELEGRAM_PROXY_URL__',
    turnstileSiteKey: '__TURNSTILE_SITE_KEY__',
    allowUnsafeDirect: false,
    timeoutMs: 15000,
  },
  grading: { five: 85, four: 70, three: 50 },
});
