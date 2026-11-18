import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMath,
  parseNumber,
  formatRational,
  compareExpressions,
  checkAnswer,
  parseList,
  parseCoordinates,
} from '../site/assets/js/checker.js';
const num = (x) => formatRational(parseNumber(x));
const task = (type, answer, validation = {}) => ({ type, answer, validation });
test('Точная арифметика: дроби, запятая, смешанные числа, Unicode и порядок действий', () => {
  const cases = [
    ['0,1 + 0,2', '3/10'],
    ['−2 1/3', '-7/3'],
    ['1½', '3/2'],
    ['−1 ¾', '-7/4'],
    ['2 2/4', '5/2'],
    ['(3/4) : (1/2)', '3/2'],
    ['−3²', '-9'],
    ['(−3)²', '9'],
    ['2³ + 1', '9'],
    ['3 × 4 − 7', '5'],
    ['.125', '1/8'],
    ['x = 2/6', '1/3'],
    ['2^-3', '1/8'],
    ['9'.repeat(29) + '/3', '3'.repeat(29)],
  ];
  for (const [input, expected] of cases) assert.equal(num(input), expected, input);
  assert.equal(normalizeMath('2х² − 3×у'), '2x^2 - 3*y');
});
test('Числовые ответы, единицы и альтернативы', () => {
  for (const input of ['0,75', '6/8', '3/4', '1/2+1/4'])
    assert.equal(checkAnswer(task('fraction', '3/4'), input).correct, true, input);
  assert.equal(checkAnswer(task('fraction', '1/3'), '0,333').correct, false);
  assert.equal(
    checkAnswer(task('number', '36', { units: ['°', 'градусов'] }), '36°').correct,
    true
  );
  assert.equal(checkAnswer(task('number', '5', { units: ['см'] }), '5 см').correct, true);
  assert.equal(
    checkAnswer(
      { ...task('text', 'биссектриса'), alternatives: ['на биссектрисе угла'] },
      'На биссектрисе угла!'
    ).correct,
    true
  );
  assert.equal(checkAnswer(task('number', '1'), '1/0').format, false);
  assert.equal(checkAnswer(task('number', '1'), '').format, false);
  assert.equal(checkAnswer(task('number', '1'), '2').format, true);
});
test('Алгебра проверяется точно, без случайных подстановок', () => {
  for (const input of ['x*x+2*x+1', '1 + 2x + x²', '(x+1)^2', 'х²+2х+1'])
    assert.equal(compareExpressions(input, 'x^2+2x+1').correct, true, input);
  assert.equal(compareExpressions('(a+b)(a-b)', 'a²-b²').correct, true);
  assert.equal(compareExpressions('x^50+1', 'x^50').correct, false);
  assert.equal(compareExpressions('x+1/100000000000000000000', 'x').correct, false);
});
test('ОДЗ: не разрешаем новые запрещённые точки; учитываем несколько переменных', () => {
  assert.equal(compareExpressions('(x²-4)/(x-2)', 'x+2').correct, false);
  assert.equal(
    compareExpressions('(x²-4)/(x-2)', 'x+2', { domainExcluded: [{ value: 2 }] }).correct,
    true
  );
  assert.equal(
    compareExpressions('x(x-2)/(x-2)', 'x', { domainExcluded: [{ value: 3 }] }).correct,
    false
  );
  assert.equal(
    compareExpressions('(x²-1)/(x-1)', 'x+1', { domainExcluded: [{ value: 1 }] }).correct,
    true
  );
  assert.equal(
    compareExpressions('(ab)/(ab)', '1', {
      domainExcluded: [
        { variable: 'a', value: 0 },
        { variable: 'b', value: 0 },
      ],
    }).correct,
    true
  );
  assert.equal(
    compareExpressions('(a+b)/(a+b)', '1', {
      domainExcluded: [
        { variable: 'a', value: 0 },
        { variable: 'b', value: 0 },
      ],
    }).correct,
    false
  );
  assert.equal(compareExpressions('x^0', '1').correct, false);
  assert.equal(compareExpressions('x^0', '1', { domainExcluded: [{ value: 0 }] }).correct, true);
});
test('Форма ответа: скобки, подобные, сокращение, линейные множители и квадрат скобки', () => {
  const expanded = { form: 'expanded' };
  assert.equal(compareExpressions('2(x+3)', '2x+6', expanded).correct, false);
  assert.equal(compareExpressions('(x+1)²', 'x²+2x+1', expanded).correct, false);
  assert.equal(compareExpressions('x+x', '2x', expanded).correct, false);
  assert.equal(compareExpressions('2x+6', '2x+6', expanded).correct, true);
  assert.equal(
    compareExpressions('(x²-4)/(x-2)', 'x+2', { ...expanded, domainExcluded: [{ value: 2 }] })
      .correct,
    false
  );
  const f = { form: 'factorized', minFactors: 2, minNonconstant: 2 };
  assert.equal(compareExpressions('x²-4', '(x-2)(x+2)', f).correct, false);
  assert.equal(compareExpressions('(x+2)(x-2)', 'x²-4', f).correct, true);
  assert.equal(compareExpressions('(x-2)^2', 'x²-4x+4', f).correct, true);
  assert.equal(
    compareExpressions('2(x²-4)', '2x²-8', { ...f, linearFactors: true }).correct,
    false
  );
  assert.equal(
    compareExpressions('2(x-2)(x+2)', '2x²-8', { ...f, linearFactors: true }).correct,
    true
  );
});
test('Координаты и списки: запятые в дробях, скобки и порядок', () => {
  assert.equal(checkAnswer(task('coordinates', '(3/2; -2)'), 'x = 1,5; y = −2').correct, true);
  assert.equal(checkAnswer(task('coordinates', '(2; 3)'), '(3; 2)').correct, false);
  assert.equal(checkAnswer(task('list', '-2; 3'), '{3; −2}').correct, true);
  assert.equal(checkAnswer(task('list', '-2; 3'), '(-2); (3)').correct, true);
  assert.equal(checkAnswer(task('list', '1; 2; 2'), '1; 2').correct, false);
  assert.equal(checkAnswer(task('list', '1; 2', { ordered: true }), '2; 1').correct, false);
  assert.equal(checkAnswer(task('sequence', '1; 2; 3'), '3; 2; 1').correct, false);
  assert.throws(() => parseCoordinates('1;2;3'));
  assert.throws(() => parseList('1;;2'));
});
test('Выбор должен существовать в вариантах; последовательность может иметь альтернативу', () => {
  const q = {
    type: 'choice',
    answer: '1',
    options: [
      { value: '1', label: 'Да' },
      { value: '2', label: 'Нет' },
    ],
  };
  assert.equal(checkAnswer(q, '1').correct, true);
  assert.equal(checkAnswer(q, '2').correct, false);
  assert.equal(checkAnswer(q, '3').format, false);
  assert.equal(
    checkAnswer({ type: 'sequence', answer: '1; 2; 3', alternatives: ['2; 1; 3'] }, '2; 1; 3')
      .correct,
    true
  );
});
test('Некорректные и чрезмерные выражения не исполняются', () => {
  globalThis.__checkerExecuted = false;
  for (const input of [
    'globalThis.__checkerExecuted=true',
    '<script>alert(1)</script>',
    '1/0',
    '(1+2',
    '2**3',
    'x^9999999',
    '('.repeat(60) + '1' + ')'.repeat(60),
    '1'.repeat(321),
  ]) {
    assert.equal(checkAnswer(task('expression', '1'), input).format, false, input);
  }
  assert.equal(globalThis.__checkerExecuted, false);
  delete globalThis.__checkerExecuted;
});
