/** Без eval/Function и без случайного тестирования выражений.
 * Числа хранятся как точные рациональные BigInt; выражения — как дроби многочленов.
 * Поддерживаемая грамматика: + − * / ^, скобки, переменные a…z, неявное умножение.
 * Функции, тригонометрия, корни и произвольный программный код не исполняются.
 */
const MAX_INPUT = 320,
  MAX_TERMS = 256,
  MAX_DEGREE = 80;
const abs = (n) => (n < 0n ? -n : n);
function gcd(a, b) {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}
export function rational(n, d = 1n) {
  n = BigInt(n);
  d = BigInt(d);
  if (!d) throw new Error('Делить на ноль нельзя.');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
const Z = rational(0),
  O = rational(1);
const addR = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
const negR = (a) => ({ n: -a.n, d: a.d });
const subR = (a, b) => addR(a, negR(b));
const mulR = (a, b) => rational(a.n * b.n, a.d * b.d);
const divR = (a, b) => rational(a.n * b.d, a.d * b.n);
const sameR = (a, b) => a.n === b.n && a.d === b.d;
export const formatRational = (a) => (a.d === 1n ? String(a.n) : `${a.n}/${a.d}`);
const cyrillic = {
  а: 'a',
  А: 'a',
  в: 'b',
  В: 'b',
  с: 'c',
  С: 'c',
  е: 'e',
  Е: 'e',
  к: 'k',
  К: 'k',
  м: 'm',
  М: 'm',
  н: 'n',
  Н: 'n',
  о: 'o',
  О: 'o',
  р: 'p',
  Р: 'p',
  т: 't',
  Т: 't',
  х: 'x',
  Х: 'x',
  у: 'y',
  У: 'y',
};
export function normalizeMath(value) {
  let s = String(value ?? '')
    .normalize('NFKC')
    .trim();
  // NFKC превращает верхние индексы в обычные цифры, поэтому обрабатываем их до него.
  const raw = String(value ?? '').trim();
  s = raw
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (x) => '^' + [...x].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join(''))
    .replace(/½/g, '(1/2)')
    .replace(/⅓/g, '(1/3)')
    .replace(/⅔/g, '(2/3)')
    .replace(/¼/g, '(1/4)')
    .replace(/¾/g, '(3/4)')
    .normalize('NFKC')
    .replace(/[−–—﹣]/g, '-')
    .replace(/[×·⋅∙]/g, '*')
    .replace(/[÷:]/g, '/')
    .replace(/[аАвВсСеЕкКмМнНоОрРтТхХуУ]/g, (c) => cyrillic[c])
    .replace(/(\d),(?=\d)/g, '$1.')
    .replace(/[\u00a0\u202f]/g, ' ')
    .toLowerCase();
  if (s.length > MAX_INPUT)
    throw new Error(`Ответ слишком длинный: максимум ${MAX_INPUT} символов.`);
  return s;
}
const exponentCache = new Map();
function exponents(key) {
  if (!exponentCache.has(key))
    exponentCache.set(
      key,
      key
        ? Object.fromEntries(
            key.split(';').map((x) => {
              const [v, n] = x.split(':');
              return [v, Number(n)];
            })
          )
        : {}
    );
  return exponentCache.get(key);
}
function termKey(a, b) {
  const out = { ...exponents(a) };
  for (const [v, n] of Object.entries(exponents(b))) out[v] = (out[v] || 0) + n;
  if (Object.values(out).reduce((s, n) => s + n, 0) > MAX_DEGREE)
    throw new Error('Слишком высокая степень.');
  return Object.keys(out)
    .sort()
    .map((v) => `${v}:${out[v]}`)
    .join(';');
}
const constP = (r) => (r.n ? new Map([['', r]]) : new Map());
const varP = (v) => new Map([[`${v}:1`, O]]);
const constant = (p) => p.size === 0 || (p.size === 1 && p.has(''));
const constValue = (p) => {
  if (!constant(p)) throw new Error('Здесь нужно число.');
  return p.get('') || Z;
};
function addP(a, b) {
  const p = new Map(a);
  for (const [k, v] of b) {
    const r = addR(p.get(k) || Z, v);
    if (r.n) p.set(k, r);
    else p.delete(k);
  }
  if (p.size > MAX_TERMS) throw new Error('Выражение слишком сложное.');
  return p;
}
const negP = (p) => new Map([...p].map(([k, v]) => [k, negR(v)]));
function mulP(a, b) {
  const p = new Map();
  for (const [ka, va] of a)
    for (const [kb, vb] of b) {
      const k = termKey(ka, kb),
        r = addR(p.get(k) || Z, mulR(va, vb));
      if (r.n) p.set(k, r);
      else p.delete(k);
      if (p.size > MAX_TERMS || String(abs(r.n)).length > 180)
        throw new Error('Выражение слишком сложное.');
    }
  return p;
}
const sameP = (a, b) =>
  a.size === b.size && [...a].every(([k, v]) => b.has(k) && sameR(v, b.get(k)));
function powP(p, n) {
  let out = constP(O),
    b = p;
  while (n > 0) {
    if (n % 2) out = mulP(out, b);
    n = Math.floor(n / 2);
    if (n) b = mulP(b, b);
  }
  return out;
}
function decimal(s) {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) || s.replace('.', '').length > 30)
    throw new Error('Проверь запись числа.');
  const [a, b = ''] = s.split('.');
  return rational(BigInt((a || '0') + b), 10n ** BigInt(b.length));
}
function tokens(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[\d.]/.test(c)) {
      const m = s.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!m) throw new Error('Проверь десятичную дробь.');
      out.push({ type: 'num', value: m[0] });
      i += m[0].length;
    } else if (/[a-z]/.test(c)) {
      out.push({ type: 'var', value: c });
      i++;
    } else if ('+-*/^()'.includes(c)) {
      out.push({ type: c, value: c });
      i++;
    } else throw new Error('Допустимы числа, латинские буквы, скобки и знаки + − * / ^.');
    if (out.length > 180) throw new Error('Выражение слишком длинное.');
  }
  out.push({ type: 'end' });
  return out;
}
export function parseExpression(input) {
  const s = normalizeMath(input);
  if (!s) throw new Error('Сначала введи ответ.');
  const ts = tokens(s);
  let pos = 0,
    depth = 0;
  const peek = () => ts[pos].type;
  const take = (t) => {
    if (peek() !== t) throw new Error('Проверь скобки и знаки действий.');
    return ts[pos++];
  };
  function sum() {
    let node = product();
    while (['+', '-'].includes(peek())) {
      const op = ts[pos++].type;
      node = { kind: op, left: node, right: product() };
    }
    return node;
  }
  function product() {
    let node = unary();
    while (['*', '/', 'num', 'var', '('].includes(peek())) {
      let op = '*';
      if (['*', '/'].includes(peek())) op = ts[pos++].type;
      node = { kind: op, left: node, right: unary() };
    }
    return node;
  }
  function unary() {
    if (['+', '-'].includes(peek())) {
      const op = ts[pos++].type;
      return { kind: 'unary', op, child: unary() };
    }
    return power();
  }
  function power() {
    let node = atom();
    if (peek() === '^') {
      pos++;
      node = { kind: '^', left: node, right: unary() };
    }
    return node;
  }
  function atom() {
    if (++depth > 48) throw new Error('Слишком много вложенных скобок.');
    let node;
    if (peek() === 'num') node = { kind: 'num', value: decimal(take('num').value) };
    else if (peek() === 'var') node = { kind: 'var', value: take('var').value };
    else if (peek() === '(') {
      pos++;
      node = sum();
      take(')');
    } else throw new Error('Не хватает числа, переменной или скобки.');
    depth--;
    return node;
  }
  const ast = sum();
  if (peek() !== 'end') throw new Error('Проверь скобки и знаки действий.');
  const divisors = [];
  function evaluate(node) {
    if (node.kind === 'num') return { n: constP(node.value), d: constP(O) };
    if (node.kind === 'var') return { n: varP(node.value), d: constP(O) };
    if (node.kind === 'unary') {
      const v = evaluate(node.child);
      return { n: node.op === '-' ? negP(v.n) : v.n, d: v.d };
    }
    const a = evaluate(node.left),
      b = evaluate(node.right);
    if (node.kind === '+') return { n: addP(mulP(a.n, b.d), mulP(b.n, a.d)), d: mulP(a.d, b.d) };
    if (node.kind === '-')
      return { n: addP(mulP(a.n, b.d), negP(mulP(b.n, a.d))), d: mulP(a.d, b.d) };
    if (node.kind === '*') return { n: mulP(a.n, b.n), d: mulP(a.d, b.d) };
    if (node.kind === '/') {
      if (!b.n.size) throw new Error('Делить на ноль нельзя.');
      divisors.push(b.n);
      return { n: mulP(a.n, b.d), d: mulP(a.d, b.n) };
    }
    if (node.kind === '^') {
      const power = divR(constValue(b.n), constValue(b.d));
      if (power.d !== 1n || power.n < -12n || power.n > 60n)
        throw new Error('Показатель должен быть целым числом от −12 до 60.');
      const n = Number(power.n);
      if (n <= 0 && !constant(a.n)) divisors.push(a.n);
      if (n < 0 && !a.n.size) throw new Error('Нулевая степень в знаменателе недопустима.');
      if (n === 0 && !a.n.size) throw new Error('0 в степени 0 здесь не определён.');
      return n >= 0 ? { n: powP(a.n, n), d: powP(a.d, n) } : { n: powP(a.d, -n), d: powP(a.n, -n) };
    }
    throw new Error('Неподдерживаемое действие.');
  }
  return { ...evaluate(ast), ast, divisors };
}
/** Допустимы целые, конечные десятичные, дроби, смешанные числа и числовые действия. */
export function parseNumber(input, options = {}) {
  let s = String(input ?? '')
    .trim()
    .replace(/^[a-zа-я]\s*=\s*/i, '');
  if (options.units?.length) {
    const escaped = options.units.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    s = s.replace(new RegExp(`\\s*(?:${escaped})\\s*$`, 'iu'), '');
  }
  s = s
    .replace(/([0-9])\s*([½⅓⅔¼¾])/g, '$1 $2')
    .replace(
      /^([−-]?)(\d+)\s+([½⅓⅔¼¾])$/,
      (_, sign, a, b) => `${sign === '−' || sign === '-' ? '-' : ''}(${a}+${b})`
    );
  s = s.replace(
    /^([−-]?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/,
    (_, sign, a, b, c) => `${sign === '−' || sign === '-' ? '-' : ''}(${a}+${b}/${c})`
  );
  const e = parseExpression(s);
  return divR(constValue(e.n), constValue(e.d));
}
/** Точное синтетическое деление на (variable − root), в том числе
 * когда коэффициенты — многочлены по другим переменным. */
function divideLinear(p, variable, root) {
  if (!p.size) return null;
  const cs = [];
  let degree = 0;
  for (const [key, value] of p) {
    const e = { ...exponents(key) },
      n = e[variable] || 0;
    delete e[variable];
    const rest = Object.keys(e)
      .sort()
      .map((v) => `${v}:${e[v]}`)
      .join(';');
    if (!cs[n]) cs[n] = new Map();
    cs[n].set(rest, value);
    degree = Math.max(degree, n);
  }
  if (!degree) return null;
  const q = [];
  q[degree - 1] = cs[degree] || new Map();
  const r = constP(root);
  for (let k = degree - 2; k >= 0; k--) q[k] = addP(cs[k + 1] || new Map(), mulP(r, q[k + 1]));
  if (addP(cs[0] || new Map(), mulP(r, q[0])).size) return null;
  let out = new Map();
  for (let k = 0; k < q.length; k++)
    out = addP(out, mulP(q[k], k ? new Map([[`${variable}:${k}`, O]]) : constP(O)));
  return out;
}
function denominatorAllowed(p, excluded = []) {
  if (constant(p)) return !!constValue(p).n;
  let remaining = p;
  for (const item of excluded) {
    const variable = item.variable || 'x';
    const root = parseNumber(item.value);
    let divided;
    while ((divided = divideLinear(remaining, variable, root)) !== null) remaining = divided;
  }
  return constant(remaining) && !!constValue(remaining).n;
}
const unwrap = (n) => (n.kind === 'unary' ? unwrap(n.child) : n);
function factorParts(n) {
  n = unwrap(n);
  if (n.kind === '*') return [...factorParts(n.left), ...factorParts(n.right)];
  return [n];
}
function expandedViolation(ast) {
  const terms = [];
  function collect(node) {
    if (node.kind === '+' || node.kind === '-') {
      collect(node.left);
      collect(node.right);
      return;
    }
    if (node.kind === 'unary' && node.op === '+') {
      collect(node.child);
      return;
    }
    terms.push(node);
  }
  collect(ast);
  const seen = new Set();
  function hiddenVariableSum(node) {
    if (node.kind === '+' || node.kind === '-') {
      const p = parseAstOnly(node);
      if (!constant(p.n) || !constant(p.d)) return true;
    }
    return (
      (node.child ? hiddenVariableSum(node.child) : false) ||
      (node.left ? hiddenVariableSum(node.left) : false) ||
      (node.right ? hiddenVariableSum(node.right) : false)
    );
  }
  for (const node of terms) {
    const p = parseAstOnly(node);
    if (!constant(p.d))
      return 'Сократи выражение: в ответе не должно остаться переменной в знаменателе.';
    if (p.n.size > 1 || hiddenVariableSum(node))
      return 'Ответ равносилен, но нужно раскрыть скобки и степени суммы.';
    if (p.n.size === 1) {
      const key = p.n.keys().next().value;
      if (seen.has(key)) return 'Значение верное. Теперь приведи подобные слагаемые.';
      seen.add(key);
    }
  }
  return '';
}
// Небольшая независимая оценка AST для структурных требований (ввод уже проверен парсером).
function astToText(n) {
  if (n.kind === 'num') return `(${formatRational(n.value)})`;
  if (n.kind === 'var') return n.value;
  if (n.kind === 'unary') return `(${n.op}${astToText(n.child)})`;
  return `(${astToText(n.left)}${n.kind}${astToText(n.right)})`;
}
const parseAstOnly = (n) => parseExpression(astToText(n));
function structuralCheck(ast, rule = {}) {
  if (rule.form === 'expanded') {
    const violation = expandedViolation(ast);
    if (violation) return violation;
  }
  if (rule.form === 'factorized') {
    const parts = factorParts(ast);
    let nonconstant = 0,
      nonunit = 0;
    for (const node of parts) {
      const p = parseAstOnly(node);
      if (!constant(p.n)) {
        const u = unwrap(node),
          power = u.kind === '^' ? parseAstOnly(u.right) : null,
          exponent = power ? divR(constValue(power.n), constValue(power.d)) : O,
          count = Number(exponent.n);
        nonconstant += Math.max(1, count);
        nonunit += Math.max(1, count);
      } else {
        const v = divR(constValue(p.n), constValue(p.d));
        if (abs(v.n) !== v.d) nonunit++;
      }
    }
    if (nonunit < (rule.minFactors || 2) || nonconstant < (rule.minNonconstant || 1))
      return 'Значение верное, но требуется произведение множителей, а не раскрытая сумма.';
    if (rule.linearFactors) {
      for (const node of parts) {
        const unwrapped = unwrap(node);
        const p = parseAstOnly(unwrapped.kind === '^' ? unwrapped.left : node);
        for (const key of p.n.keys())
          if (Object.values(exponents(key)).reduce((a, b) => a + b, 0) > 1)
            return 'Разложи до линейных множителей: преобразование ещё не закончено.';
      }
    }
  }
  return '';
}
export function compareExpressions(input, expected, options = {}) {
  const a = parseExpression(input),
    b = parseExpression(expected);
  if (!a.divisors.every((p) => denominatorAllowed(p, options.domainExcluded || [])))
    return {
      correct: false,
      message: 'В ответе появилось деление, не допустимое на всей области исходного выражения.',
    };
  const equivalent = sameP(mulP(a.n, b.d), mulP(b.n, a.d));
  if (!equivalent)
    return {
      correct: false,
      message: 'Пока не совпало. Проверь коэффициенты, знаки и показатели.',
    };
  const structure = structuralCheck(a.ast, options);
  return {
    correct: !structure,
    message: structure || 'Верно! Выражения равносильны и форма ответа подходит.',
  };
}
export function parseCoordinates(input) {
  let s = String(input ?? '')
    .trim()
    .replace(/^[([]\s*/, '')
    .replace(/\s*[)\]]$/, '');
  const labeled = s.match(/^x\s*=\s*(.+?)\s*[;,]\s*y\s*=\s*(.+)$/i);
  let parts = labeled ? [labeled[1], labeled[2]] : s.includes(';') ? s.split(';') : s.split(',');
  if (parts.length !== 2) throw new Error('Запиши две координаты через точку с запятой: (2; −3).');
  return parts.map((x) => parseNumber(x));
}
export const normalizeText = (input) =>
  String(input ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[−–—]/g, '-')
    .replace(/[«»"'.,:!?()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
function stripListBrackets(input) {
  const s = String(input ?? '').trim(),
    pairs = { '(': ')', '[': ']', '{': '}' };
  if (!pairs[s[0]] || s.at(-1) !== pairs[s[0]]) return s;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === s[0]) depth++;
    if (s[i] === s.at(-1)) depth--;
    if (depth === 0 && i < s.length - 1) return s;
  }
  return depth === 0 ? s.slice(1, -1) : s;
}
export function parseList(input, subtype = 'number') {
  const s = stripListBrackets(input);
  if (!s) throw new Error('Введи элементы списка через точку с запятой.');
  const parts = (s.includes(';') ? s.split(';') : s.split(',')).map((x) => x.trim());
  if (parts.some((x) => !x))
    throw new Error('Между разделителями не должно быть пустых элементов.');
  return subtype === 'text' ? parts.map(normalizeText) : parts.map((x) => parseNumber(x));
}
function sameList(a, b, ordered, subtype) {
  if (a.length !== b.length) return false;
  const serialize = (x) => (subtype === 'text' ? x : formatRational(x));
  const aa = a.map(serialize),
    bb = b.map(serialize);
  if (!ordered) {
    aa.sort();
    bb.sort();
  }
  return aa.every((x, i) => x === bb[i]);
}
export function checkAnswer(task, input) {
  if (!String(input ?? '').trim())
    return { correct: false, format: false, message: 'Сначала введи или выбери ответ.' };
  const alternatives = [task.answer, ...(task.alternatives || [])];
  try {
    let found = false,
      expressionMessage = '';
    if (task.type === 'expression') {
      for (const answer of alternatives) {
        const result = compareExpressions(input, answer, task.validation || {});
        if (result.correct) return { ...result, format: true };
        expressionMessage = result.message;
      }
      return { correct: false, format: true, message: expressionMessage };
    }
    if (task.type === 'number' || task.type === 'fraction') {
      const user = parseNumber(input, task.validation || {});
      found = alternatives.some((answer) => {
        const expected = parseNumber(answer);
        if (sameR(user, expected)) return true;
        const tol = task.type === 'fraction' ? 0 : (task.validation?.tolerance ?? 1e-9);
        if (!tol) return false;
        const u = Number(user.n) / Number(user.d),
          e = Number(expected.n) / Number(expected.d);
        return Number.isFinite(u) && Math.abs(u - e) <= tol * Math.max(1, Math.abs(e));
      });
    } else if (task.type === 'coordinates') {
      const user = parseCoordinates(input);
      found = alternatives.some((answer) => {
        const e = parseCoordinates(answer);
        return user.every((x, i) => sameR(x, e[i]));
      });
    } else if (task.type === 'list' || task.type === 'sequence') {
      const subtype = task.validation?.subtype || 'number';
      const user = parseList(input, subtype);
      found = alternatives.some((answer) =>
        sameList(
          user,
          parseList(answer, subtype),
          task.type === 'sequence' || task.validation?.ordered,
          subtype
        )
      );
    } else if (task.type === 'choice') {
      if (!task.options?.some((x) => String(x.value) === String(input)))
        return { correct: false, format: false, message: 'Выбери один из предложенных вариантов.' };
      found = alternatives.some((answer) => String(input) === String(answer));
    } else if (task.type === 'text')
      found = alternatives.some((answer) => normalizeText(input) === normalizeText(answer));
    else throw new Error('Этот тип ответа не поддерживается.');
    return {
      correct: found,
      format: true,
      message: found
        ? 'Верно! Отличная работа.'
        : 'Пока не совпало. Проверь решение и попробуй ещё раз.',
    };
  } catch (error) {
    return {
      correct: false,
      format: false,
      message: error.message || 'Не удалось разобрать ответ. Проверь формат.',
    };
  }
}
export function displayAnswer(task) {
  if (task.type === 'choice')
    return (
      task.options.find((x) => String(x.value) === String(task.answer))?.label ||
      String(task.answer)
    );
  if (task.type === 'sequence') return String(task.answer).split(';').join(' → ');
  return String(task.answer);
}
