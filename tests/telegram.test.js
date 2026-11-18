import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTelegramMessage,
  sendToTelegram,
  getTelegramStatus,
  TelegramError,
  escapeHtml,
} from '../site/assets/js/telegram.js';
import { createSession, finishSession, makeReport } from '../site/assets/js/session.js';
const fakeToken = ['123456', 'TEST_' + 'x'.repeat(35)].join(':');
const direct = {
  mode: 'direct',
  allowUnsafeDirect: true,
  botToken: fakeToken,
  chatId: '123456789',
  timeoutMs: 500,
};
const report = () =>
  makeReport(
    finishSession(createSession('g15', 'homework', '1', { name: 'Саша <b>&', className: '7А' }))
  );
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
test('Отключено по умолчанию; direct требует отдельного принятия риска', async () => {
  assert.equal(getTelegramStatus({}).available, false);
  assert.equal(getTelegramStatus({ mode: 'off' }).available, false);
  assert.equal(getTelegramStatus({ ...direct, allowUnsafeDirect: false }).available, false);
  assert.equal(
    getTelegramStatus({ ...direct, botToken: '__TELEGRAM_BOT_TOKEN__' }).available,
    false
  );
  assert.equal(
    getTelegramStatus({ mode: 'proxy', proxyUrl: 'http://example.com' }).available,
    false
  );
  assert.equal(
    getTelegramStatus({ mode: 'proxy', proxyUrl: 'https://example.com/report' }).available,
    true
  );
  let called = false;
  await assert.rejects(
    sendToTelegram(
      report(),
      { mode: 'off' },
      {
        fetchImpl: async () => {
          called = true;
        },
      }
    )
  );
  assert.equal(called, false);
});
test('HTML-экранирование, состав отчёта и лимит длины', () => {
  const r = report();
  r.answers[0].manualComment = '<script>alert("x")</script> &'.repeat(30);
  r.answers[0].studentAnswer = '<img src=x onerror=alert(1)>';
  const s = buildTelegramMessage(r);
  assert.ok(s.includes('Саша &lt;b&gt;&amp;'));
  assert.ok(!s.includes('<script>'));
  assert.ok(!s.includes('<img'));
  assert.ok(s.includes('&lt;'));
  assert.ok(s.length <= 4096);
  for (const label of [
    'Ученик',
    'Урок',
    'Результат',
    'Оценка',
    'Активное время',
    'Ошибки и пропуски',
    'не заверены сервером',
  ])
    assert.ok(s.includes(label), label);
  const massive = {
    ...r,
    lessonTitle: '<&'.repeat(1000),
    variant: '"'.repeat(200),
    answers: r.answers.map((a) => ({
      ...a,
      prompt: '&'.repeat(1000),
      studentAnswer: '<'.repeat(1000),
      expectedAnswer: '>'.repeat(1000),
      manualComment: '&'.repeat(1200),
    })),
  };
  assert.ok(buildTelegramMessage(massive).length <= 4096);
  assert.ok(!buildTelegramMessage({ test: true, student: r.student }).includes('Саша'));
  assert.equal(escapeHtml('<&>'), '&lt;&amp;&gt;');
});
test('Прямой fetch: URLSearchParams, фиксированный получатель, подтверждение message_id', async () => {
  let calls = 0;
  const result = await sendToTelegram(report(), direct, {
    fetchImpl: async (url, init) => {
      calls++;
      assert.equal(url, `https://api.telegram.org/bot${fakeToken}/sendMessage`);
      assert.equal(init.method, 'POST');
      assert.equal(init.credentials, 'omit');
      assert.ok(!('mode' in init));
      assert.ok(init.body instanceof URLSearchParams);
      assert.equal(init.body.get('chat_id'), direct.chatId);
      assert.equal(init.body.get('parse_mode'), 'HTML');
      return response({ ok: true, result: { message_id: 17 } });
    },
  });
  assert.deepEqual(result, { ok: true, messageId: 17 });
  assert.equal(calls, 1);
});
test('Режим proxy не отправляет Telegram-токен из браузера', async () => {
  const proxy = { mode: 'proxy', proxyUrl: 'https://example.com/report', botToken: fakeToken };
  await sendToTelegram(report(), proxy, {
    turnstileToken: 'public-test-challenge',
    fetchImpl: async (url, init) => {
      assert.equal(url, proxy.proxyUrl);
      assert.ok(!init.body.includes(fakeToken));
      const body = JSON.parse(init.body);
      assert.equal(body.turnstileToken, 'public-test-challenge');
      assert.ok(body.report);
      return response({ ok: true, messageId: 19 });
    },
  });
});
test('Ошибки 400/401/403/429, непрозрачный ответ и неопределённая доставка', async () => {
  for (const code of [400, 401, 403, 429]) {
    let calls = 0;
    await assert.rejects(
      sendToTelegram(report(), direct, {
        fetchImpl: async () => {
          calls++;
          return response({ ok: false, error_code: code, parameters: { retry_after: 13 } }, code);
        },
      }),
      (error) => error instanceof TelegramError && (code !== 429 || error.retryAfter === 13)
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    sendToTelegram(report(), direct, { fetchImpl: async () => response({ ok: true, result: {} }) }),
    (e) => e.uncertain === true
  );
  await assert.rejects(
    sendToTelegram(report(), direct, { fetchImpl: async () => new Response('not json') }),
    (e) => e.uncertain === true
  );
  await assert.rejects(
    sendToTelegram(report(), direct, {
      fetchImpl: async () => {
        throw new Error('secret-url-' + fakeToken);
      },
    }),
    (e) => e.uncertain === true && !e.message.includes(fakeToken)
  );
  await assert.rejects(
    sendToTelegram(
      report(),
      { mode: 'proxy', proxyUrl: 'https://example.com' },
      { fetchImpl: async () => response({ ok: false, uncertain: true }, 502) }
    ),
    (e) => e.uncertain === true
  );
});
test('Тайм-аут не приводит к автоматической повторной отправке', async () => {
  let calls = 0;
  await assert.rejects(
    sendToTelegram(
      report(),
      { ...direct, timeoutMs: 100 },
      {
        fetchImpl: async (_url, init) => {
          calls++;
          return new Promise((resolve, reject) =>
            init.signal.addEventListener(
              'abort',
              () => {
                const e = new Error('abort');
                e.name = 'AbortError';
                reject(e);
              },
              { once: true }
            )
          );
        },
      }
    ),
    (e) => e.uncertain === true
  );
  assert.equal(calls, 1);
});
