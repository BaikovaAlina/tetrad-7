/* Общий формат сообщения для браузера и Worker: только доверенные HTML-теги. */
export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const clip = (value, max) => {
  const s = String(value ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};
const formatTime = (seconds = 0) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export function buildTelegramMessage(report) {
  if (report.test)
    return '<b>Тетрадь 7 · проверка связи</b>\nСообщение доставлено. Отправка результатов работает.\nТест не содержит данных ученика.';
  const e = (s, n = 100) => escapeHtml(clip(s, n)),
    g = report.grading || {};
  const lines = [
    `<b>${e(report.workTitle, 40)} · Тетрадь 7</b>`,
    `<b>Ученик:</b> ${e(report.student?.name, 50)}${report.student?.className ? ` · ${e(report.student.className, 12)}` : ''}`,
    `<b>Урок:</b> ${e(report.lessonTitle, 100)} (${e(report.lessonId, 8)})`,
    `<b>Вариант:</b> ${e(report.variant, 30)}`,
    `<b>Результат:</b> ${Number(report.correct) || 0}/${Number(report.total) || 0} · ${(Number(report.percent) || 0).toFixed(1)}%`,
    `<b>Оценка:</b> ${Number(report.grade) || 2} · пороги 5/4/3: ${Number(g.five) || 85}/${Number(g.four) || 70}/${Number(g.three) || 50}%`,
    `<b>Первая попытка:</b> верно ${Number(report.correct) || 0}, ошибок ${Number(report.wrong) || 0}, без ответа ${Number(report.unanswered) || 0}`,
    `<b>Активное время:</b> ${formatTime(report.durationSeconds)} · подсказок ${Number(report.hintsUsed) || 0}`,
    `<b>Завершено:</b> ${e(report.finishedAt, 30)}`,
    `<b>ID отчёта:</b> <code>${e(report.id, 60)}</code>`,
    '',
  ];
  const errors = (report.answers || []).filter((a) => !a.correct);
  if (!errors.length) lines.push('Все задания выполнены верно с первой попытки.');
  else {
    lines.push('<b>Ошибки и пропуски:</b>');
    let added = 0;
    for (const a of errors) {
      const row = `${added + 1}. ${e(a.prompt, 125)}\nОтвет: ${e(a.studentAnswer, 70)}; верно: ${e(a.expectedAnswer, 85)}${a.corrected ? ' · исправлено позже' : ''}`;
      if (lines.join('\n').length + row.length > 3150) break;
      lines.push(row);
      added++;
    }
    if (added < errors.length)
      lines.push(`Ещё ${errors.length - added} ошибок — в скачиваемом полном отчёте.`);
  }
  const manual = (report.answers || []).filter((a) => a.manualComment);
  if (manual.length) {
    lines.push('', '<b>Текст для проверки учителем:</b>');
    for (const a of manual) {
      const row = `${e(a.taskId, 15)}: ${e(a.manualComment, 140)}`;
      if (lines.join('\n').length + row.length > 3550) {
        lines.push('Остальные обоснования — в полном отчёте.');
        break;
      }
      lines.push(row);
    }
  }
  lines.push(
    '',
    '<i>Учебный клиентский отчёт. Имя и баллы не заверены сервером; это не защищённая контрольная работа.</i>'
  );
  return lines.join('\n');
}
