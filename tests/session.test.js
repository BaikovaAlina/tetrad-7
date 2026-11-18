import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession,
  checkSessionAnswer,
  sessionSummary,
  finishSession,
  makeReport,
  reportAsText,
  gradeFor,
  validateGrading,
  formatTime,
} from '../site/assets/js/session.js';
import { getTask } from '../site/assets/js/bank.js';
const make = () => createSession('a11', 'homework', 'test', { name: 'Саша', className: '7А' });
test('Балл только за первую математическую попытку; формат не является попыткой', () => {
  const s = make(),
    q = getTask(s.taskIds[0]);
  assert.equal(checkSessionAnswer(s, q, 'abc!').format, false);
  assert.equal(s.answers[q.id], undefined);
  assert.equal(checkSessionAnswer(s, q, '999999').correct, false);
  assert.equal(checkSessionAnswer(s, q, q.answer).correct, true);
  assert.equal(s.answers[q.id].firstCorrect, false);
  assert.equal(s.answers[q.id].latestCorrect, true);
  assert.equal(s.answers[q.id].attempts, 2);
  const summary = sessionSummary(s);
  assert.equal(summary.correct, 0);
  assert.equal(summary.wrong, 1);
  assert.equal(summary.corrected, 1);
  assert.equal(summary.progress, 12.5);
  assert.equal(summary.percent, 0);
});
test('Верная первая попытка сохраняется, пропуски не приносят баллов', () => {
  const s = make(),
    q = getTask(s.taskIds[0]);
  checkSessionAnswer(s, q, q.answer);
  checkSessionAnswer(s, q, '999999');
  assert.equal(sessionSummary(s).correct, 1);
  finishSession(s);
  assert.equal(sessionSummary(s).grade, 2);
  assert.equal(sessionSummary(s).unanswered, 7);
  assert.equal(sessionSummary(s).percent, 12.5);
  assert.throws(() => checkSessionAnswer(s, q, q.answer));
  assert.equal(finishSession(s), s);
});
test('Все верно → 100%, 5; полный отчёт содержит имя, время, ошибки и ограничения', () => {
  const s = make();
  for (const id of s.taskIds) {
    const q = getTask(id);
    checkSessionAnswer(s, q, q.answer);
  }
  s.elapsedSeconds = 125;
  s.hints.push(s.taskIds[0]);
  finishSession(s);
  const r = makeReport(s);
  assert.equal(r.correct, 8);
  assert.equal(r.grade, 5);
  assert.equal(r.percent, 100);
  assert.equal(r.durationSeconds, 125);
  assert.equal(r.hintsUsed, 1);
  assert.equal(r.student.name, 'Саша');
  assert.equal(r.answers.length, 8);
  assert.equal(r.clientReported, true);
  assert.match(reportAsText(r), /02:05/);
  assert.match(reportAsText(r), /не заверены сервером/);
  assert.equal(formatTime(3601), '60:01');
});
test('Шкала на границах и снимок порогов в работе', () => {
  assert.equal(gradeFor(85), 5);
  assert.equal(gradeFor(84.99), 4);
  assert.equal(gradeFor(70), 4);
  assert.equal(gradeFor(69.99), 3);
  assert.equal(gradeFor(50), 3);
  assert.equal(gradeFor(49.99), 2);
  assert.equal(validateGrading({ five: 80, four: 70, three: 70 }), false);
  assert.equal(validateGrading({ five: 110, four: 70, three: 50 }), false);
  assert.equal(validateGrading({ five: 90, four: 75, three: 60 }), true);
  const g = { five: 90, four: 75, three: 60 },
    s = createSession('g01', 'classwork', '1', { name: 'Ли' }, g);
  g.five = 99;
  assert.equal(s.grading.five, 90);
  assert.throws(() => createSession('g01', 'classwork', '1', {}, { five: 0, four: 70, three: 50 }));
});
test('Чужое задание не может попасть в сессию; текст обоснования сохраняется без автооценки', () => {
  const s = make();
  assert.throws(() => checkSessionAnswer(s, getTask('g01-01'), '10'));
  const g = createSession('g08', 'homework', '1', { name: 'Саша' }),
    q = getTask(g.taskIds[0]);
  g.answers[q.id] = { manualComment: 'Моё доказательство', draft: '', attempts: 0 };
  finishSession(g);
  const r = makeReport(g);
  assert.equal(r.correct, 0);
  assert.equal(r.answers[0].manualComment, 'Моё доказательство');
});
