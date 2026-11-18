import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, validateReport } from '../worker/index.js';
import { createSession, finishSession, makeReport } from '../site/assets/js/session.js';
const fakeToken = ['123456', 'TEST_' + 'x'.repeat(35)].join(':');
const env = {
  TELEGRAM_BOT_TOKEN: fakeToken,
  TELEGRAM_CHAT_ID: '123456789',
  ALLOWED_ORIGINS: 'https://school.github.io',
  REQUIRE_TURNSTILE: 'false',
};
let requestIndex = 0;
function request(payload = { report: { test: true } }, extra = {}) {
  requestIndex++;
  return new Request('https://worker.example/report', {
    method: 'POST',
    headers: {
      Origin: 'https://school.github.io',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': 'test-' + requestIndex,
      ...extra.headers,
    },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'headers')),
  });
}
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const report = () =>
  makeReport(finishSession(createSession('g01', 'homework', '1', { name: 'Саша' })));
test('Worker фиксирует чат, фильтрует ответ Telegram и не отражает ключ', async () => {
  let calls = 0;
  const r = await handleRequest(
    request({ report: { test: true }, chat_id: 'attacker-chat', text: 'attacker-text' }),
    env,
    {
      fetchImpl: async (url, init) => {
        calls++;
        assert.equal(url, `https://api.telegram.org/bot${fakeToken}/sendMessage`);
        assert.equal(init.body.get('chat_id'), env.TELEGRAM_CHAT_ID);
        assert.ok(!init.body.get('text').includes('attacker'));
        return response({
          ok: true,
          result: { message_id: 12, chat: { private: 'not reflected' } },
        });
      },
    }
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://school.github.io');
  const body = await r.text();
  assert.ok(!body.includes(fakeToken));
  assert.ok(!body.includes('not reflected'));
  assert.deepEqual(JSON.parse(body), { ok: true, messageId: 12 });
  assert.equal(calls, 1);
});
test('Запрещённый Origin, метод, MIME и отсутствующие настройки не доходят до Telegram', async () => {
  const nofetch = async () => assert.fail('Сеть не должна вызываться');
  assert.equal(
    (
      await handleRequest(request({}, { headers: { Origin: 'https://attacker.example' } }), env, {
        fetchImpl: nofetch,
      })
    ).status,
    403
  );
  assert.equal(
    (
      await handleRequest(
        request({}, { headers: { Origin: 'https://school.github.io.attacker.example' } }),
        env,
        { fetchImpl: nofetch }
      )
    ).status,
    403
  );
  assert.equal(
    (
      await handleRequest(request({}, { headers: { 'Content-Type': 'text/plain' } }), env, {
        fetchImpl: nofetch,
      })
    ).status,
    415
  );
  assert.equal(
    (await handleRequest(request(), { ...env, TELEGRAM_BOT_TOKEN: '' }, { fetchImpl: nofetch }))
      .status,
    503
  );
  const get = new Request('https://worker.example/', {
    headers: { Origin: 'https://school.github.io' },
  });
  assert.equal((await handleRequest(get, env, { fetchImpl: nofetch })).status, 405);
  const options = new Request('https://worker.example/', {
    method: 'OPTIONS',
    headers: { Origin: 'https://school.github.io' },
  });
  assert.equal((await handleRequest(options, env, { fetchImpl: nofetch })).status, 204);
});
test('Валидация отчёта: числа пересчитываются, данные ограничены', () => {
  const r = report(),
    safe = validateReport({ ...r, grade: 5, percent: 100, chat_id: 'bad' });
  assert.equal(safe.grade, 2);
  assert.equal(safe.percent, 0);
  assert.ok(!('chat_id' in safe));
  assert.throws(() => validateReport({ ...r, correct: 8 }));
  assert.throws(() => validateReport({ ...r, total: 999 }));
  assert.throws(() => validateReport({ ...r, student: { name: 'x'.repeat(51) } }));
  assert.throws(() => validateReport({ ...r, id: '<img>' }));
  assert.throws(() =>
    validateReport({ ...r, answers: r.answers.map((a) => ({ ...a, correct: 'true' })) })
  );
  assert.throws(() => validateReport({ test: false }));
});
test('Некорректный JSON и payload более 64 КиБ отклоняются', async () => {
  assert.equal((await handleRequest(request('{bad json'), env)).status, 400);
  assert.equal((await handleRequest(request(' '.repeat(65537)), env)).status, 400);
  assert.equal(
    (
      await handleRequest(request({ report: report() }), env, {
        fetchImpl: async () => response({ ok: true, result: { message_id: 11 } }),
      })
    ).status,
    200
  );
});
test('Turnstile включён по умолчанию: секрет, токен, hostname и action обязательны', async () => {
  const e = { ...env, REQUIRE_TURNSTILE: 'true', TURNSTILE_SECRET_KEY: 'fake-server-key' };
  let calls = 0;
  const missing = await handleRequest(request(), e, {
    fetchImpl: async () => {
      calls++;
    },
  });
  assert.equal((await missing.json()).code, 'challenge_required');
  assert.equal(calls, 0);
  for (const result of [
    { success: false },
    { success: true, hostname: 'attacker.example', action: 'homework' },
    { success: true, hostname: 'school.github.io', action: 'other' },
  ]) {
    const r = await handleRequest(
      request({ report: { test: true }, turnstileToken: 'fake-challenge-token' }),
      e,
      { fetchImpl: async () => response(result) }
    );
    assert.equal((await r.json()).code, 'challenge_failed');
  }
  let phase = 0;
  const ok = await handleRequest(
    request({ report: { test: true }, turnstileToken: 'fake-challenge-token' }),
    e,
    {
      fetchImpl: async (url, init) => {
        phase++;
        if (phase === 1) {
          assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
          assert.equal(init.body.get('secret'), e.TURNSTILE_SECRET_KEY);
          return response({ success: true, hostname: 'school.github.io', action: 'homework' });
        }
        return response({ ok: true, result: { message_id: 42 } });
      },
    }
  );
  assert.equal(ok.status, 200);
  assert.equal(phase, 2);
});
test('В памяти isolate есть best-effort ограничение запросов', async () => {
  const headers = { 'CF-Connecting-IP': 'rate-test-user' },
    e = { ...env, MAX_REQUESTS_PER_MINUTE: '1' },
    now = 1800000000000;
  const fetchImpl = async () => response({ ok: true, result: { message_id: 1 } });
  assert.equal(
    (await handleRequest(request(undefined, { headers }), e, { fetchImpl, now })).status,
    200
  );
  const limited = await handleRequest(request(undefined, { headers }), e, { fetchImpl, now });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  assert.equal(
    (await handleRequest(request(undefined, { headers }), e, { fetchImpl, now: now + 60000 }))
      .status,
    200
  );
});
test('Сетевой сбой и недействительный ответ помечаются как неопределённая доставка', async () => {
  for (const fetchImpl of [
    async () => {
      throw new Error('url=' + fakeToken);
    },
    async () => new Response('bad'),
    async () => response({ ok: true, result: {} }),
  ]) {
    const r = await handleRequest(request(), env, { fetchImpl });
    const text = await r.text();
    assert.equal(r.status, 502);
    assert.equal(JSON.parse(text).uncertain, true);
    assert.ok(!text.includes(fakeToken));
  }
});
