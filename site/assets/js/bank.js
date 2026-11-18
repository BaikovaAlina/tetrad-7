import { lessons, modules, getLesson } from './curriculum.js';
import { algebraTask } from './bank-algebra.js';
import { geometryTask } from './bank-geometry.js';
import { statisticsTask } from './bank-statistics.js';
import { complexTask } from './bank-complex.js';
import { shuffle } from './bank-utils.js';
export const VARIANTS_PER_LESSON = 48;
export const WORK_SIZES = { classwork: 8, homework: 8, practice: 12 };
export const workTitles = {
  classwork: 'Классная работа',
  homework: 'Домашнее задание',
  practice: 'Свободная практика',
};
const cache = new Map();
export function getBank(lessonId) {
  if (cache.has(lessonId)) return cache.get(lessonId);
  const lesson = getLesson(lessonId);
  if (!lesson) throw new Error('Урок не найден.');
  const factory = lesson.challenge
    ? complexTask
    : lesson.subject === 'algebra'
      ? algebraTask
      : lesson.subject === 'geometry'
        ? geometryTask
        : statisticsTask;
  const bank = Array.from({ length: VARIANTS_PER_LESSON }, (_, index) => {
    const task = factory(lessonId, index);
    const q = {
      id: `${lessonId}-${String(index + 1).padStart(2, '0')}`,
      lessonId,
      index,
      points: 1,
      hint: lesson.theory.rules[0],
      ...task,
    };
    if (q.stepOrderAlternatives) {
      const base = q.answer.split(';').map((x) => x.trim());
      q.alternatives = [
        ...(q.alternatives || []),
        ...q.stepOrderAlternatives.map((order) => order.map((i) => base[i]).join('; ')),
      ];
      delete q.stepOrderAlternatives;
    }
    return Object.freeze(q);
  });
  cache.set(lessonId, bank);
  return bank;
}
/** Один seed для классной и домашней: они используют непересекающиеся части банка. */
export function getWork(lessonId, work = 'classwork', variant = '1') {
  if (!Object.hasOwn(WORK_SIZES, work)) throw new Error('Неизвестный тип работы.');
  const seed = `tetrad7:1:${lessonId}:${String(variant).slice(0, 30)}`;
  const pool = shuffle(getBank(lessonId), seed);
  const start = work === 'homework' ? WORK_SIZES.classwork : 0;
  return pool.slice(start, start + WORK_SIZES[work]);
}
export function getTask(id) {
  if (!/^[ags]\d{2}-\d{2}$/.test(id)) return undefined;
  return getBank(id.split('-')[0]).find((q) => q.id === id);
}
export const bankSummary = {
  lessons: lessons.length,
  variants: lessons.length * VARIANTS_PER_LESSON,
  modules: modules.length,
  complexLessons: lessons.filter((l) => l.challenge).length,
  complexVariants: lessons.filter((l) => l.challenge).length * VARIANTS_PER_LESSON,
};
