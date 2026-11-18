import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../site/assets/js/session.js';
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => memory.set(k, v),
  removeItem: (k) => memory.delete(k),
};
let sequence = 0;
const module = () => import('../site/assets/js/storage.js?test=' + ++sequence);
test('Имя, настройки и черновик переживают повторное чтение', async () => {
  memory.clear();
  const a = await module();
  a.saveProfile({ name: '  Саша  ', className: '7А' });
  a.savePreferences({ grading: { five: 90, four: 75, three: 60 } });
  const s = createSession('a11', 'classwork', '1', a.loadState().profile);
  s.answers[s.taskIds[0]] = { draft: '3/4', attempts: 0, manualComment: 'Текст' };
  a.saveSession(s);
  const b = await module();
  assert.equal(b.loadState().profile.name, 'Саша');
  assert.equal(b.findSession(s.id).answers[s.taskIds[0]].draft, '3/4');
  assert.equal(b.loadState().preferences.grading.five, 90);
  b.clearProgress();
  assert.equal(b.loadState().sessions.length, 0);
  assert.equal(b.loadState().profile.name, 'Саша');
  b.clearAll();
  assert.equal(b.loadState().profile.name, '');
});
test('Хранятся только 200 последних работ', async () => {
  memory.clear();
  const a = await module();
  for (let i = 0; i < 205; i++) {
    const s = createSession('g01', 'homework', String(i), { name: 'Ли' });
    a.saveSession(s);
  }
  assert.equal(a.loadState().sessions.length, 200);
  assert.equal((await module()).loadState().sessions.length, 200);
});
test('Повреждённые или несогласованные записи не ломают всё приложение', async () => {
  const s = createSession('g01', 'classwork', '1', { name: 'Ли' }),
    bad = [
      { ...s, id: '<img src=x>' },
      { ...s, lessonId: 'g99' },
      { ...s, taskIds: ['a01-01'] },
      { ...s, grading: null, elapsedSeconds: -50 },
    ];
  memory.set(
    'tetrad7:state:v1',
    JSON.stringify({ version: 1, profile: { name: 'Профиль' }, sessions: bad })
  );
  const a = await module();
  assert.equal(a.loadState().sessions.length, 1);
  assert.equal(a.loadState().sessions[0].elapsedSeconds, 0);
  assert.equal(a.loadState().sessions[0].grading.five, 85);
  assert.equal(a.loadState().profile.name, 'Профиль');
});
test('Если браузер блокирует хранилище, остаётся режим в памяти', async () => {
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('blocked');
    },
  });
  const a = await module();
  assert.equal(a.loadState().sessions.length, 0);
  a.saveProfile({ name: 'Саша' });
  assert.equal(a.loadState().profile.name, 'Саша');
  assert.equal(a.persistentStorage, false);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: previous,
  });
});
