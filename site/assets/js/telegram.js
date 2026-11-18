import { buildTelegramMessage } from './report-message.js';
export { buildTelegramMessage, escapeHtml } from './report-message.js';
export class TelegramError extends Error {
  constructor(message, { retryAfter = 0, uncertain = false } = {}) {
    super(message);
    this.name = 'TelegramError';
    this.retryAfter = retryAfter;
    this.uncertain = uncertain;
  }
}
export function getTelegramStatus(config = {}) {
  if (config.mode === 'direct') {
    if (!config.allowUnsafeDirect)
      return {
        available: false,
        mode: 'direct',
        label: 'Прямой режим заблокирован',
        error: 'Администратор должен явно принять риск публичного токена в GitHub Variables.',
      };
    if (
      !/^\d{5,20}:[A-Za-z0-9_-]{20,}$/.test(config.botToken || '') ||
      !/^(-\d{5,20}|\d{5,20})$/.test(String(config.chatId || ''))
    )
      return {
        available: false,
        mode: 'direct',
        label: 'Telegram не настроен',
        error:
          'В опубликованной конфигурации остались плейсхолдеры. Проверьте Secrets и повторите деплой.',
      };
    return {
      available: true,
      mode: 'direct',
      label: 'Прямой режим · токен публичен',
      warning:
        'Любой посетитель может извлечь токен и управлять ботом. Не используйте значимого бота.',
    };
  }
  if (config.mode === 'proxy') {
    try {
      const u = new URL(config.proxyUrl);
      if (u.protocol !== 'https:' || u.username || u.password) throw 0;
      return { available: true, mode: 'proxy', label: 'Через серверный прокси' };
    } catch {
      return {
        available: false,
        mode: 'proxy',
        label: 'Прокси не настроен',
        error: 'Укажите HTTPS-адрес Worker в переменной TELEGRAM_PROXY_URL и повторите деплой.',
      };
    }
  }
  return {
    available: false,
    mode: 'off',
    label: 'Telegram не подключён',
    error: 'Учитель ещё не подключил Telegram. Скачай отчёт и передай его учителю другим способом.',
  };
}
/** Всегда экранируем имя, ответ, условие и текст обоснования. HTML никогда не берём из ввода ученика. */
export function telegramErrorFor(code, retryAfter = 0) {
  if (code === 401)
    return new TelegramError(
      'Telegram отклонил токен. Учителю нужно обновить TELEGRAM_BOT_TOKEN в Secrets и повторить деплой.'
    );
  if (code === 400)
    return new TelegramError(
      'Telegram не нашёл чат или отклонил сообщение. Учителю нужно проверить chat_id и отправить боту /start.'
    );
  if (code === 403)
    return new TelegramError(
      'Бот заблокирован или не может писать в чат. Разблокируйте его и проверьте права в группе.'
    );
  if (code === 429)
    return new TelegramError(
      `Слишком много сообщений. Повтори не раньше чем через ${retryAfter || 60} с.`,
      { retryAfter: retryAfter || 60 }
    );
  return new TelegramError('Сервис отправки временно недоступен. Сохрани отчёт и попробуй позже.');
}
/** Никаких автоматических повторов: Telegram sendMessage не поддерживает ключ идемпотентности. */
export async function sendToTelegram(
  report,
  config,
  { fetchImpl = globalThis.fetch, turnstileToken = '' } = {}
) {
  const status = getTelegramStatus(config);
  if (!status.available) throw new TelegramError(status.error);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(Math.max(config.timeoutMs || 15000, 100), 30000)
  );
  try {
    let url, body, headers;
    if (config.mode === 'direct') {
      url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
      // URLSearchParams — простой CORS-запрос. no-cors намеренно НЕ используется:
      // opaque-ответ не позволяет доказать доставку и не считается успехом.
      body = new URLSearchParams({
        chat_id: String(config.chatId),
        text: buildTelegramMessage(report),
        parse_mode: 'HTML',
        disable_web_page_preview: 'true',
      });
      headers = { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' };
    } else {
      url = config.proxyUrl;
      body = JSON.stringify({ report, turnstileToken });
      headers = { 'Content-Type': 'application/json' };
    }
    const response = await fetchImpl(url, {
      method: 'POST',
      body,
      headers,
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new TelegramError('Сервис вернул непонятный ответ. Доставка не подтверждена.', {
        uncertain: true,
      });
    }
    if (!response.ok || data.ok !== true) {
      if (['challenge_required', 'challenge_failed'].includes(data.code))
        throw new TelegramError(
          'Пройди антиспам-проверку над кнопкой отправки. Если она не появляется, учителю нужно проверить TURNSTILE_SITE_KEY.'
        );
      if (data.code === 'not_configured')
        throw new TelegramError(
          'Прокси не настроен. Учителю нужно проверить серверные Secrets, Origin и ключ антиспама.'
        );
      if (data.code === 'forbidden_origin')
        throw new TelegramError(
          'Этот адрес сайта не разрешён в настройках Worker. Учителю нужно проверить ALLOWED_ORIGINS.'
        );
      if (data.code === 'invalid_report')
        throw new TelegramError(
          'Прокси отклонил формат отчёта. Скачай полный отчёт и передай учителю.'
        );
      if (data.uncertain)
        throw new TelegramError(
          'Прокси не получил подтверждение Telegram. Сообщение могло дойти: проверьте чат до ручного повтора.',
          { uncertain: true }
        );
      throw telegramErrorFor(
        data.error_code || response.status,
        data.parameters?.retry_after || data.retryAfter
      );
    }
    const messageId = config.mode === 'direct' ? data.result?.message_id : data.messageId;
    if (!Number.isInteger(messageId))
      throw new TelegramError(
        'Сервис не подтвердил номер сообщения. Не считаем отчёт отправленным.',
        { uncertain: true }
      );
    return { ok: true, messageId };
  } catch (error) {
    if (error instanceof TelegramError) throw error;
    if (error.name === 'AbortError')
      throw new TelegramError(
        'Время ожидания истекло. Сообщение могло дойти: сначала проверьте чат, чтобы не создать дубликат.',
        { uncertain: true }
      );
    // Не показываем URL/исходный текст исключения: в URL прямого режима есть токен.
    throw new TelegramError(
      'Нет подтверждения отправки. Проверь интернет и доступность Telegram. Если связь оборвалась, сначала проверь чат перед повтором.',
      { uncertain: true }
    );
  } finally {
    clearTimeout(timer);
  }
}
