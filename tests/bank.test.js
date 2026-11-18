import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  lessons,
  modules,
  getLesson,
  getModule,
  workPath,
  subjects,
} from '../site/assets/js/curriculum.js';
import { getBank, getWork, getTask, bankSummary } from '../site/assets/js/bank.js';
import {
  checkAnswer,
  parseNumber,
  formatRational,
  displayAnswer,
} from '../site/assets/js/checker.js';
import { renderDiagram } from '../site/assets/js/diagrams.js';
test('128 уроков: полная связность методической карты и памятка к каждой теме', () => {
  assert.equal(lessons.length, 128);
  assert.equal(modules.length, 18);
  assert.equal(bankSummary.variants, 6144);
  const shell = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.ok(shell.includes(`${lessons.length} тем`));
  assert.ok(shell.includes(String(bankSummary.variants)));

  assert.equal(new Set(lessons.map((l) => l.id)).size, lessons.length);
  for (const l of lessons) {
    assert.ok(getModule(l.module));
    assert.ok(subjects[l.subject]);
    assert.ok(l.umk.length);
    assert.ok(l.theory.formula);
    assert.ok(l.theory.rules.length >= 3);
    assert.ok(l.theory.example);
    assert.ok(l.theory.pitfall);
  }
  assert.equal(getLesson('a24').level, 'core');
  assert.equal(getLesson('g25').level, 'core');
  assert.equal(getLesson('a45').level, 'extension');
  assert.equal(getLesson('s10').level, 'advanced');
  assert.equal(workPath('g01', 'homework', '5'), '#/train/g01?work=homework&variant=5');
});
test('Все 6144 канонических ответа и объявленные альтернативы проходят проверку', () => {
  const types = new Set();
  let count = 0;
  for (const l of lessons) {
    const bank = getBank(l.id);
    assert.equal(bank.length, 48);
    const signatures = new Set();
    for (const q of bank) {
      count++;
      types.add(q.type);
      assert.equal(getTask(q.id), q);
      assert.ok(q.prompt);
      assert.ok(q.explanation);
      assert.ok(q.hint);
      assert.ok(displayAnswer(q));
      for (const answer of [q.answer, ...(q.alternatives || [])])
        assert.equal(checkAnswer(q, answer).correct, true, `${q.id}: ${answer}`);
      assert.ok(!/undefined|NaN|<script/i.test(q.prompt), q.id);
      if (q.type === 'choice') {
        assert.equal(q.options.length, 4);
        assert.equal(new Set(q.options.map((o) => o.label)).size, 4);
        assert.equal(q.options.filter((o) => checkAnswer(q, o.value).correct).length, 1);
      }
      if (q.type === 'sequence') {
        assert.equal(new Set(q.answer.split(';').map((s) => s.trim())).size, q.steps.length);
      }
      const signature = JSON.stringify([
        q.prompt,
        q.options?.map((o) => o.label),
        q.steps,
        q.table,
        q.diagram,
      ]);
      signatures.add(signature);
      if (q.diagram) {
        const svg = renderDiagram(q.diagram);
        assert.match(svg, /<svg/);
        assert.ok(!/NaN|undefined|<script|https?:\/\//.test(svg), q.id);
      }
    }
    assert.equal(signatures.size, 48, `Не 48 разных полных заданий в ${l.id}`);
  }
  assert.equal(count, 6144);
  assert.equal(types.size, 8);
});
test('КР и ДЗ детерминированы и не пересекаются внутри каждого варианта', () => {
  for (const l of lessons)
    for (const variant of ['1', '2', 'teacher-17', '999999']) {
      const a = getWork(l.id, 'classwork', variant),
        b = getWork(l.id, 'homework', variant),
        p = getWork(l.id, 'practice', variant);
      assert.equal(a.length, 8);
      assert.equal(b.length, 8);
      assert.equal(p.length, 12);
      assert.deepEqual(
        a.map((q) => q.id),
        getWork(l.id, 'classwork', variant).map((q) => q.id)
      );
      assert.equal(new Set([...a, ...b].map((q) => q.id)).size, 16);
    }
  assert.throws(() => getWork('g01', 'exam'));
  assert.throws(() => getBank('unknown'));
  assert.equal(getTask('x<script>'), undefined);
});
test('Независимые математические эталоны для трёх форм ключевых уроков', () => {
  const fixtures = {
    a01: ['-2', '4', '1'],
    a02: ['1/3', '1/3', '1/10'],
    a03: ['30', '500', '40'],
    a04: ['70', '3', '9/2'],
    a05: ['9', '1', '2; 3; 5'],
    a06: ['-8', '18', '8'],
    a11: ['2', '-2', '7/4'],
    a13: ['8', '7', '12'],
    a14: ['3', '37', '3'],
    a15: ['3', '17', '60'],
    a16: ['0; 4', '1; -5', '1'],
    a17: ['3; 9', '2', '4; 5'],
    a18: ['7', '3; 4; 5; 6', '2'],
    a19: ['(-2; 5)', '(7; 0)', '(0; -3)'],
    a21: ['-4', '4', '-2'],
    a26: ['4', '-4', '2000'],
    a29: ['5', '-4', '6a^3*b'],
    a32: ['2', '6x', '5'],
    a36: ['x+3', '2x^2-4x', '4'],
    a47: ['(2; 5)', '(4; 2)', '(2; 2)'],
    a48: ['(2; 3)', '(2; 2)', '(2; 4)'],
    a50: ['(2; 3)', '(6; 2)', '(7; 3)'],
    a52: ['6', '24', '1'],
    a53: ['0', '4', '3'],
    a55: ['(2; 1)', '1', '1; 3; 5'],
    a56: ['2', '-2', '3'],
    a58: ['3', '0', '3'],
    g01: ['10', '5', '11'],
    g02: ['27', '59', '1'],
    g03: ['83', '21', '60'],
    g05: ['16', '16', '18'],
    g11: ['73', '106', '9'],
    g12: ['22', '14', '90'],
    g15: ['106', '36', '66'],
    g16: ['75', '74', '58'],
    g17: ['4; 5; 6', '1', '9'],
    g19: ['68', '30', '1'],
    g20: ['7', '10', '30'],
    g21: ['8', '14', '9'],
    g24: ['12', '9', '5'],
    g25: ['2', '90', '0'],
    g33: ['10', '1', '1'],
    g34: ['360', '90', '4'],
    s01: ['32', '4', '144'],
    s02: ['5', '11', '6'],
    s03: ['6', '6', '9'],
    s04: ['2/5', '60', '1'],
    s05: ['1/3', '1/2', '0'],
    s06: ['8', '5', '10'],
    s07: ['1', '1', '6'],
    s08: ['8', '30', '12'],
    s09: ['8', '7/2; 15/2', '88/3'],
    s11: ['3', '5/12', '9'],
  };
  for (const [id, expected] of Object.entries(fixtures))
    for (let b = 0; b < 3; b++)
      assert.equal(checkAnswer(getBank(id)[b], expected[b]).correct, true, `${id} форма ${b}`);
});
test('Независимые инварианты геометрии, делимости и статистики для всех параметров', () => {
  const value = (q) => {
    const r = parseNumber(q.answer);
    return Number(r.n) / Number(r.d);
  };
  for (let v = 0; v < 16; v++) {
    const n = v + 2,
      i = 3 * v;
    assert.equal(value(getBank('g15')[i]) + (n + 30) + (n + 40), 180);
    assert.equal(value(getBank('g11')[i]) * 2 + (2 * n + 30), 180);
    assert.equal(value(getBank('g19')[i]) + (n + 20), 90);
    assert.equal(value(getBank('g20')[i]) * 2, 2 * n + 10);
    assert.equal(value(getBank('g21')[i]) * 2, 2 * n + 12);
    for (const q of [getBank('g17')[i]])
      for (const a of q.answer.split(';').map(Number)) {
        assert.ok(a > 3);
        assert.ok(a < 2 * n + 3);
      }
    const simple = getBank('a05')[i + 2].answer.split(';').map(Number),
      original = 12 * (n + 3);
    for (const p of simple) {
      assert.equal(original % p, 0);
      for (let d = 2; d * d <= p; d++) assert.notEqual(p % d, 0);
    }
    assert.equal(value(getBank('s02')[i]), [n, n + 3, n + 6].reduce((a, b) => a + b) / 3);
    const data = [n + 7, n + 1, n + 4, n + 9, n + 2].sort((a, b) => a - b);
    assert.equal(value(getBank('s03')[i]), data[2]);
    assert.equal(value(getBank('s06')[i]) * 2, 4 * n + 8);
    assert.equal(value(getBank('s08')[i + 2]), (n + 2) * (n + 1));
    const graphOdd = n + 4 + ((n + 4) % 2);
    assert.equal(graphOdd % 2, 0);
    assert.equal(value(getBank('s07')[i + 2]), graphOdd);
  }
});
