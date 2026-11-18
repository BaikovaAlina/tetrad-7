import { buildTelegramMessage } from '../site/assets/js/report-message.js';
/** Cloudflare Worker. Ключ и единственный получатель берутся ТОЛЬКО из env.
 * Origin — не аутентификация. Баллы присланы браузером, а не проверены сервером.
 * Ограничение по IP в памяти — best effort, не глобальный счётчик и не SLA.
 */
const MAX_BODY = 65536,
  MAX_PER_MINUTE = 30;
const buckets = new Map();
const TYPES = new Set([
  'number',
  'fraction',
  'expression',
  'coordinates',
  'list',
  'choice',
  'sequence',
  'text',
]);
class InvalidReport extends Error {}
function str(value, max, { optional = false } = {}) {
  if (optional && value == null) return '';
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim()))
    throw new InvalidReport();
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
}
function integer(value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new InvalidReport();
  return value;
}
function bool(value) {
  if (typeof value !== 'boolean') throw new InvalidReport();
  return value;
}
export function validateReport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InvalidReport();
  if (raw.test === true) return { test: true };
  const id = str(raw.id, 80),
    lessonId = str(raw.lessonId, 8);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id) || !/^[ags]\d{2}$/.test(lessonId))
    throw new InvalidReport();
  const work = str(raw.work, 16),
    titles = {
      classwork: 'Классная работа',
      homework: 'Домашнее задание',
      practice: 'Свободная практика',
    };
  if (!Object.hasOwn(titles, work)) throw new InvalidReport();
  const total = integer(raw.total, 1, 12),
    g = raw.grading;
  if (
    !g ||
    ![g.five, g.four, g.three].every((x) => Number.isFinite(x) && x > 0 && x <= 100) ||
    !(g.five > g.four && g.four > g.three)
  )
    throw new InvalidReport();
  if (!Array.isArray(raw.answers) || raw.answers.length !== total) throw new InvalidReport();
  const answers = raw.answers.map((a) => {
    if (!a || !TYPES.has(a.type)) throw new InvalidReport();
    const taskId = str(a.taskId, 12);
    if (!new RegExp(`^${lessonId}-\\d{2}$`).test(taskId)) throw new InvalidReport();
    const correct = bool(a.correct),
      unanswered = bool(a.unanswered);
    if (correct && unanswered) throw new InvalidReport();
    return {
      taskId,
      type: a.type,
      prompt: str(a.prompt, 1500),
      studentAnswer: str(a.studentAnswer, 400),
      expectedAnswer: str(a.expectedAnswer, 400),
      correct,
      unanswered,
      corrected: bool(a.corrected),
      manualComment: str(a.manualComment, 1200, { optional: true }),
    };
  });
  if (new Set(answers.map((a) => a.taskId)).size !== total) throw new InvalidReport();
  // Проверяем только внутреннюю согласованность, не математическое решение.
  const correct = answers.filter((a) => a.correct).length,
    unanswered = answers.filter((a) => a.unanswered).length,
    wrong = total - correct - unanswered,
    percent = (100 * correct) / total;
  if (raw.correct !== correct || raw.wrong !== wrong || raw.unanswered !== unanswered)
    throw new InvalidReport();
  const grade = percent >= g.five ? 5 : percent >= g.four ? 4 : percent >= g.three ? 3 : 2;
  const finishedAt = str(raw.finishedAt, 40);
  if (!Number.isFinite(Date.parse(finishedAt))) throw new InvalidReport();
  return {
    id,
    lessonId,
    lessonTitle: str(raw.lessonTitle, 140),
    work,
    workTitle: titles[work],
    variant: str(raw.variant, 30),
    total,
    correct,
    wrong,
    unanswered,
    percent,
    grade,
    student: {
      name: str(raw.student?.name, 50),
      className: str(raw.student?.className, 12, { optional: true }),
    },
    finishedAt,
    durationSeconds: integer(raw.durationSeconds, 0, 2592000),
    hintsUsed: integer(raw.hintsUsed, 0, total),
    grading: { five: g.five, four: g.four, three: g.three },
    answers,
  };
}
function allowOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  try {
    const u = new URL(origin);
    return u.origin === origin && u.protocol === 'https:' ? origin : null;
  } catch {
    return null;
  }
}
function cors(origin) {
  return origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' };
}
function reply(origin, status, data, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors(origin),
      'Content-Type': 'application/json;charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}
function rateLimited(ip, limit, now) {
  const minute = Math.floor(now / 60000),
    key = ip || 'unknown';
  if (buckets.size > 2000) {
    for (const [k, b] of buckets) if (b.minute !== minute) buckets.delete(k);
    if (buckets.size > 2000) buckets.clear();
  }
  const b = buckets.get(key);
  if (!b || b.minute !== minute) {
    buckets.set(key, { minute, count: 1 });
    return false;
  }
  b.count++;
  return b.count > limit;
}
async function jsonWithLimit(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new InvalidReport();
  if (!request.body) throw new InvalidReport();
  const reader = request.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw new InvalidReport();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(merged));
  } catch {
    throw new InvalidReport();
  }
}
async function fetchTimed(fetchImpl, url, init, ms = 10000) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
export async function handleRequest(
  request,
  env,
  { fetchImpl = globalThis.fetch, now = Date.now() } = {}
) {
  const origin = allowOrigin(request, env);
  if (!origin) return reply(null, 403, { ok: false, code: 'forbidden_origin' });
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== 'POST')
    return reply(
      origin,
      405,
      { ok: false, code: 'method_not_allowed' },
      { Allow: 'POST, OPTIONS' }
    );
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('Content-Type') || ''))
    return reply(origin, 415, { ok: false, code: 'invalid_report' });
  const token = String(env.TELEGRAM_BOT_TOKEN || ''),
    chatId = String(env.TELEGRAM_CHAT_ID || '');
  const useChallenge = env.REQUIRE_TURNSTILE !== 'false';
  if (
    !/^\d{5,20}:[A-Za-z0-9_-]{20,150}$/.test(token) ||
    !/^\-?\d{5,20}$/.test(chatId) ||
    (useChallenge && !env.TURNSTILE_SECRET_KEY)
  )
    return reply(origin, 503, { ok: false, code: 'not_configured' });
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = Math.min(100, Math.max(1, Number(env.MAX_REQUESTS_PER_MINUTE) || MAX_PER_MINUTE));
  if (rateLimited(ip, limit, now))
    return reply(
      origin,
      429,
      { ok: false, error_code: 429, retryAfter: 60 },
      { 'Retry-After': '60' }
    );
  let payload, report;
  try {
    payload = await jsonWithLimit(request);
    report = validateReport(payload.report);
  } catch {
    return reply(origin, 400, { ok: false, code: 'invalid_report' });
  }
  if (useChallenge) {
    if (
      typeof payload.turnstileToken !== 'string' ||
      payload.turnstileToken.length < 10 ||
      payload.turnstileToken.length > 2048
    )
      return reply(origin, 400, { ok: false, code: 'challenge_required' });
    try {
      const body = new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: payload.turnstileToken,
      });
      if (ip !== 'unknown') body.set('remoteip', ip);
      const response = await fetchTimed(
        fetchImpl,
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        { method: 'POST', body },
        8000
      );
      const result = await response.json();
      if (
        !response.ok ||
        result.success !== true ||
        result.hostname !== new URL(origin).hostname ||
        result.action !== 'homework'
      )
        return reply(origin, 400, { ok: false, code: 'challenge_failed' });
    } catch {
      return reply(origin, 503, { ok: false, code: 'challenge_failed' });
    }
  }
  try {
    const body = new URLSearchParams({
      chat_id: chatId,
      text: buildTelegramMessage(report),
      parse_mode: 'HTML',
      disable_web_page_preview: 'true',
    });
    const response = await fetchTimed(
      fetchImpl,
      `https://api.telegram.org/bot${token}/sendMessage`,
      { method: 'POST', body }
    );
    let result;
    try {
      result = await response.json();
    } catch {
      return reply(origin, 502, { ok: false, uncertain: true });
    }
    if (!response.ok || result.ok !== true) {
      const code = Number(result.error_code) || response.status;
      return reply(origin, code === 429 ? 429 : 502, {
        ok: false,
        error_code: code,
        parameters: {
          retry_after: Math.min(3600, Math.max(0, Number(result.parameters?.retry_after) || 0)),
        },
      });
    }
    if (!Number.isInteger(result.result?.message_id))
      return reply(origin, 502, { ok: false, uncertain: true });
    return reply(origin, 200, { ok: true, messageId: result.result.message_id });
  } catch {
    // Не возвращаем текст исключения, URL, токен и исходный Telegram JSON.
    return reply(origin, 502, { ok: false, uncertain: true });
  }
}
export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
