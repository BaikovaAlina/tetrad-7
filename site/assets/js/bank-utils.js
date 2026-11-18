export const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};
export const frac = (a, b) => {
  if (b < 0) {
    a = -a;
    b = -b;
  }
  const g = gcd(a, b);
  a /= g;
  b /= g;
  return b === 1 ? String(a) : `${a}/${b}`;
};
export const math = (text) => `<span class="math">${String(text)}</span>`;
export const sq = (n) => `${n}²`;
export const sign = (n) => (n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`);
export const term = (coefficient, variable = 'x') =>
  coefficient === 0
    ? '0'
    : coefficient === 1
      ? variable
      : coefficient === -1
        ? `-${variable}`
        : `${coefficient}${variable}`;
export function hash(text) {
  let h = 2166136261;
  for (const c of String(text)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(items, seed) {
  const arr = [...items],
    random = rng(typeof seed === 'number' ? seed : hash(seed));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export const N = (prompt, answer, explanation, extra = {}) => ({
  type: 'number',
  prompt,
  answer: String(answer),
  explanation,
  ...extra,
});
export const F = (prompt, answer, explanation, extra = {}) => ({
  type: 'fraction',
  prompt,
  answer: String(answer),
  explanation,
  ...extra,
});
export const E = (prompt, answer, explanation, extra = {}) => ({
  type: 'expression',
  prompt,
  answer: String(answer)
    .replace(/\+\s*-/g, '-')
    .replace(/(^|[+\-(*\/])1(?=[a-z])/g, '$1'),
  explanation,
  ...extra,
});
export const XY = (prompt, x, y, explanation, extra = {}) => ({
  type: 'coordinates',
  prompt,
  answer: `(${x}; ${y})`,
  explanation,
  ...extra,
});
export const LS = (prompt, answers, explanation, extra = {}) => ({
  type: 'list',
  prompt,
  answer: answers.join('; '),
  explanation,
  ...extra,
});
export const T = (prompt, answer, alternatives, explanation, extra = {}) => ({
  type: 'text',
  prompt,
  answer,
  alternatives,
  explanation,
  ...extra,
});
export function C(prompt, correct, wrongs, explanation, extra = {}) {
  const labels = [String(correct), ...wrongs.map(String)];
  if (new Set(labels).size !== labels.length) throw new Error(`Повтор вариантов: ${prompt}`);
  const options = shuffle(
    labels.map((label, i) => ({ value: String(i + 1), label })),
    hash(prompt)
  );
  return { type: 'choice', prompt, options, answer: '1', explanation, ...extra };
}
export function S(prompt, orderedSteps, explanation, extra = {}) {
  const order = shuffle(
    orderedSteps.map((text, i) => ({ text, i })),
    hash(prompt)
  );
  const answer = orderedSteps.map((_, i) => order.findIndex((x) => x.i === i) + 1).join('; ');
  return {
    type: 'sequence',
    prompt,
    steps: order.map((x) => x.text),
    answer,
    explanation,
    ...extra,
  };
}
export const angleValidation = { units: ['°', 'градусов', 'градуса', 'градус'] };
export const lengthValidation = { units: ['см', 'сантиметров', 'сантиметра', 'сантиметр'] };
export const expanded = { form: 'expanded' };
export const factorized = { form: 'factorized', minFactors: 2, minNonconstant: 2 };
