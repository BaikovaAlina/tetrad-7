import test from 'node:test';
import assert from 'node:assert/strict';
import { lessons, getLesson } from '../site/assets/js/curriculum.js';
import { getBank, getWork, getTask, bankSummary } from '../site/assets/js/bank.js';
import {
  checkAnswer,
  parseList,
  parseCoordinates,
  parseNumber,
} from '../site/assets/js/checker.js';
import {
  createSession,
  checkSessionAnswer,
  finishSession,
  makeReport,
} from '../site/assets/js/session.js';
const complex = lessons.filter((l) => l.challenge);

test('24 новые комплексные темы / 1152 варианта, старые ID и номера сохранены', () => {
  assert.equal(complex.length, 24);
  assert.equal(bankSummary.complexVariants, 1152);
  assert.equal(getLesson('a01').number, 1);
  assert.equal(getLesson('g01').number, 59);
  assert.equal(getLesson('s11').number, 104);
  assert.equal(getLesson('a59').number, 105);
  for (const l of complex) {
    assert.ok(l.tags.includes('комплексные'));
    assert.equal(getBank(l.id).length, 48);
    for (const q of getBank(l.id)) {
      assert.equal(q.challenge, true);
      assert.ok(q.solutionSteps.length >= 3, q.id);
      assert.ok(
        q.solutionSteps.every((s) => typeof s === 'string' && s.trim().length >= 8),
        q.id
      );
      assert.ok(q.skills.length >= 3);
      assert.ok(q.audit.kind);
      assert.equal(q.points, 1);
    }
  }
});

test('Эталоны 69 вычислительных форм и структурный контроль 3 составных доказательств', () => {
  const expected = {
    a59: ['4', '3', '-2'],
    a60: ['(x+2-3y)(x+2+3y)', '2(x+1)(x-2)(x+2)', '(x-2)(x-3)(x+3)'],
    a61: ['5; -3; 2', '1; -2; 2', '4; -1; 2'],
    a62: ['1; 2', '-2; 4', '2; 3'],
    a63: ['-3; 3', '2; 4', '2/3; 6'],
    a64: ['3; 2; 6', '-2; 2; 7/5', '2; 4; 7/4'],
    a65: ['2; 2; 5', '2; 2; 6', '2; 4; 9'],
    a66: ['(3; 2)', '(2; 1)', '(11/2; 5/2)'],
    a67: ['12/5; 204/5', '3/2; 15', '14/3; 56/3'],
    a68: ['5; 9; 3', '6; 36', '6; 4'],
    a69: ['700; -10', '600; 5', '900; 25'],
    a70: ['12; 8; 40/3', '5; 25; 50/3', '12; 18; 170/3'],
    a71: ['15; 5', '135; 9', '15; 105'],
    a72: ['12; 110; 10', '5; 40; 3', '7; 40; 11'],
    a73: ['9; 6; 54', '14; 4; 36', '9; 4; 36'],
    a74: ['3; 7; -4; 10', '5; 1; -5; 1', '4; -3; 1/2; 1'],
    g36: ['44; 68; 22; 90', '44; 68; 22; 90', '44; 68; 22; 90'],
    g37: ['122; 24; 34; 61', '122; 24; 34; 61', '122; 24; 34; 61'],
    g38: ['15; 18; 12', '39; 30; 36', '51; 48; 45'],
    g39: ['8; 8; 60; 30', '8; 8; 30; 60', '14; 7; 60; 30'],
    g40: ['44; 78; 58; 112', '44; 58; 39; 29', '44; 78; 58; 112'],
    g41: ['4; 6; 12', '6; 4; 14', '4; 2; 8'],
    g42: ['12; 48; 90', '10; 146; 73; 17', '30; 36; 108'],
  };
  for (const [id, answers] of Object.entries(expected))
    for (let b = 0; b < 3; b++)
      assert.equal(
        checkAnswer(getBank(id)[b], answers[b]).correct,
        true,
        `${id}/${b}: ${answers[b]}`
      );
  for (let b = 0; b < 3; b++) assert.ok(getBank('g43')[b].steps.length >= 5);
});

test('Комплексный список: порядок и полнота обязательны, частичного балла нет', () => {
  const q = getBank('a74')[0];
  assert.equal(checkAnswer(q, '3; 7').correct, false);
  assert.equal(checkAnswer(q, '7; 3; -4; 10').correct, false);
  assert.equal(checkAnswer(q, '3; 7; 10; -4').correct, false);
  assert.equal(checkAnswer(q, '6/2; 14/2; -8/2; 20/2').correct, true);
  const session = createSession('a74', 'classwork', 'complex-test', {
    name: 'Тест',
    className: '7',
  });
  for (const id of session.taskIds)
    assert.equal(checkSessionAnswer(session, getTask(id), getTask(id).answer).correct, true);
  finishSession(session);
  const report = makeReport(session);
  assert.equal(report.correct, 8);
  assert.equal(report.grade, 5);
  assert.ok(report.answers.every((t) => t.solutionSteps.length >= 3));
});

test('Сложные ответы: отклоняем неполную факторизацию и потерянные корни', () => {
  const factor = getBank('a60')[1];
  assert.equal(checkAnswer(factor, '2(x+1)(x^2-4)').correct, false);
  assert.equal(checkAnswer(factor, '2x^3+2x^2-8x-8').correct, false);
  const roots = getBank('a62')[2];
  assert.equal(checkAnswer(roots, '3').correct, false);
  assert.equal(checkAnswer(roots, '2; 2; 3').correct, false);
  assert.equal(checkAnswer(roots, '3; 2').correct, true);
  for (const q of getBank('g43')) {
    for (const a of q.alternatives || []) assert.equal(checkAnswer(q, a).correct, true);
    const seq = q.answer.split(';').reverse().join(';');
    assert.equal(checkAnswer(q, seq).correct, false);
  }
});

test('Для всех новых числовых списков заведомо неверное число не принимается', () => {
  for (const l of complex)
    for (const q of getBank(l.id)) {
      if (!['list', 'coordinates', 'number', 'fraction'].includes(q.type)) continue;
      const values =
        q.type === 'coordinates'
          ? parseCoordinates(q.answer)
          : q.type === 'list'
            ? parseList(q.answer)
            : [parseNumber(q.answer)];
      const wrong = values
        .map((r, i) => (i === 0 ? String(Number(r.n) / Number(r.d) + 999) : `${r.n}/${r.d}`))
        .join(';');
      assert.equal(checkAnswer(q, wrong).correct, false, q.id);
    }
});
