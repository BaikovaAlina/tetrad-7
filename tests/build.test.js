import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url),
  source = new URL('../site/config.js', import.meta.url);
const baseEnv = {
  ...process.env,
  TELEGRAM_MODE: 'off',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHAT_ID: '',
  TELEGRAM_PROXY_URL: '',
  TURNSTILE_SITE_KEY: '',
  ALLOW_UNSAFE_DIRECT: 'false',
};
const run = (dest, patch = {}) =>
  spawnSync('python3', ['scripts/build.py', '--output', dest], {
    cwd: root,
    env: { ...baseEnv, ...patch },
    encoding: 'utf8',
  });
const config = async (folder) => {
  const context = { window: {} };
  vm.runInNewContext(await readFile(path.join(folder, 'config.js'), 'utf8'), context);
  return context.window.TRAINER_CONFIG;
};
test('Сборка off: шаблоны сохранены; direct без явного разрешения останавливается', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tetrad-build-'));
  try {
    const target = path.join(dir, 'public');
    assert.equal(run(target).status, 0);
    assert.equal((await config(target)).telegram.mode, 'off');
    assert.equal((await config(target)).telegram.botToken, '__TELEGRAM_BOT_TOKEN__');
    assert.equal(run(target, { TELEGRAM_MODE: 'direct' }).status, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('Подстановка Secrets только в копию, без печати значения и без изменения источника', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tetrad-build-')),
    before = await readFile(source, 'utf8'),
    fakeToken = ['123456', 'TEST_' + 'x'.repeat(35)].join(':');
  try {
    const target = path.join(dir, 'public'),
      r = run(target, {
        TELEGRAM_MODE: 'direct',
        ALLOW_UNSAFE_DIRECT: 'true',
        TELEGRAM_BOT_TOKEN: fakeToken,
        TELEGRAM_CHAT_ID: '123456789',
      });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!(r.stdout + r.stderr).includes(fakeToken));
    assert.equal((await config(target)).telegram.botToken, fakeToken);
    assert.equal((await config(target)).telegram.allowUnsafeDirect, true);
    assert.equal(await readFile(source, 'utf8'), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('Режим proxy: только публичные параметры; недопустимые настройки не публикуются', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tetrad-build-'));
  try {
    const target = path.join(dir, 'public'),
      patch = {
        TELEGRAM_MODE: 'proxy',
        TELEGRAM_PROXY_URL: 'https://worker.example/report',
        TURNSTILE_SITE_KEY: '0x' + 'A'.repeat(20),
      };
    const r = run(target, patch);
    assert.equal(r.status, 0, r.stderr);
    const c = await config(target);
    assert.equal(c.telegram.proxyUrl, patch.TELEGRAM_PROXY_URL);
    assert.equal(c.telegram.botToken, '__TELEGRAM_BOT_TOKEN__');
    assert.equal(c.telegram.turnstileSiteKey, patch.TURNSTILE_SITE_KEY);
    assert.equal(run(target, { TELEGRAM_MODE: 'unknown' }).status, 1);
    assert.equal(
      run(target, { TELEGRAM_MODE: 'proxy', TELEGRAM_PROXY_URL: 'http://worker.example' }).status,
      1
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
