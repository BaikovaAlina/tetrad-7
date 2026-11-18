# Telegram-прокси · Cloudflare Worker

Опциональный серверless-компонент: не нужен для решения задач и режима off. Скрывает Telegram token от браузера, жёстко задаёт получателя, но не удостоверяет ученика и его баллы.

Полная настройка: [docs/DEPLOY.md → 5Б](../docs/DEPLOY.md). Риски и ограничения: [SECURITY.md](../docs/SECURITY.md).

- `index.js` — ESM Worker с импортом общего форматтера из `site/assets/js/report-message.js`.
- `wrangler.toml` — origin, Turnstile по умолчанию включён, best-effort лимит. Реальных ключей здесь нет.
- Secrets Worker: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TURNSTILE_SECRET_KEY`.
- Публичные Variables GitHub Pages: `TELEGRAM_MODE=proxy`, `TELEGRAM_PROXY_URL`, `TURNSTILE_SITE_KEY`.

Публиковать через Wrangler из корня проекта, чтобы зависимый форматтер был включён в сборку. Не копировать один `index.js` в dashboard без импорта/бандла. Реальная конфигурация аккаунта не создана автоматически; её выполняет владелец.

Не отключайте Turnstile у публичного endpoint. Origin — не авторизация. Лимит в памяти isolate не глобальный; серверного хранения отчётов, строгой дедупликации и проверки решений нет.
