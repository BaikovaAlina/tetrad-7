import { getWork, getTask, workTitles } from './bank.js';
import { getLesson } from './curriculum.js';
import { checkAnswer, displayAnswer } from './checker.js';
export const DEFAULT_GRADING = { five: 85, four: 70, three: 50 };
export function validateGrading(g) {
  return (
    !!g &&
    [g.five, g.four, g.three].every((x) => Number.isFinite(x) && x > 0 && x <= 100) &&
    g.five > g.four &&
    g.four > g.three
  );
}
export function gradeFor(percent, g = DEFAULT_GRADING) {
  return percent >= g.five ? 5 : percent >= g.four ? 4 : percent >= g.three ? 3 : 2;
}
export function createSession(lessonId, work, variant, profile, grading = DEFAULT_GRADING) {
  if (!validateGrading(grading)) throw new Error('Проверь пороги оценивания.');
  const tasks = getWork(lessonId, work, variant),
    now = new Date().toISOString();
  return {
    id:
      globalThis.crypto?.randomUUID?.() ||
      `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    version: 1,
    lessonId,
    work,
    variant: String(variant).slice(0, 30),
    taskIds: tasks.map((q) => q.id),
    student: {
      name: String(profile?.name || 'Ученик').slice(0, 50),
      className: String(profile?.className || '').slice(0, 12),
    },
    status: 'active',
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    elapsedSeconds: 0,
    current: 0,
    answers: {},
    hints: [],
    grading: { ...grading },
    sentAt: null,
  };
}
export function checkSessionAnswer(session, task, input) {
  if (session.status !== 'active') throw new Error('Работа уже завершена.');
  if (!session.taskIds.includes(task.id)) throw new Error('Задание не относится к этой работе.');
  const result = checkAnswer(task, input);
  if (!result.format) return result; // Ошибка записи не считается математической попыткой.
  const prev = session.answers[task.id] || { draft: '', attempts: 0 };
  session.answers[task.id] = {
    ...prev,
    draft: String(input).slice(0, 320),
    lastInput: String(input).slice(0, 320),
    attempts: prev.attempts + 1,
    firstCorrect: typeof prev.firstCorrect === 'boolean' ? prev.firstCorrect : result.correct,
    firstInput:
      typeof prev.firstCorrect === 'boolean' ? prev.firstInput : String(input).slice(0, 320),
    latestCorrect: result.correct,
    feedback: result.message,
    solutionSeen: !!prev.solutionSeen,
  };
  return result;
}
export function sessionSummary(session) {
  const all = session.taskIds.map((id) => session.answers?.[id] || {});
  const correct = all.filter((a) => a.firstCorrect === true).length;
  const wrong = all.filter((a) => a.firstCorrect === false).length;
  const answered = correct + wrong,
    total = all.length;
  const percent = total ? (100 * correct) / total : 0;
  return {
    total,
    correct,
    wrong,
    answered,
    unanswered: total - answered,
    percent,
    progress: total ? (100 * answered) / total : 0,
    accuracy: answered ? (100 * correct) / answered : 0,
    grade: session.status === 'finished' ? gradeFor(percent, session.grading) : null,
    corrected: all.filter((a) => a.firstCorrect === false && a.latestCorrect === true).length,
  };
}
export function finishSession(session) {
  if (session.status === 'finished') return session;
  session.status = 'finished';
  session.finishedAt = new Date().toISOString();
  session.finalSummary = sessionSummary(session);
  return session;
}
export function makeReport(session) {
  if (session.status !== 'finished') throw new Error('Сначала заверши работу.');
  const lesson = getLesson(session.lessonId),
    summary = sessionSummary(session);
  return {
    schemaVersion: 1,
    clientReported: true,
    id: session.id,
    student: session.student,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    subject: lesson.subject,
    work: session.work,
    workTitle: workTitles[session.work],
    variant: session.variant,
    finishedAt: session.finishedAt,
    durationSeconds: Math.max(0, Math.floor(session.elapsedSeconds || 0)),
    ...summary,
    grading: session.grading,
    hintsUsed: (session.hints || []).length,
    answers: session.taskIds.map((id) => {
      const q = getTask(id),
        a = session.answers?.[id] || {};
      return {
        taskId: id,
        prompt: q.prompt
          .replace(/<[^>]*>/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>'),
        type: q.type,
        ...(q.steps ? { steps: [...q.steps] } : {}),
        ...(q.solutionSteps ? { solutionSteps: [...q.solutionSteps], skills: [...q.skills] } : {}),
        studentAnswer:
          typeof a.firstCorrect === 'boolean' ? answerForDisplay(q, a.firstInput) : 'Нет ответа',
        expectedAnswer: displayAnswer(q),
        correct: a.firstCorrect === true,
        unanswered: typeof a.firstCorrect !== 'boolean',
        attempts: a.attempts || 0,
        corrected: a.firstCorrect === false && a.latestCorrect === true,
        hintUsed: (session.hints || []).includes(id),
        manualComment: String(a.manualComment || '').slice(0, 1200),
      };
    }),
  };
}
export function answerForDisplay(task, input) {
  if (task.type === 'choice')
    return (
      task.options.find((o) => String(o.value) === String(input))?.label || String(input || '—')
    );
  return String(input || '—');
}
export function formatTime(seconds = 0) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export function reportAsText(report) {
  return `${report.workTitle} · ${report.lessonTitle}\nУченик: ${report.student.name}${report.student.className ? ` (${report.student.className})` : ''}\nВариант: ${report.variant}\nРезультат: ${report.correct}/${report.total} (${report.percent.toFixed(1)}%)\nОценка: ${report.grade}\nВремя активной работы: ${formatTime(report.durationSeconds)}\nПороги 5/4/3: ${report.grading.five}/${report.grading.four}/${report.grading.three}%\nID: ${report.id}\n\n${report.answers.map((a, i) => `${i + 1}. ${a.prompt}${a.steps ? `\nШаги (исходная нумерация):\n${a.steps.map((step, j) => `${j + 1}) ${step}`).join('\n')}` : ''}\nОтвет: ${a.studentAnswer}\nВерно: ${a.expectedAnswer} · ${a.correct ? 'зачтено' : a.unanswered ? 'без ответа' : 'ошибка'}${a.corrected ? ' · исправлено после первой попытки' : ''}${a.solutionSteps ? `\nРазбор по шагам:\n${a.solutionSteps.map((step, j) => `${j + 1}) ${step}`).join('\n')}` : ''}${a.manualComment ? `\nОбоснование (проверяет учитель): ${a.manualComment}` : ''}`).join('\n\n')}\n\nКлиентский учебный отчёт: имя и баллы не заверены сервером.\n`;
}
