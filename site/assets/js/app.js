import {
  lessons,
  modules,
  subjects,
  levels,
  getLesson,
  getModule,
  lessonPath,
  workPath,
  sources,
} from './curriculum.js';
import { getBank, getWork, getTask, workTitles, bankSummary } from './bank.js';
import { checkAnswer, displayAnswer } from './checker.js';
import {
  loadState,
  saveProfile,
  savePreferences,
  saveSession,
  findSession,
  finishedSessions,
  activeSessions,
  clearProgress,
  clearAll,
  downloadFile,
  persistentStorage,
  reloadFromStorage,
} from './storage.js';
import {
  DEFAULT_GRADING,
  validateGrading,
  createSession,
  checkSessionAnswer,
  sessionSummary,
  finishSession,
  makeReport,
  formatTime,
  reportAsText,
  answerForDisplay,
} from './session.js';
import { buildTelegramMessage, sendToTelegram, getTelegramStatus } from './telegram.js';
import {
  esc,
  icon,
  fmt,
  dateLabel,
  emptyState,
  pageHeading,
  showToast,
  openModal,
  closeModal,
  copyText,
  heroArtwork,
} from './ui.js';
import { renderDiagram } from './diagrams.js';
import { mountChallenge, getChallengeToken, resetChallenge } from './challenge.js';
const config = window.TRAINER_CONFIG || { telegram: { mode: 'off' }, grading: DEFAULT_GRADING };
const main = document.getElementById('main');
const typeNames = {
  number: 'Число',
  fraction: 'Дробь',
  expression: 'Выражение',
  coordinates: 'Координаты',
  choice: 'Выбор ответа',
  list: 'Список',
  sequence: 'Порядок шагов',
  text: 'Короткий ответ',
};
const openedModules = new Set();
const sending = new Set();
let currentSession = null,
  currentRoute = null,
  profileCallback = null,
  draftTimer = null,
  formatFeedback = null,
  rendering = false;
let filters = {
  subject: 'all',
  level: 'all',
  search: '',
  ...(loadState().preferences.catalog || {}),
};
if (!['all', ...Object.keys(subjects)].includes(filters.subject)) filters.subject = 'all';
if (!['all', ...Object.keys(levels)].includes(filters.level)) filters.level = 'all';
filters.search = String(filters.search || '').slice(0, 100);
function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '') || 'catalog';
  const [path, query = ''] = hash.split('?');
  const [page, id] = path.split('/');
  return { page, id, query: new URLSearchParams(query) };
}
function grading() {
  const g = loadState().preferences.grading || config.grading;
  return validateGrading(g) ? g : DEFAULT_GRADING;
}
const completedLessons = () => new Set(finishedSessions().map((s) => s.lessonId));
const levelBadge = (l) =>
  `<span class="badge ${l.level}" title="${esc(levels[l.level].note)}"><span class="level-dot ${l.level}"></span>${levels[l.level].title}</span>`;
const subjectBadge = (l) =>
  `<span class="badge ${l.subject}">${icon(subjects[l.subject].icon, 12)}${subjects[l.subject].title}</span>`;
function fullLink(hash) {
  const u = new URL(location.href);
  u.hash = hash.replace(/^#/, '');
  return u.href;
}
function newVariant() {
  return String(1000 + Math.floor(Math.random() * 8999));
}
function persistFilters() {
  savePreferences({ catalog: { ...filters } });
}
function setTitle(title = 'Математика по полочкам') {
  document.title = `${title} · Тетрадь 7`;
}
function renderShell(page) {
  const nav = [
    ['catalog', 'grid', 'Все уроки'],
    ['stats', 'chart', 'Мой прогресс'],
    ['homework', 'homework', 'Домашние задания'],
  ];
  const useful = [
    ['theory', 'book', 'Теория и формулы'],
    ['program', 'file', 'Программа 7 класса'],
  ];
  const active = ['lesson', 'train', 'result'].includes(page) ? 'catalog' : page;
  const link = ([route, name, title]) =>
    `<a class="nav-link ${active === route ? 'active' : ''}" href="#/${route}" ${active === route ? 'aria-current="page"' : ''}>${icon(name)}<span>${title}</span>${route === 'catalog' ? `<span class="nav-count">${lessons.length}</span>` : ''}</a>`;
  document.getElementById('sidebar').innerHTML =
    `<a class="brand" href="#/catalog" aria-label="Тетрадь 7, все уроки"><span class="brand-mark">${icon('book', 25)}</span><span><span class="brand-name">тетрадь<span style="color:#879a6e">7</span></span><span class="brand-tag">Математика по полочкам</span></span></a><p class="nav-caption">ТВОЯ ТЕТРАДЬ</p><nav class="nav-list">${nav.map(link).join('')}</nav><p class="nav-caption">ВСЕГДА ПОД РУКОЙ</p><nav class="nav-list">${useful.map(link).join('')}</nav><div class="sidebar-bottom"><a class="teacher-card" href="#/settings">${icon('send', 23)}<strong>Уголок учителя</strong><p>Результаты домашних работ —<br>прямо в ваш Telegram.</p><span class="teacher-link">Настроить отправку ${icon('arrow', 14)}</span></a><div class="sidebar-meta"><span class="status-dot"></span>Бесплатно. Без регистрации.</div></div>`;
  const p = loadState().profile,
    name = p.name || 'Это моя тетрадь',
    initial = p.name ? p.name[0].toUpperCase() : '7';
  const crumbs = {
    catalog: 'Все уроки',
    lesson: 'Все уроки',
    train: 'Тренажёр',
    result: 'Результат',
    stats: 'Мой прогресс',
    homework: 'Домашние задания',
    theory: 'Теория',
    program: 'Программа',
    settings: 'Учителю',
    privacy: 'О данных',
  };
  document.getElementById('topbar').innerHTML =
    `<div class="topbar-start"><button class="icon-btn menu-toggle" data-action="open-menu" aria-label="Открыть меню" aria-expanded="false" aria-controls="sidebar">${icon('menu')}</button><div class="breadcrumb"><span>Математика</span>${icon('chevron', 12)}<strong>7 класс</strong>${icon('chevron', 12)}<span>${crumbs[page] || 'Все уроки'}</span></div></div><div class="topbar-right"><span class="save-label"><span class="status-dot"></span>Прогресс сохраняется здесь</span><button class="profile-button" data-action="profile" aria-label="Имя ученика и класс"><span class="avatar">${esc(initial)}</span><span class="profile-meta"><strong>${esc(name)}</strong><small>${esc(p.className || 'Твой личный тренажёр')}</small></span>${icon('down', 12)}</button></div>`;
}
function storageNotice() {
  return persistentStorage
    ? ''
    : `<div class="notice warning">${icon('warning')}<p>Браузер не разрешил сохранение. Эта работа доступна только до закрытия вкладки. Скачай отчёт после завершения.</p></div>`;
}
function filteredLessons() {
  const needle = filters.search.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
  return lessons.filter(
    (l) =>
      (filters.subject === 'all' || l.subject === filters.subject) &&
      (filters.level === 'all' || l.level === filters.level) &&
      (!needle ||
        [l.title, l.description, ...l.tags, ...l.umk, getModule(l.module).title]
          .join(' ')
          .toLocaleLowerCase('ru-RU')
          .replace(/ё/g, 'е')
          .includes(needle))
  );
}
function catalogFiltersHTML() {
  return `<div class="filters"><div class="filter-top"><div class="search-field">${icon('search')}<label class="sr-only" for="catalog-search">Поиск урока</label><input id="catalog-search" type="search" maxlength="100" value="${esc(filters.search)}" placeholder="Найти тему: например, линейная функция" autocomplete="off"></div><div class="select-wrap"><label class="sr-only" for="level-filter">Уровень</label><select id="level-filter"><option value="all">Любой уровень</option><option value="core" ${filters.level === 'core' ? 'selected' : ''}>Базовый</option><option value="advanced" ${filters.level === 'advanced' ? 'selected' : ''}>Углублённые темы</option><option value="extension" ${filters.level === 'extension' ? 'selected' : ''}>Дополнительно</option></select>${icon('down')}</div></div><div class="subject-tabs" aria-label="Фильтр по предмету">${[['all', 'grid', 'Все темы'], ...Object.entries(subjects).map(([id, s]) => [id, s.icon, s.title])].map(([id, name, title]) => `<button class="tab ${filters.subject === id ? 'active' : ''}" data-action="filter-subject" data-subject="${id}" aria-pressed="${filters.subject === id}">${icon(name)}${title}<span class="tab-count">${id === 'all' ? lessons.length : lessons.filter((l) => l.subject === id).length}</span></button>`).join('')}</div><div class="filter-bottom"><span class="filter-result" id="filter-result"></span><div class="legend"><span><i></i>Базовый</span><span><i class="advanced-dot"></i>Углублённый</span><span><i class="extension-dot"></i>Дополнительно</span></div></div></div>`;
}
function renderCatalog() {
  setTitle();
  const done = completedLessons(),
    active = activeSessions()[0];
  main.innerHTML = `${storageNotice()}<section class="hero"><div class="hero-content"><div class="hero-tag">${icon('pencil', 12)}ДЛЯ ТЕХ, КТО ХОЧЕТ РАЗОБРАТЬСЯ</div><h1>С математикой<br>всё <em>сложится.</em></h1><p class="hero-description">Правила — понятнее. Задачи — интереснее. Алгебра, геометрия и твои маленькие победы за 7 класс — в одной тетради.</p><div class="hero-buttons"><a class="btn btn-primary" href="${active ? workPath(active.lessonId, active.work, active.variant) : lessonPath('a01')}">${active ? 'Продолжить заниматься' : 'Начать заниматься'} ${icon('arrow')}</a><button class="btn btn-text" data-action="help">${icon('play')}Как это работает</button></div></div>${heroArtwork()}</section><section class="metrics" aria-label="О тренажёре"><div class="metric"><span class="metric-icon">${icon('book', 22)}</span><div><div class="metric-value">${lessons.length}</div><div class="metric-label">урока по всей программе</div></div></div><div class="metric"><span class="metric-icon">${icon('pencil', 22)}</span><div><div class="metric-value">${fmt(bankSummary.variants)}</div><div class="metric-label">вариантов заданий</div></div></div><a class="metric" href="#/stats"><span class="metric-icon">${icon('chart', 22)}</span><div><div class="metric-value">${done.size}<small>/ ${lessons.length}</small></div><div class="metric-label">уроков в твоём прогрессе</div></div><span class="metric-tail">${icon('chevron')}</span></a></section>${active ? `<div class="continue-banner"><span class="continue-icon">${icon('play')}</span><div><strong>Твоя тетрадь всё помнит</strong><p>${esc(getLesson(active.lessonId)?.title)} · выполнено ${sessionSummary(active).answered} из ${active.taskIds.length}</p></div><a class="btn btn-small btn-secondary" href="${workPath(active.lessonId, active.work, active.variant)}">Продолжить ${icon('arrow')}</a></div>` : ''}<div class="section-heading" id="catalog-start"><div><h2>Что разберём сегодня?</h2><p>Выбери предмет, модуль и свой следующий шаг.</p></div><a class="btn btn-text" href="#/program">Вся программа ${icon('arrow')}</a></div>${catalogFiltersHTML()}<div id="catalog-results"></div><div class="catalog-bottom-note">${icon('shield')}<span>Без регистрации и платных подписок. Проверка работает в браузере, а прогресс сохраняется на твоём устройстве.</span></div>`;
  updateCatalogResults();
}
function moduleCard(module, list, done) {
  const all = lessons.filter((l) => l.module === module.id),
    completed = all.filter((l) => done.has(l.id)).length,
    open = openedModules.has(module.id) || !!filters.search;
  const row = (l, i) =>
    `<div class="lesson-row"><span class="lesson-number">${String(all.findIndex((x) => x.id === l.id) + 1).padStart(2, '0')}</span><div class="lesson-row-main"><a class="lesson-title-link" href="${lessonPath(l.id)}">${esc(l.title)}<span class="level-dot ${l.level}" title="${levels[l.level].title}"></span>${done.has(l.id) ? icon('check', 12) : ''}</a></div><div class="lesson-row-actions"><a class="lesson-short-link" href="${workPath(l.id, 'classwork')}" title="Классная работа: ${esc(l.title)}" aria-label="Классная работа: ${esc(l.title)}">КР</a><a class="lesson-short-link home" href="${workPath(l.id, 'homework')}" title="Домашнее задание: ${esc(l.title)}" aria-label="Домашнее задание: ${esc(l.title)}">ДЗ</a></div></div>`;
  return `<section class="module-card" data-subject="${module.subject}" aria-labelledby="module-${module.id}"><header class="module-header"><div class="module-top"><span class="module-symbol">${icon(module.icon, 23)}</span><span class="module-progress-label">${completed}/${all.length} пройдено</span></div><div class="module-kicker">${subjects[module.subject].short} · Модуль ${module.number}</div><h3 class="module-title" id="module-${module.id}">${module.title}</h3><p class="module-description">${module.description}</p><div class="module-meta"><span>${icon('book', 12)}${list.length} ${plural(list.length, 'урок', 'урока', 'уроков')}</span><span>${icon('pencil', 12)}${fmt(list.length * 48)} вариантов</span><span style="margin-left:auto"><span class="module-progress"><span style="width:${(100 * completed) / all.length}%"></span></span></span></div></header><div class="module-lessons">${list.slice(0, 3).map(row).join('')}<div class="module-extra" id="extra-${module.id}" ${open ? '' : 'hidden'}>${list
    .slice(3)
    .map((l, i) => row(l, i + 3))
    .join(
      ''
    )}</div></div>${list.length > 3 ? `<button class="module-expand" data-action="toggle-module" data-module="${module.id}" aria-expanded="${open}" aria-controls="extra-${module.id}"><span>${open ? 'Свернуть уроки' : `Ещё ${list.length - 3} ${plural(list.length - 3, 'урок', 'урока', 'уроков')} в модуле`}</span>${icon('down', 13)}</button>` : `<div class="module-expand" style="cursor:default"><span>Выбирай урок и начинай</span>${icon('pencil', 12)}</div>`}</section>`;
}
function updateCatalogResults() {
  const found = filteredLessons(),
    done = completedLessons();
  const result = document.getElementById('catalog-results');
  if (!result) return;
  document.getElementById('filter-result').textContent =
    `${found.length} ${plural(found.length, 'урок', 'урока', 'уроков')} · ${modules.filter((m) => found.some((l) => l.module === m.id)).length} ${plural(modules.filter((m) => found.some((l) => l.module === m.id)).length, 'модуль', 'модуля', 'модулей')}`;
  result.innerHTML = found.length
    ? `<div class="module-grid">${modules
        .filter((m) => found.some((l) => l.module === m.id))
        .map((m) =>
          moduleCard(
            m,
            found.filter((l) => l.module === m.id),
            done
          )
        )
        .join('')}</div>`
    : emptyState(
        'Пока ничего не нашлось',
        'Попробуй другое слово или выбери все предметы и уровни. Название учебника тоже можно искать.',
        `<button class="btn btn-primary" data-action="reset-filters">Сбросить фильтры</button>`
      );
}
function plural(n, one, few, many) {
  const a = n % 100,
    b = n % 10;
  return a >= 11 && a <= 14 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
}
function renderLesson(id) {
  const l = getLesson(id);
  if (!l) return renderNotFound();
  setTitle(l.title);
  const module = getModule(l.module);
  const previous = finishedSessions().filter((s) => s.lessonId === id)[0];
  main.innerHTML = `<a class="back-link" href="#/catalog">${icon('back')}Все уроки</a><div class="badges">${subjectBadge(l)}${levelBadge(l)}<span class="badge neutral">Модуль ${module.number}</span></div>${pageHeading(`УРОК ${String(l.number).padStart(2, '0')}`, l.title, l.description)}${l.level === 'extension' ? `<div class="notice warning">${icon('star')}<p>Дополнительная тема. Это опережающий или олимпиадный материал, а не обязательное базовое ядро 7 класса.</p></div>` : ''}<div class="lesson-layout"><section class="card theory-card"><div class="eyebrow">${icon('book', 13)}КОРОТКО О ГЛАВНОМ</div><h2 style="margin-top:14px">Сначала разберёмся</h2><div class="theory-formula">${esc(l.theory.formula)}</div><ol class="theory-rules">${l.theory.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol><div class="example"><span class="example-label">Разберём на примере</span>${esc(l.theory.example)}</div><div class="pitfall">${icon('bulb', 16)}<span>${esc(l.theory.pitfall)}</span></div><div class="lesson-practice"><p>Хочешь ещё потренироваться?<br>В банке этого урока 48 вариантов.</p><a class="btn btn-secondary btn-small" href="${workPath(id, 'practice', newVariant())}">${icon('refresh')}Свободная практика</a></div></section><div><div class="work-cards">${['classwork', 'homework'].map((work, i) => `<section class="work-card ${work}"><span class="work-watermark">${i ? 'ДЗ' : 'КР'}</span><div class="work-icon">${icon(i ? 'homework' : 'pencil')}</div><h2>${workTitles[work]}</h2><p>${i ? 'Закрепи тему самостоятельно. В конце можно отправить результат учителю.' : 'Разберись в заданиях, проверь себя и найди, что стоит повторить.'}</p><div class="work-card-meta"><span>${icon('file', 12)}8 заданий</span><span>${icon('check', 12)}Проверка сразу</span></div><a class="btn ${i ? 'btn-secondary' : 'btn-primary'}" href="${workPath(id, work)}">${i ? 'Открыть домашнее задание' : 'Начать классную работу'} ${icon('arrow')}</a>${i ? `<button class="btn btn-text work-share" data-action="share-work" data-lesson="${id}" style="width:100%;margin-top:8px">${icon('link')}Ссылка для ученика</button>` : ''}</section>`).join('')}</div>${previous ? `<div class="notice">${icon('chart')}<p>Последний результат: <strong>${sessionSummary(previous).correct}/${previous.taskIds.length}</strong>. <a href="#/result/${previous.id}">Посмотреть разбор</a></p></div>` : ''}<div class="muted-box" style="margin-top:18px">Все задачи авторские. Тематическое сопоставление: ${l.umk.map(esc).join(' · ')}. Нумерация уроков — навигация, не календарный план.</div></div></div><div class="notice">${icon('info')}<p>В баллы идёт <strong>первая математическая попытка</strong>. Можно исправлять ошибки и смотреть решения — это помогает учиться, но не меняет уже набранные баллы. Ошибка формата не считается попыткой.</p></div>`;
}
function theoryModal(id) {
  const l = getLesson(id);
  if (!l) return;
  openModal(
    l.title,
    `<div class="badges">${subjectBadge(l)}${levelBadge(l)}</div><div class="theory-formula">${esc(l.theory.formula)}</div><ol class="theory-rules">${l.theory.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol><div class="example"><span class="example-label">Пример</span>${esc(l.theory.example)}</div><div class="pitfall">${icon('bulb', 16)}${esc(l.theory.pitfall)}</div>`,
    `<button class="btn btn-primary" data-action="close-modal">Понятно, решаю дальше ${icon('check')}</button>`
  );
}
function openProfile(callback = null) {
  profileCallback = callback;
  const p = loadState().profile;
  openModal(
    'Подпишем твою тетрадь',
    `<p>Как к тебе обращаться? Достаточно имени или псевдонима — фамилия не нужна. Имя сохранится только в этом браузере.</p><form id="profile-form" class="profile-form"><div><label class="field-label" for="student-name">Имя или псевдоним</label><input class="input" id="student-name" name="name" value="${esc(p.name)}" placeholder="Например, Саша" required minlength="2" maxlength="50" autocomplete="nickname"></div><div><label class="field-label" for="student-class">Класс — по желанию</label><input class="input" id="student-class" name="className" value="${esc(p.className)}" placeholder="Например, 7А" maxlength="12" autocomplete="off"></div><div class="help">Не вводи телефон, адрес, пароль или другие личные данные. Имя попадёт в Telegram только после твоего согласия на отправку конкретной работы.</div><button class="btn btn-primary" type="submit">Сохранить и продолжить ${icon('arrow')}</button></form>`
  );
  setTimeout(() => document.getElementById('student-name')?.focus(), 50);
}
function renderTrainer(id, query) {
  const l = getLesson(id);
  if (!l) return renderNotFound();
  const work = query.get('work') || 'classwork',
    variant = query.get('variant') || '1';
  if (!['classwork', 'homework', 'practice'].includes(work) || !/^[\w-]{1,30}$/.test(variant))
    return renderNotFound();
  setTitle(`${workTitles[work]} · ${l.title}`);
  if (!loadState().profile.name) {
    main.innerHTML = `<a class="back-link" href="${lessonPath(id)}">${icon('back')}К уроку</a>${emptyState('Сначала подпишем тетрадь', 'Имя или псевдоним поможет не потерять твои результаты.', `<button class="btn btn-primary" data-action="profile">Представиться ${icon('pencil')}</button>`)}`;
    openProfile(() => render());
    return;
  }
  let session = loadState().sessions.find(
    (s) => s.status === 'active' && s.lessonId === id && s.work === work && s.variant === variant
  );
  if (!session) {
    const previous = finishedSessions().find(
      (s) => s.lessonId === id && s.work === work && s.variant === variant
    );
    if (previous) {
      main.innerHTML = `<a class="back-link" href="${lessonPath(id)}">${icon('back')}К уроку</a>${emptyState('Этот вариант уже решён', 'Результат сохранён. Можно вернуться к разбору или открыть новый вариант с другими заданиями.', `<a class="btn btn-primary" href="#/result/${previous.id}">Посмотреть результат ${icon('arrow')}</a> <a class="btn btn-secondary" href="${workPath(id, work, newVariant())}">Новый вариант</a>`)}`;
      return;
    }
    session = createSession(id, work, variant, loadState().profile, grading());
    saveSession(session);
  }
  currentSession = session;
  currentSession.current = Math.min(
    Math.max(Number(currentSession.current) || 0, 0),
    session.taskIds.length - 1
  );
  main.innerHTML = `${storageNotice()}<div class="trainer-heading"><div><a class="back-link" href="${lessonPath(id)}">${icon('back')}К уроку</a><h1>${esc(l.title)}</h1><div class="trainer-subtitle">${workTitles[work]} · вариант ${esc(variant)} · ${esc(session.student.name)}${session.student.className ? ' · ' + esc(session.student.className) : ''}</div></div><button class="btn btn-secondary btn-small" data-action="theory" data-lesson="${id}">${icon('book')}Памятка к уроку</button></div><div class="trainer-layout"><div class="trainer-paper" id="question-pane"></div><aside class="trainer-side" aria-label="Статистика текущей работы"><section class="card session-card"><h2>Твоя работа</h2><div id="session-summary"></div><div class="session-timer"><span>${icon('clock')}Активное время</span><strong id="session-timer">${formatTime(session.elapsedSeconds)}</strong></div><p class="help">Баллы — за первую попытку. Исправления остаются в разборе. Время на скрытой вкладке не учитывается.</p></section><section class="session-hint">${icon('bulb', 24)}<h3>Застрял? Бывает.</h3><p>Вспомни правило или посмотри небольшую подсказку.</p><button class="btn" data-action="hint">${icon('bulb', 13)}Дай подсказку</button><button class="btn btn-text" data-action="theory" data-lesson="${id}" style="margin-top:6px">Открыть памятку</button></section><div class="session-side-links"><button class="btn btn-text" data-action="finish-work">Завершить работу ${icon('arrow')}</button></div></aside></div>`;
  renderQuestion();
  updateSessionSummary();
}
function answerHelp(q) {
  return {
    number: [
      'Например, −3 или 1/2',
      'Подойдут число, дробь или десятичная запись. Единицы измерения указывать не нужно.',
    ],
    fraction: [
      'Например, 3/4 или 0,75',
      'Дробь можно не сокращать. Для бесконечной десятичной дроби используй точную запись a/b.',
    ],
    expression: [
      'Например, x^2 + 2x + 1',
      'Степень: <code>x^2</code> или <code>x²</code>. Умножение: <code>2x</code>, <code>ab</code> или <code>a*b</code>. Соблюдай требуемую форму ответа.',
    ],
    coordinates: [
      'Например, (2; −3)',
      'Сначала x, затем y. Разделяй координаты <strong>точкой с запятой</strong>; десятичную дробь можно писать с запятой.',
    ],
    list: [
      q.validation?.subtype === 'text' ? 'Например, AB; BC; AC' : 'Например, −2; 0; 3',
      'Разделитель — точка с запятой. ' +
        (q.validation?.ordered
          ? 'Порядок элементов важен.'
          : 'Порядок не важен. Каждый корень записывай один раз.'),
    ],
    sequence: [
      'Например, 2; 1; 3',
      'Нажимай номера шагов в правильном порядке или введи их через точку с запятой.',
    ],
    text: [
      'Введи название или короткий ответ',
      'Проверяется короткий ответ из условия. Большое доказательство или чертёж оценивает учитель.',
    ],
    choice: ['', 'Выбери один верный вариант и нажми «Проверить».'],
  }[q.type];
}
function renderQuestion() {
  const session = currentSession;
  if (!session) return;
  const id = session.taskIds[session.current],
    q = getTask(id),
    record = session.answers[id] || {},
    input = record.draft || '';
  const checked = record.lastInput === input && typeof record.latestCorrect === 'boolean';
  const feedback =
    formatFeedback?.taskId === id
      ? formatFeedback
      : checked
        ? { kind: record.latestCorrect ? 'correct' : 'wrong', message: record.feedback }
        : null;
  const firstKnown = typeof record.firstCorrect === 'boolean';
  const [placeholder, help] = answerHelp(q);
  const inputHTML =
    q.type === 'choice'
      ? `<fieldset class="choice-grid"><legend class="sr-only">Выбери ответ</legend>${q.options.map((o, i) => `<label class="choice-label ${checked && input === o.value ? (record.latestCorrect ? 'is-correct' : 'is-wrong') : ''}"><input type="radio" name="choice" value="${o.value}" ${input === o.value ? 'checked' : ''}><span class="choice-marker">${'АБВГ'[i] || i + 1}</span><span>${esc(o.label)}</span></label>`).join('')}</fieldset>`
      : `${q.type === 'sequence' ? `<ol class="sequence-steps">${q.steps.map((text, i) => `<li><span class="step-label">${i + 1}</span><span>${esc(text)}</span></li>`).join('')}</ol><div class="sequence-picks">${q.steps.map((_, i) => `<button type="button" class="btn btn-secondary btn-small" data-action="sequence-add" data-number="${i + 1}">${i + 1}</button>`).join('')}<button type="button" class="btn btn-text" data-action="sequence-reset">Сбросить</button></div>` : ''}<label class="field-label" for="answer-input">${q.type === 'sequence' ? 'Твой порядок шагов' : 'Твой ответ'}</label><input class="input answer-input ${checked ? (record.latestCorrect ? 'is-correct' : 'is-wrong') : ''}" id="answer-input" name="answer" type="text" inputmode="text" value="${esc(input)}" placeholder="${esc(placeholder)}" maxlength="320" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="answer-help${feedback ? ' answer-feedback' : ''}" ${checked && !record.latestCorrect ? 'aria-invalid="true"' : ''}>${['number', 'fraction', 'expression', 'coordinates', 'list'].includes(q.type) ? `<div class="math-keyboard" aria-label="Математические символы">${['−', '/', '²', '(', ')', ';'].map((c) => `<button type="button" class="math-key" data-action="math-key" data-value="${esc(c)}" aria-label="Вставить ${esc(c)}">${c}</button>`).join('')}</div>` : ''}`;
  document.getElementById('question-pane').innerHTML =
    `<div class="question-top"><span>ЗАДАНИЕ ${session.current + 1} ИЗ ${session.taskIds.length}</span><span class="question-type">${icon(q.type === 'choice' ? 'grid' : q.type === 'sequence' ? 'file' : 'pencil', 12)}${typeNames[q.type]}</span></div><nav class="task-steps" aria-label="Задания работы">${session.taskIds.map((tid, i) => `<button class="task-step ${i === session.current ? 'current' : ''} ${session.answers[tid]?.firstCorrect === true ? 'correct' : session.answers[tid]?.firstCorrect === false ? 'wrong' : ''}" data-action="go-question" data-index="${i}" aria-label="Задание ${i + 1}${typeof session.answers[tid]?.firstCorrect === 'boolean' ? (session.answers[tid].firstCorrect ? ', верно' : ', ошибка') : ''}" ${i === session.current ? 'aria-current="step"' : ''}>${typeof session.answers[tid]?.firstCorrect === 'boolean' && i !== session.current ? icon(session.answers[tid].firstCorrect ? 'check' : 'close', 13) : i + 1}</button>`).join('')}</nav><div class="question-body"><div class="task-prompt" id="task-prompt">${q.prompt}</div>${q.table ? `<table class="task-table"><thead><tr>${q.table.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${q.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}${renderDiagram(q.diagram)}<form id="answer-form" aria-labelledby="task-prompt">${inputHTML}<p class="help" id="answer-help">${help}</p><div class="question-actions"><button type="submit" id="check-answer" class="btn btn-primary" ${checked && record.latestCorrect ? 'disabled' : ''}>${icon('check')}${record.attempts ? 'Проверить ещё раз' : 'Проверить ответ'}</button><button type="button" class="btn btn-secondary" data-action="next-question" ${firstKnown ? '' : 'disabled'}>${session.current === session.taskIds.length - 1 ? 'К результату' : 'Дальше'} ${icon('arrow')}</button>${!firstKnown ? `<button type="button" class="btn btn-text" data-action="skip-question">Пропустить</button>` : `<button type="button" class="btn btn-text" data-action="solution">Разобрать решение</button>`}</div></form><div class="feedback" id="answer-feedback" role="status" aria-live="polite" ${feedback ? '' : 'hidden'} data-kind="${feedback?.kind || ''}">${feedback ? `${icon(feedback.kind === 'correct' ? 'check' : 'info')}<div><strong>${feedback.kind === 'correct' ? 'Получилось!' : feedback.kind === 'format' ? 'Проверь запись' : 'Пока не совпало'}</strong>${esc(feedback.message)}${record.firstCorrect === false && record.latestCorrect === true ? '<br>Ты исправил ошибку. В баллах сохранена первая попытка.' : ''}</div>` : ''}</div>${
      record.solutionSeen
        ? `<div class="solution"><h3>Разбираемся по шагам</h3><div class="solution-answer">Ответ: ${esc(displayAnswer(q))}</div>${esc(q.explanation)}${
            q.type === 'sequence'
              ? `<ol>${q.answer
                  .split(';')
                  .map((i) => `<li>${esc(q.steps[Number(i.trim()) - 1])}</li>`)
                  .join('')}</ol>`
              : ''
          }</div>`
        : ''
    }${q.lessonId.startsWith('g') ? `<details class="manual-details" ${record.manualComment ? 'open' : ''}><summary>Моё обоснование или описание построения · проверяет учитель</summary><label class="sr-only" for="manual-comment">Описание решения для учителя</label><textarea id="manual-comment" class="input" maxlength="1200" placeholder="Опиши своими словами, почему это верно…">${esc(record.manualComment || '')}</textarea><p class="help">Этот текст не оценивается автоматически и не влияет на баллы. В полный отчёт он войдёт целиком, в Telegram — сокращённо.</p></details>` : ''}</div>`;
}
function updateSessionSummary() {
  if (!currentSession) return;
  const s = sessionSummary(currentSession),
    target = document.getElementById('session-summary');
  if (target)
    target.innerHTML = `<div class="session-counter-row"><span>Верно с первого раза</span><strong>${s.correct}</strong></div><div class="session-counter-row"><span>Первые ошибки</span><strong class="wrong-num">${s.wrong}</strong></div><div class="session-progress-label"><span>Выполнено ${s.answered} из ${s.total}</span><strong>${Math.round(s.progress)}%</strong></div><div class="progress-track" role="progressbar" aria-label="Выполнение работы" aria-valuenow="${Math.round(s.progress)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${s.progress}%"></span></div>`;
}
function readCurrentInput() {
  const q = getTask(currentSession.taskIds[currentSession.current]);
  return q.type === 'choice'
    ? document.querySelector('input[name="choice"]:checked')?.value || ''
    : document.getElementById('answer-input')?.value || '';
}
function storeDraft() {
  if (!currentSession) return;
  const id = currentSession.taskIds[currentSession.current];
  const record = currentSession.answers[id] || { attempts: 0 };
  record.draft = readCurrentInput();
  currentSession.answers[id] = record;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => currentSession && saveSession(currentSession), 250);
}
function clearFeedbackOnEdit() {
  formatFeedback = null;
  const box = document.getElementById('answer-feedback');
  if (box) box.hidden = true;
  document.getElementById('answer-input')?.classList.remove('is-correct', 'is-wrong');
  document.getElementById('answer-input')?.removeAttribute('aria-invalid');
  const btn = document.getElementById('check-answer');
  if (btn) btn.disabled = false;
  document
    .querySelectorAll('.choice-label')
    .forEach((x) => x.classList.remove('is-correct', 'is-wrong'));
}
function handleCheck() {
  if (!currentSession) return;
  const q = getTask(currentSession.taskIds[currentSession.current]);
  const input = readCurrentInput(),
    result = checkSessionAnswer(currentSession, q, input);
  formatFeedback = result.format ? null : { taskId: q.id, kind: 'format', message: result.message };
  saveSession(currentSession);
  renderQuestion();
  updateSessionSummary();
  if (result.correct)
    document.querySelector('[data-action="next-question"]')?.focus({ preventScroll: true });
  else document.getElementById('answer-input')?.focus({ preventScroll: true });
}
function navigateQuestion(index) {
  if (!currentSession) return;
  storeDraft();
  clearTimeout(draftTimer);
  saveSession(currentSession);
  formatFeedback = null;
  currentSession.current = Math.min(Math.max(index, 0), currentSession.taskIds.length - 1);
  saveSession(currentSession);
  renderQuestion();
  document
    .querySelector('.trainer-heading')
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function requestFinish() {
  if (!currentSession) return;
  storeDraft();
  const s = sessionSummary(currentSession);
  if (s.unanswered) {
    openModal(
      'Завершить эту работу?',
      `<p>Пока без ответа <strong>${s.unanswered} ${plural(s.unanswered, 'задание', 'задания', 'заданий')}</strong>. Они останутся в отчёте как пропуски и не принесут баллов.</p><p>После завершения ответы уже не меняются. Разбор и решения будут доступны.</p>`,
      `<button class="btn btn-secondary" data-action="close-modal">Ещё порешаю</button><button class="btn btn-primary" data-action="confirm-finish">Завершить и посмотреть результат</button>`
    );
  } else completeWork();
}
function completeWork() {
  if (!currentSession) return;
  clearTimeout(draftTimer);
  finishSession(currentSession);
  saveSession(currentSession);
  const id = currentSession.id;
  currentSession = null;
  closeModal();
  location.hash = `/result/${id}`;
}
function renderResult(id) {
  const session = findSession(id);
  if (!session || session.status !== 'finished') return renderNotFound();
  const l = getLesson(session.lessonId),
    s = sessionSummary(session),
    report = makeReport(session),
    tg = getTelegramStatus(config.telegram);
  setTitle(`Результат · ${l.title}`);
  const praise =
    s.percent >= 85
      ? 'Отлично получилось!'
      : s.percent >= 50
        ? 'Ещё один шаг вперёд.'
        : 'Разберёмся — и получится.';
  const color = s.percent >= 70 ? '#93ad7c' : s.percent >= 50 ? '#c9b47b' : '#c69f87';
  main.innerHTML = `<a class="back-link" href="${lessonPath(l.id)}">${icon('back')}К уроку</a><section class="result-hero"><div class="result-ring" style="background:conic-gradient(${color} ${s.percent}%,#edf1e4 0)"><div class="result-ring-inner"><strong>${s.correct}<small> / ${s.total}</small></strong><span>С ПЕРВОЙ ПОПЫТКИ</span></div></div><div><div class="eyebrow">РАБОТА ЗАВЕРШЕНА · ${workTitles[session.work]}</div><h1>${praise}</h1><p>${esc(l.title)} · ${esc(session.student.name)}<br>У каждой ошибки есть объяснение. Давай посмотрим вместе.</p><div class="result-facts"><span>${icon('target')}${s.percent.toFixed(1)}% баллов</span><span>${icon('clock')}${formatTime(session.elapsedSeconds)}</span><span>${icon('trophy')}Оценка ${s.grade}</span><span>${icon('pencil')}Вариант ${esc(session.variant)}</span></div></div></section><div class="result-layout"><section class="card"><div class="section-heading"><div><h2>Твоя работа по шагам</h2><p>${s.correct} верно · ${s.wrong} первых ошибок · ${s.unanswered} без ответа</p></div><div class="result-grade">${s.grade}<span> / 5</span></div></div>${report.answers
    .map((a, i) => {
      const q = getTask(a.taskId);
      return `<details class="report-task" ${a.correct ? '' : 'open'}><summary><span class="report-status ${a.correct ? '' : 'wrong'}">${icon(a.correct ? 'check' : 'close', 12)}</span><span><strong>${i + 1}.</strong> ${q.prompt}</span>${icon('chevron', 13)}</summary><div class="report-answer"><p class="${a.correct ? '' : 'bad-answer'}">Твой первый ответ: <strong>${esc(a.studentAnswer)}</strong></p><p>Верный ответ: <strong>${esc(a.expectedAnswer)}</strong></p><p>${esc(q.explanation)}</p>${q.steps ? `<ol>${q.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol><p>Порядок в ответе относится к этим пронумерованным шагам.</p>` : ''}${a.corrected ? '<p>Ошибка исправлена после первой попытки. Это полезная работа!</p>' : ''}${a.manualComment ? `<p><strong>Обоснование — проверяет учитель:</strong><br>${esc(a.manualComment)}</p>` : ''}</div></details>`;
    })
    .join(
      ''
    )}<div class="grade-policy">Пороги этой работы: «5» от ${session.grading.five}%, «4» от ${session.grading.four}%, «3» от ${session.grading.three}%. Ниже — «2». Это настраиваемая учебная шкала, а не единая обязательная шкала ФГОС.<br>ID отчёта: <span class="mono">${esc(session.id)}</span></div><div class="button-row" style="margin-top:20px"><a class="btn btn-primary" href="${workPath(l.id, 'practice', newVariant())}">${icon('refresh')}Ещё потренироваться</a><a class="btn btn-secondary" href="#/catalog">К другим урокам ${icon('arrow')}</a></div></section><div><section class="card send-card"><div class="icon-box">${icon('send', 24)}</div><h2>Покажем учителю?</h2><p>В сообщении будут имя или псевдоним, тема, баллы, оценка, время и список ошибок. Отправка — только с твоего согласия.</p><span class="badge ${session.sentAt ? 'sent' : 'neutral'}">${icon(session.sentAt ? 'check' : 'info', 12)}${session.sentAt ? 'Отправлено в Telegram' : esc(tg.label)}</span>${!tg.available ? `<div class="notice warning">${icon('info')}<p>${esc(tg.error)} <a href="#/settings">Инструкция для учителя</a></p></div>` : ''}${tg.warning ? `<div class="notice warning">${icon('warning')}<p>${esc(tg.warning)}</p></div>` : ''}${!session.sentAt ? `<label class="checkbox-field"><input id="send-consent" type="checkbox"><span>Согласен отправить этот результат и указанный псевдоним в Telegram учителя.</span></label><div class="turnstile-container" id="result-challenge"></div>` : `<p class="small" style="margin-top:16px">Доставка подтверждена ${dateLabel(session.sentAt)}. Повторная отправка этой работы отключена на этом устройстве.</p>`}<button class="btn btn-primary" id="send-report" data-action="send-report" data-session="${id}" disabled>${icon(session.sentAt ? 'check' : 'send')}${session.sentAt ? 'Результат отправлен' : 'Отправить результат'}</button><div id="send-status" class="send-status ${session.sendError ? 'error' : ''}" role="status">${session.sendError ? esc(session.sendError) : ''}</div><button class="btn btn-text" data-action="preview-message" data-session="${id}" style="margin-top:10px">Предпросмотр сообщения ${icon('external', 12)}</button><div class="download-row"><button class="btn btn-secondary" data-action="download-report" data-session="${id}" data-format="txt">${icon('download')}Отчёт TXT</button><button class="btn btn-secondary" data-action="download-report" data-session="${id}" data-format="json">${icon('download')}JSON</button></div><p class="help" style="margin-top:15px">Полный отчёт с обоснованиями можно скачать в любое время. Автоматическая отправка не выполняется.</p></section><div class="notice">${icon('shield')}<p>Это учебный клиентский отчёт. Баллы и имя можно изменить через инструменты браузера — он не заменяет защищённую контрольную работу.</p></div><button class="btn btn-text" data-action="print">${icon('file')}Распечатать разбор</button></div></div>`;
  if (!session.sentAt && tg.available) mountChallenge('result-challenge', config.telegram);
}
async function sendReport(id) {
  const session = findSession(id);
  if (!session || session.status !== 'finished' || session.sentAt || sending.has(id)) return;
  if (!document.getElementById('send-consent')?.checked) {
    showToast('Сначала подтверди согласие на отправку', 'error');
    return;
  }
  if (
    session.sendUncertain &&
    !window.confirm(
      'Предыдущая доставка не подтверждена. Сначала проверь чат: повтор может создать дубликат. Отправить ещё раз?'
    )
  )
    return;
  const button = document.getElementById('send-report'),
    status = document.getElementById('send-status');
  sending.add(id);
  button.disabled = true;
  button.innerHTML = `${icon('clock')}Отправляем…`;
  status.textContent = 'Ждём подтверждение Telegram.';
  status.classList.remove('error');
  try {
    const result = await sendToTelegram(makeReport(session), config.telegram, {
      turnstileToken: getChallengeToken('result-challenge'),
    });
    // Очистка данных во время ожидания не должна воскресить удалённый отчёт.
    if (!findSession(id)) return;
    session.sentAt = new Date().toISOString();
    session.telegramMessageId = result.messageId;
    session.sendError = '';
    session.sendUncertain = false;
    saveSession(session);
    showToast('Telegram подтвердил доставку');
    if (parseRoute().page === 'result' && parseRoute().id === id) renderResult(id);
  } catch (error) {
    if (!findSession(id)) return;
    session.sendError = error.message;
    session.sendUncertain = !!error.uncertain;
    saveSession(session);
    if (document.getElementById('send-status')) {
      status.textContent = error.message;
      status.classList.add('error');
      button.innerHTML = `${icon('send')}Повторить отправку`;
      button.disabled = false;
    }
    resetChallenge('result-challenge');
  } finally {
    sending.delete(id);
  }
}
function savedSessionRow(s) {
  const l = getLesson(s.lessonId),
    n = sessionSummary(s);
  return `<div class="saved-session"><span class="saved-icon">${icon(subjects[l.subject].icon)}</span><div class="saved-main"><a class="saved-title" href="${s.status === 'finished' ? `#/result/${s.id}` : workPath(s.lessonId, s.work, s.variant)}">${esc(l.title)}</a><div class="saved-meta"><span>${workTitles[s.work]}</span><span>Вариант ${esc(s.variant)}</span><span>${dateLabel(s.finishedAt || s.updatedAt)}</span>${s.sentAt ? '<span>✓ В Telegram</span>' : ''}</div></div><div class="saved-score"><strong>${n.correct}/${n.total}</strong>${s.status === 'finished' ? n.percent.toFixed(0) + '%' : `${n.answered} выполнено`}</div>${s.status === 'finished' ? `<span class="saved-grade">${n.grade}</span><a class="icon-btn" href="#/result/${s.id}" aria-label="Разбор: ${esc(l.title)}">${icon('chevron')}</a>` : `<a class="btn btn-soft btn-small" href="${workPath(s.lessonId, s.work, s.variant)}">Продолжить</a>`}</div>`;
}
function renderStats() {
  setTitle('Мой прогресс');
  const all = finishedSessions(),
    total = all.reduce((n, s) => n + s.taskIds.length, 0),
    correct = all.reduce((n, s) => n + sessionSummary(s).correct, 0),
    pct = total ? (100 * correct) / total : 0,
    avg = all.length ? all.reduce((n, s) => n + sessionSummary(s).grade, 0) / all.length : 0,
    done = completedLessons();
  const days = Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - 6 + i);
      const end = new Date(day);
      end.setDate(end.getDate() + 1);
      return {
        label: day.toLocaleDateString('ru-RU', { weekday: 'short' }),
        count: all.filter((s) => new Date(s.finishedAt) >= day && new Date(s.finishedAt) < end)
          .length,
      };
    }),
    max = Math.max(1, ...days.map((d) => d.count));
  main.innerHTML = `${pageHeading('ШАГ ЗА ШАГОМ', 'Мой прогресс', 'Не сравнивай себя с другими. Сравни с тем, что умел вчера.', `<button class="btn btn-secondary" data-action="export-all" ${all.length ? '' : 'disabled'}>${icon('download')}Скачать статистику</button>`)}<div class="notice">${icon('shield')}<p>Статистика только этого браузера. Без аккаунта она не синхронизируется между устройствами. Сохраняются 200 последних работ; очистка данных браузера удалит их.</p></div><div class="stat-grid">${[
    ['book', done.size, 'уроков с завершённой работой'],
    ['pencil', fmt(total), 'заданий в завершённых работах'],
    ['target', all.length ? pct.toFixed(0) + '%' : '—', 'верно с первой попытки'],
    ['trophy', all.length ? avg.toFixed(1) : '—', 'средняя учебная оценка'],
  ]
    .map(
      ([i, n, t]) =>
        `<div class="stat-card">${icon(i, 23)}<div class="stat-value">${n}</div><div class="stat-label">${t}</div></div>`
    )
    .join(
      ''
    )}</div><div class="stats-layout"><section class="card"><h2>Знакомые страницы</h2>${Object.entries(
    subjects
  )
    .map(([id, subject]) => {
      const subset = lessons.filter((l) => l.subject === id),
        count = subset.filter((l) => done.has(l.id)).length;
      return `<div class="subject-progress"><div class="subject-progress-head"><strong>${subject.title}</strong><span>${count} из ${subset.length}</span></div><div class="progress-track"><span style="width:${(100 * count) / subset.length}%;${id === 'geometry' ? 'background:#af9bbf' : id === 'statistics' ? 'background:#c9ac7e' : ''}"></span></div></div>`;
    })
    .join(
      ''
    )}</section><section class="card"><h2>Последние семь дней</h2><div class="activity-bars" aria-label="Количество завершённых работ за каждый день">${days.map((d) => `<div class="activity-day"><span class="activity-number">${d.count}</span><div class="activity-bar" style="height:${Math.max(3, (100 * d.count) / max)}px" title="${d.label}: ${d.count}"></div><span>${d.label}</span></div>`).join('')}</div></section></div>${activeSessions().length ? `<div class="section-heading"><h2>Ждут продолжения</h2></div><div class="session-list" style="margin-bottom:30px">${activeSessions().slice(0, 8).map(savedSessionRow).join('')}</div>` : ''}<div class="section-heading"><div><h2>История работ</h2><p>Первая попытка — в баллах, исправления — в разборе.</p></div>${all.length ? `<button class="btn btn-text" data-action="export-csv">CSV ${icon('download')}</button>` : ''}</div>${all.length ? `<div class="session-list">${all.map(savedSessionRow).join('')}</div><button class="btn btn-text" data-action="clear-progress" style="margin-top:23px;color:#b79e83">${icon('trash')}Очистить историю на этом устройстве</button>` : emptyState('Здесь появятся твои победы', 'Закончи первую классную или домашнюю работу — и увидишь, как растёт твоя уверенность.', `<a class="btn btn-primary" href="#/catalog">Выбрать урок ${icon('arrow')}</a>`)}`;
}
function renderHomework() {
  setTitle('Домашние задания');
  const homework = loadState().sessions.filter((s) => s.work === 'homework'),
    tg = getTelegramStatus(config.telegram);
  main.innerHTML = `${pageHeading('САМОСТОЯТЕЛЬНО — НЕ ЗНАЧИТ В ОДИНОЧКУ', 'Домашние задания', 'Открой ДЗ из нужного урока или перейди по ссылке учителя. Результат сохранится здесь.')}<div class="notice ${tg.available ? '' : 'warning'}">${icon(tg.available ? 'send' : 'info')}<p><strong>${esc(tg.label)}.</strong> ${tg.available ? 'После завершения нажми «Отправить результат» и подтверди согласие.' : 'Пока можно скачать полный отчёт. Учитель подключает отправку в разделе «Уголок учителя».'}</p></div>${homework.length ? `<div class="session-list">${homework.map(savedSessionRow).join('')}</div><a class="btn btn-primary" style="margin-top:25px" href="#/catalog">Выбрать другое ДЗ ${icon('arrow')}</a>` : emptyState('Чистая страница для самостоятельной работы', 'Здесь будут начатые и выполненные домашние задания. В каждом уроке для ДЗ есть свой набор задач.', `<a class="btn btn-primary" href="#/catalog">Выбрать тему ${icon('arrow')}</a>`)}<div class="program-intro section-spacer"><section class="card"><div class="eyebrow">КАК УСТРОЕНО ДЗ</div><h2 style="margin-top:12px">Тема та же. Задачи другие.</h2><p>У классной и домашней работы одного варианта нет общих заданий. Ссылку на фиксированный вариант можно получить на странице урока.</p></section><section class="card"><div class="eyebrow">ВАЖНО</div><h2 style="margin-top:12px">Баллы — это ориентир.</h2><p>Результат считается по первой попытке. Полные доказательства и текстовые описания построений проверяет учитель; автоматическая проверка их не заменяет.</p></section></div>`;
}
function renderTheory() {
  setTitle('Теория и формулы');
  main.innerHTML = `${pageHeading('ПРАВИЛА БЕЗ ЛИШНЕГО', 'Теория и формулы', 'Короткие памятки, примеры и подсказки — к каждому уроку.')}<div class="search-field" style="margin-bottom:24px">${icon('search')}<label class="sr-only" for="theory-search">Поиск в памятках</label><input id="theory-search" type="search" placeholder="Какое правило вспомним?" maxlength="100"></div><div id="theory-results"></div>`;
  updateTheoryResults('');
}
function updateTheoryResults(query) {
  const text = query.toLowerCase().replace(/ё/g, 'е'),
    found = lessons.filter((l) =>
      (l.title + ' ' + l.theory.formula + ' ' + l.tags.join(' '))
        .toLowerCase()
        .replace(/ё/g, 'е')
        .includes(text)
    );
  document.getElementById('theory-results').innerHTML = found.length
    ? `<div class="theory-grid">${found.map((l) => `<article class="memo-card"><div class="badges">${subjectBadge(l)}${levelBadge(l)}</div><h2>${esc(l.title)}</h2><div class="memo-formula">${esc(l.theory.formula)}</div><button class="btn btn-text" data-action="theory" data-lesson="${l.id}">Открыть памятку ${icon('arrow')}</button></article>`).join('')}</div>`
    : emptyState(
        'Такого правила пока не нашли',
        'Попробуй короче: «степень», «угол» или «система».'
      );
}
function renderProgram() {
  setTitle('Программа 7 класса');
  const counts = Object.fromEntries(
    Object.keys(levels).map((key) => [key, lessons.filter((l) => l.level === key).length])
  );
  main.innerHTML = `${pageHeading('МЕТОДИЧЕСКАЯ КАРТА', 'Вся программа 7 класса', 'Базовое ядро, углубление и дополнительные темы отмечены раздельно. Сопоставление выполнено по федеральным рабочим программам 2025 года.')}<div class="badges">${Object.entries(
    counts
  )
    .map(
      ([id, n]) =>
        `<span class="badge ${id}">${levels[id].title}: ${n} ${plural(n, 'тема', 'темы', 'тем')}</span>`
    )
    .join(
      ''
    )}</div><div class="program-intro section-spacer"><section class="card"><h2>Сначала — федеральное ядро</h2><p>Алгебра: 102 ч, геометрия: 68 ч, отдельный курс «Вероятность и статистика»: 34 ч в базовом плане. Наши ${lessons.length} тематических урока — не замена этим учебным часам.</p><p>Включены темы, которые легко пропустить по старому оглавлению: y = |x|, осевая симметрия, медиана к гипотенузе, ГМТ, окружность и касательная.</p></section><section class="card"><h2>УМК — не ярлык сложности</h2><p>Макарычев — опора для базовой последовательности. Петерсон, Абраров, Чуткова — базовый материал с расширениями. Из Галицкого 8–9 классов берётся только повторение 7 класса. Гордин — дополнительный задачник.</p><p>Конкретное издание «Кутузова» не указано: неподтверждённое оглавление ему не приписывается. Нужны автор, название и год для точного сопоставления.</p></section></div><div class="notice">${icon('info')}<p>Углублённый курс включает базовое ядро. Метка «Углублённый» ниже обозначает добавленные темы или более сложный аппарат. «Дополнительно» — авторское расширение, не обязательное ядро 7 класса.</p></div>${modules
    .map((m, i) => {
      const list = lessons.filter((l) => l.module === m.id);
      return `<details class="program-module" ${i === 0 ? 'open' : ''}><summary><span class="module-symbol">${icon(m.icon, 21)}</span><h2>${subjects[m.subject].short} · ${m.title}</h2><span>${list.length} ${plural(list.length, 'тема', 'темы', 'тем')}</span>${icon('chevron', 15)}</summary><table class="program-table"><thead><tr><th>№</th><th>Тема и содержание</th><th>Уровень</th><th>Тематическая опора</th></tr></thead><tbody>${list.map((l) => `<tr><td>${l.id.toUpperCase()}</td><td><a class="program-topic-title" href="${lessonPath(l.id)}">${esc(l.title)}</a><span class="program-topic-description">${esc(l.description)} ${esc(l.theory.rules[0])}</span></td><td>${levelBadge(l)}</td><td>${l.umk.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></details>`;
    })
    .join(
      ''
    )}<section class="card section-spacer"><h2>Источники и границы сопоставления</h2><ul class="source-list">${sources.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${esc(s.title)}${icon('external', 13)}</a><p>${esc(s.detail)}</p></li>`).join('')}</ul><div class="notice warning">${icon('book')}<p>Перечень покрывает основные тематические линии двух уровней. Это авторский вспомогательный тренажёр, а не официально утверждённая рабочая программа или полная замена учебника, живого доказательства и построений на бумаге. Точное поурочное сопоставление с УМК требует конкретного издания.</p></div></section>`;
}
function renderSettings() {
  setTitle('Уголок учителя');
  const tg = getTelegramStatus(config.telegram),
    g = grading();
  main.innerHTML = `${pageHeading('ВЗРОСЛЫМ ТОЖЕ НУЖНА ПАМЯТКА', 'Уголок учителя', 'Публикация на GitHub Pages, отправка результатов и понятная шкала оценивания.')}<div class="notice warning">${icon('warning')}<p><strong>Не вставляйте токены в чат, исходники или поля сайта.</strong> Если токен уже был отправлен в переписку, сначала отзовите его и выпустите новый. Настройки ниже публичны: это не закрытый кабинет учителя.</p></div><div class="settings-layout"><div><section class="card"><h2>Telegram: проверка связи</h2><div class="settings-status ${tg.available ? 'connected' : ''}"><span class="status-dot"></span>${esc(tg.label)}</div><p>${tg.available ? 'Конфигурация загружена. Можно отправить одно тестовое сообщение без данных ученика.' : esc(tg.error)}</p>${tg.warning ? `<div class="notice warning">${icon('warning')}<p>${esc(tg.warning)}</p></div>` : ''}<div class="turnstile-container" id="settings-challenge"></div><button class="btn btn-primary" data-action="test-telegram" id="test-telegram" ${tg.available ? '' : 'disabled'}>${icon('send')}Отправить тестовое сообщение</button><div class="send-status" id="test-status" role="status"></div></section><section class="card"><h2>Подключение в пять шагов</h2><ol class="steps-list"><li><strong>Новый бот и безопасный токен</strong>В @BotFather: /newbot. Если токен раскрыт, /revoke, затем новый токен. Откройте личный чат со своим ботом и нажмите /start.</li><li><strong>Проверьте chat_id</strong>В @userinfobot можно узнать личный ID. Надёжная проверка: getUpdates вашего бота после /start; нужен message.chat.id, а не ID самого бота. Для группы ID обычно отрицательный.</li><li><strong>Создайте публичный репозиторий</strong>Загрузите весь проект, включая папку .github. Ветка — main. Settings → Pages → Source → GitHub Actions.</li><li><strong>Добавьте два GitHub Secrets</strong>Settings → Secrets and variables → Actions → New repository secret: <code>TELEGRAM_BOT_TOKEN</code> и <code>TELEGRAM_CHAT_ID</code>. Не добавляйте их в файлы.</li><li><strong>Выберите режим и выполните деплой</strong>Для прямой отправки в Repository Variables: <code>TELEGRAM_MODE=direct</code>, <code>ALLOW_UNSAFE_DIRECT=true</code>. Затем push в main или Actions → workflow «Проверить и опубликовать Тетрадь 7» → Run workflow. Для безопасного токена используйте режим proxy и прилагаемый Worker.</li></ol><div class="notice warning">${icon('shield')}<p>В режиме direct Actions сохраняет секреты вне git, <strong>но публикует их внутри config.js на сайте</strong>. Это не защита токена. У Bot API нет настройки «этот токен только для sendMessage в один чат». Права в группе не устраняют риск. Для рабочего школьного бота рекомендуем Worker с фиксированным chat_id, антиспамом и токеном в серверном Secret.</p></div></section><section class="card"><h2>Если сообщение не пришло</h2><p><strong>401:</strong> токен недействителен. <strong>400:</strong> неверный chat_id или чат с ботом не начат. <strong>403:</strong> бот заблокирован или не имеет прав писать. <strong>429:</strong> нужно подождать указанное время.</p><p>При обрыве сети доставка может быть неопределённой. Автоповторов нет: сначала проверьте чат, затем повторите вручную. Не используйте fetch с no-cors — он скрывает ответ и не подтверждает доставку.</p></section></div><div><section class="card"><h2>Учебная шкала оценок</h2><p>ФГОС не задаёт единую обязательную таблицу процентов. Установите пороги в соответствии с локальными документами школы.</p><form id="grading-form"><div class="grading-fields">${[
    ['five', '5'],
    ['four', '4'],
    ['three', '3'],
  ]
    .map(
      ([key, label]) =>
        `<label>«${label}» от, %<input class="input" name="${key}" type="number" min="1" max="100" step="1" value="${g[key]}" required></label>`
    )
    .join(
      ''
    )}</div><button class="btn btn-secondary" type="submit">${icon('check')}Сохранить здесь</button><p class="help">Изменение действует только в этом браузере и только для новых работ. Для всех учеников задайте grading в site/config.js и повторите деплой.</p></form></section><section class="card theory-card"><div class="eyebrow">КАК ИДУТ ДАННЫЕ</div><h2 style="margin-top:13px">Без своего сервера</h2><div class="code-block">GitHub main\n    ↓ GitHub Actions\nGitHub Pages · статика\n    ↓ кнопка ученика + согласие\nTelegram Bot API\n\nБезопаснее для токена:\nPages → Cloudflare Worker\n         → Telegram Bot API</div><p>GitHub Actions только собирает и публикует сайт. Он не принимает ответы учеников и не служит публичным API. GitHub PAT браузеру не нужен.</p></section><section class="card"><h2>Честные ограничения</h2><p>Ученик может изменить локальные баллы и имя. Прокси скрывает токен, но сам по себе не подтверждает личность и решение. Для аттестации нужен серверный контроль заданий и авторизация.</p><p>Полный чертёж или произвольное доказательство не оценивается сравнением строк. Здесь автоматически проверяются вычисления, короткие названия, выбор и порядок шагов. Обоснования передаются учителю без оценки.</p><a class="btn btn-text" href="#/privacy">Данные и согласие ${icon('arrow')}</a></section></div></div>`;
  if (tg.available) mountChallenge('settings-challenge', config.telegram);
}
function renderPrivacy() {
  setTitle('О данных');
  main.innerHTML = `${pageHeading('БЕЗ ЛИШНИХ ДАННЫХ', 'Твоя тетрадь — на твоём устройстве', 'Как хранятся результаты и что происходит при отправке учителю.')}<article class="prose"><h2>Что остаётся в браузере</h2><p>Имя или псевдоним, необязательное обозначение класса, черновики ответов, время активной работы и результаты сохраняются в localStorage этого сайта. Серверной базы учеников, сторонней аналитики и рекламных трекеров нет. Шрифты и все учебные ресурсы включены в проект.</p><p>Данные не синхронизируются между устройствами. В приватном режиме или при запрете хранилища сохранение может не работать. Хранятся 200 последних работ. Очистка данных браузера удаляет историю; перед этим можно скачать JSON или TXT.</p><h2>Что попадает в Telegram</h2><p>Только после нажатия «Отправить результат» и отдельного согласия: указанное имя или псевдоним, класс при заполнении, тема, вариант, баллы, оценка, активное время, ошибки и сокращённые обоснования. Полный отчёт можно скачать без отправки. Тест связи не содержит данных ученика.</p><p>Получатель задаётся учителем. Telegram обрабатывает сообщение на своей инфраструктуре. Если учитель включил прокси с Turnstile, загружается антиспам-скрипт Cloudflare; сервис обрабатывает технические сведения, в том числе IP-адрес. Ограничитель частоты запросов использует IP в оперативной памяти сервера, без базы профилей. Учителю необходимо отдельно определить правовое основание обработки данных детей, порядок согласий, круг доступа и срок хранения. Этот технический шаблон не заменяет политику школы и необходимые согласия. Используйте псевдоним и не вводите телефон, адрес, фамилию или другие ненужные данные.</p><h2>Что защищает и чего не защищает проект</h2><p>В исходниках нет настоящих ключей. Но подстановка токена в публичный JavaScript делает его доступным посетителям. Режим direct разрешается только с явным принятием риска; в обычной конфигурации отправка отключена. Прокси Worker оставляет токен на серверной стороне и фиксирует получателя; для антиспама предусмотрены проверка Origin, ограничение размера, Turnstile (включён по умолчанию в Worker) и ограничение частоты запросов в памяти сервера. Origin не является авторизацией.</p><p>Оценки вычисляются в браузере. Их нельзя считать заверенными или защищёнными от изменения. Это инструмент тренировки и обратной связи, не система проведения экзаменов.</p><h2>Управление данными</h2><div class="button-row"><button class="btn btn-secondary" data-action="export-all">${icon('download')}Скачать результаты</button><button class="btn btn-danger" data-action="clear-all">${icon('trash')}Удалить все мои данные здесь</button></div><h2>Об авторстве</h2><p>Этот проект использует идею разделения уроков на классные и домашние работы, но не связан с автором исходного сайта-примера. Код, оформление, памятки и параметрические задачи подготовлены заново. Названия учебников используются для методического сопоставления, а не заявления об одобрении проекта их авторами.</p></article>`;
}
function renderNotFound() {
  setTitle('Страница не найдена');
  main.innerHTML = emptyState(
    'Этой страницы в тетради нет',
    'Возможно, ссылка неполная или работа была удалена из этого браузера.',
    `<a class="btn btn-primary" href="#/catalog">Открыть все уроки ${icon('arrow')}</a>`
  );
}
function render() {
  if (rendering) return;
  rendering = true;
  try {
    if (currentSession?.status === 'active') {
      clearTimeout(draftTimer);
      saveSession(currentSession);
    }
    currentSession = null;
    formatFeedback = null;
    currentRoute = parseRoute();
    renderShell(currentRoute.page);
    const { page, id, query } = currentRoute;
    if (page === 'catalog') renderCatalog();
    else if (page === 'lesson') renderLesson(id);
    else if (page === 'train') renderTrainer(id, query);
    else if (page === 'result') renderResult(id);
    else if (page === 'stats') renderStats();
    else if (page === 'homework') renderHomework();
    else if (page === 'theory') renderTheory();
    else if (page === 'program') renderProgram();
    else if (page === 'settings') renderSettings();
    else if (page === 'privacy') renderPrivacy();
    else renderNotFound();
  } catch (error) {
    console.error('Не удалось отобразить страницу:', error.name);
    main.innerHTML = emptyState(
      'Не удалось открыть эту страницу',
      'Попробуй перейти к урокам. Если локальные данные повреждены, их можно удалить в разделе «О данных».',
      `<a class="btn btn-primary" href="#/catalog">Все уроки</a> <a class="btn btn-secondary" href="#/privacy">О данных</a>`
    );
  } finally {
    rendering = false;
  }
}
function exportAll() {
  const reports = finishedSessions().map(makeReport);
  downloadFile(
    'tetrad7-results.json',
    JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), reports }, null, 2)
  );
  showToast('Результаты сохранены в JSON');
}
function exportCSV() {
  const cell = (value) => {
    let s = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [
    [
      'Ученик',
      'Класс',
      'Тема',
      'Тип работы',
      'Вариант',
      'Баллы',
      'Всего',
      'Процент',
      'Оценка',
      'Активное время',
      'Дата',
      'ID',
    ],
    ...finishedSessions().map((s) => {
      const r = makeReport(s);
      return [
        r.student.name,
        r.student.className,
        r.lessonTitle,
        r.workTitle,
        r.variant,
        r.correct,
        r.total,
        r.percent.toFixed(1),
        r.grade,
        formatTime(r.durationSeconds),
        r.finishedAt,
        r.id,
      ];
    }),
  ];
  downloadFile(
    'tetrad7-statistics.csv',
    '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n'),
    'text/csv;charset=utf-8'
  );
}
function shareWork(id) {
  const l = getLesson(id);
  if (!l) return;
  openModal(
    'Домашнее задание по ссылке',
    `<p><strong>${esc(l.title)}</strong>. Для одинакового варианта все ученики получат один и тот же набор. Ответы и имя не включаются в ссылку.</p><label class="field-label" for="assignment-variant">Номер варианта</label><input class="input" id="assignment-variant" value="1" type="number" min="1" max="999999" step="1"><label class="field-label" style="margin-top:18px" for="assignment-link">Ссылка на ДЗ</label><input class="input" id="assignment-link" readonly value="${esc(fullLink(workPath(id, 'homework', '1')))}"><p class="help">Отправьте ученику эту ссылку привычным способом. Список заданных учителем работ не хранится на сервере: здесь нет закрытого учительского кабинета.</p>`,
    `<button class="btn btn-primary" data-action="copy-assignment" data-lesson="${id}">${icon('link')}Скопировать ссылку</button>`
  );
}
function openMenu(open) {
  document.getElementById('sidebar').classList.toggle('is-open', open);
  document.getElementById('sidebar-overlay').hidden = !open;
  document.querySelector('[data-action="open-menu"]')?.setAttribute('aria-expanded', String(open));
}
document.addEventListener('submit', (event) => {
  if (event.target.id === 'answer-form') {
    event.preventDefault();
    handleCheck();
  }
  if (event.target.id === 'profile-form') {
    event.preventDefault();
    const data = new FormData(event.target),
      name = String(data.get('name') || '').trim();
    if (name.length < 2) {
      showToast('Нужно хотя бы два символа в имени', 'error');
      return;
    }
    saveProfile({ name, className: data.get('className') });
    closeModal();
    const cb = profileCallback;
    profileCallback = null;
    showToast('Тетрадь подписана');
    if (cb) cb();
    else render();
  }
  if (event.target.id === 'grading-form') {
    event.preventDefault();
    const data = new FormData(event.target),
      g = {
        five: Number(data.get('five')),
        four: Number(data.get('four')),
        three: Number(data.get('three')),
      };
    if (!validateGrading(g)) {
      showToast('Пороги должны идти по убыванию: 5 > 4 > 3, от 1 до 100%', 'error');
      return;
    }
    savePreferences({ grading: g });
    showToast('Пороги сохранены для новых работ в этом браузере');
  }
});
document.addEventListener('input', (event) => {
  const t = event.target;
  if (t.id === 'catalog-search') {
    filters.search = t.value;
    persistFilters();
    updateCatalogResults();
  }
  if (t.id === 'theory-search') updateTheoryResults(t.value);
  if (t.id === 'answer-input') {
    storeDraft();
    clearFeedbackOnEdit();
  }
  if (t.id === 'manual-comment' && currentSession) {
    const id = currentSession.taskIds[currentSession.current];
    currentSession.answers[id] ??= { attempts: 0, draft: '' };
    currentSession.answers[id].manualComment = t.value.slice(0, 1200);
    saveSession(currentSession);
  }
  if (t.id === 'assignment-variant') {
    const button = document.querySelector('[data-action="copy-assignment"]'),
      n = String(Math.min(999999, Math.max(1, parseInt(t.value) || 1)));
    document.getElementById('assignment-link').value = fullLink(
      workPath(button.dataset.lesson, 'homework', n)
    );
  }
});
document.addEventListener('change', (event) => {
  const t = event.target;
  if (t.id === 'level-filter') {
    filters.level = t.value;
    persistFilters();
    updateCatalogResults();
  }
  if (t.name === 'choice') {
    storeDraft();
    clearFeedbackOnEdit();
  }
  if (t.id === 'send-consent') {
    const button = document.getElementById('send-report');
    if (button) button.disabled = !t.checked || !getTelegramStatus(config.telegram).available;
  }
});
document.addEventListener('click', async (event) => {
  if (event.target.closest('a[href^="#/"]')) {
    openMenu(false);
    if (document.getElementById('modal').open) closeModal();
  }
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  if (action === 'open-menu')
    openMenu(!document.getElementById('sidebar').classList.contains('is-open'));
  if (action === 'close-modal') closeModal();
  if (action === 'profile') openProfile();
  if (action === 'help')
    openModal(
      'Учиться — по одному шагу',
      `<ol class="steps-list"><li><strong>Выбери тему</strong>В каждом модуле есть уроки с понятными памятками и примерами.</li><li><strong>Порешай и проверь</strong>Классная и домашняя работа содержат по 8 разных заданий. Вводи число, дробь, выражение, координаты или выбирай вариант. Нажимай «Проверить» или Enter.</li><li><strong>Разберись в ошибках</strong>Ответ сразу станет зелёным или красным. Первая попытка идёт в баллы, повторные помогают учиться. В конце — разбор, оценка и отчёт учителю.</li></ol><div class="muted-box">Углублённые темы отмечены фиолетовым, опережающие — золотистым. Начинай с базовых, если пока не уверен.</div>`,
      `<button class="btn btn-primary" data-action="close-modal">Всё понятно ${icon('arrow')}</button>`
    );
  if (action === 'filter-subject') {
    filters.subject = target.dataset.subject;
    persistFilters();
    document.querySelectorAll('[data-action="filter-subject"]').forEach((b) => {
      const active = b === target;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    updateCatalogResults();
  }
  if (action === 'reset-filters') {
    filters = { subject: 'all', level: 'all', search: '' };
    persistFilters();
    renderCatalog();
  }
  if (action === 'toggle-module') {
    const id = target.dataset.module,
      box = document.getElementById(`extra-${id}`),
      open = box.hidden;
    box.hidden = !open;
    target.setAttribute('aria-expanded', String(open));
    target.querySelector('span').textContent = open
      ? 'Свернуть уроки'
      : `Ещё ${box.children.length} ${plural(box.children.length, 'урок', 'урока', 'уроков')} в модуле`;
    if (open) openedModules.add(id);
    else openedModules.delete(id);
  }
  if (action === 'theory') theoryModal(target.dataset.lesson);
  if (action === 'share-work') shareWork(target.dataset.lesson);
  if (action === 'copy-assignment') copyText(document.getElementById('assignment-link').value);
  if (action === 'math-key') {
    const input = document.getElementById('answer-input');
    if (!input) return;
    const start = input.selectionStart ?? input.value.length,
      end = input.selectionEnd ?? start;
    input.setRangeText(target.dataset.value, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus({ preventScroll: true });
  }
  if (action === 'sequence-add') {
    const input = document.getElementById('answer-input'),
      number = target.dataset.number,
      values = input.value
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!values.includes(number)) {
      values.push(number);
      input.value = values.join('; ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (action === 'sequence-reset') {
    const input = document.getElementById('answer-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (action === 'go-question') navigateQuestion(Number(target.dataset.index));
  if (action === 'next-question' || action === 'skip-question') {
    if (!currentSession) return;
    if (currentSession.current < currentSession.taskIds.length - 1)
      navigateQuestion(currentSession.current + 1);
    else requestFinish();
  }
  if (action === 'finish-work') requestFinish();
  if (action === 'confirm-finish') completeWork();
  if (action === 'hint' && currentSession) {
    const q = getTask(currentSession.taskIds[currentSession.current]);
    if (!currentSession.hints.includes(q.id)) currentSession.hints.push(q.id);
    saveSession(currentSession);
    openModal(
      'Маленькая подсказка',
      `<div class="example"><span class="example-label">${esc(getLesson(q.lessonId).title)}</span>${esc(q.hint)}</div><p>Попробуй применить это правило к данным задачи. Если пока не получается — открой памятку.</p>`,
      `<button class="btn btn-secondary" data-action="theory" data-lesson="${q.lessonId}">${icon('book')}Памятка</button><button class="btn btn-primary" data-action="close-modal">Попробую ещё ${icon('arrow')}</button>`
    );
  }
  if (action === 'solution' && currentSession) {
    const id = currentSession.taskIds[currentSession.current];
    currentSession.answers[id].solutionSeen = true;
    saveSession(currentSession);
    renderQuestion();
  }
  if (action === 'send-report') await sendReport(target.dataset.session);
  if (action === 'preview-message') {
    const s = findSession(target.dataset.session);
    if (s)
      openModal(
        'Что увидит учитель',
        `<div class="muted-box" style="font-size:12px;line-height:2">${buildTelegramMessage(makeReport(s)).replace(/\n/g, '<br>')}</div><p class="help">Это только предпросмотр. Сообщение ещё не отправлено.</p>`,
        `<button class="btn btn-primary" data-action="close-modal">Понятно</button>`
      );
  }
  if (action === 'download-report') {
    const s = findSession(target.dataset.session);
    if (s) {
      const r = makeReport(s),
        json = target.dataset.format === 'json';
      downloadFile(
        `tetrad7-${s.lessonId}-${s.variant}.${json ? 'json' : 'txt'}`,
        json ? JSON.stringify(r, null, 2) : reportAsText(r),
        json ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8'
      );
      showToast('Полный отчёт скачан');
    }
  }
  if (action === 'export-all') exportAll();
  if (action === 'export-csv') exportCSV();
  if (action === 'print') window.print();
  if (action === 'clear-progress')
    openModal(
      'Удалить историю работ?',
      `<p>Будут удалены все начатые и завершённые работы в этом браузере. Имя и настройки останутся. Это действие нельзя отменить.</p><p>Если результаты ещё нужны, сначала скачай их.</p>`,
      `<button class="btn btn-secondary" data-action="close-modal">Отмена</button><button class="btn btn-danger" data-action="confirm-clear-progress">Удалить историю</button>`
    );
  if (action === 'confirm-clear-progress') {
    clearTimeout(draftTimer);
    currentSession = null;
    clearProgress();
    closeModal();
    renderStats();
    showToast('История удалена с этого устройства');
  }
  if (action === 'clear-all')
    openModal(
      'Удалить все локальные данные?',
      `<p>Имя, настройки, черновики и результаты будут удалены из этого браузера. Сообщения, ранее доставленные в Telegram, это не удалит.</p>`,
      `<button class="btn btn-secondary" data-action="close-modal">Отмена</button><button class="btn btn-danger" data-action="confirm-clear-all">Удалить всё</button>`
    );
  if (action === 'confirm-clear-all') {
    clearTimeout(draftTimer);
    currentSession = null;
    clearAll();
    closeModal();
    filters = { subject: 'all', level: 'all', search: '' };
    location.hash = '/catalog';
    render();
    showToast('Локальные данные удалены');
  }
  if (action === 'test-telegram') {
    const box = document.getElementById('test-status');
    target.disabled = true;
    target.innerHTML = `${icon('clock')}Проверяем…`;
    box.classList.remove('error');
    box.textContent = '';
    try {
      await sendToTelegram({ test: true }, config.telegram, {
        turnstileToken: getChallengeToken('settings-challenge'),
      });
      box.textContent = 'Telegram подтвердил доставку. Проверьте чат с ботом.';
      showToast('Тестовое сообщение доставлено');
    } catch (error) {
      box.classList.add('error');
      box.textContent = error.message;
    } finally {
      target.disabled = false;
      target.innerHTML = `${icon('send')}Отправить тестовое сообщение`;
      resetChallenge('settings-challenge');
    }
  }
});
document.getElementById('sidebar-overlay').addEventListener('click', () => openMenu(false));
document.getElementById('modal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) {
    const r = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closeModal();
  }
});
// Печать должна содержать и свёрнутые разборы; после неё возвращаем состояние.
let printDetails = [];
window.addEventListener('beforeprint', () => {
  printDetails = [...main.querySelectorAll('details')].map((el) => [el, el.open]);
  for (const [el] of printDetails) el.open = true;
});
window.addEventListener('afterprint', () => {
  for (const [el, wasOpen] of printDetails) if (el.isConnected) el.open = wasOpen;
  printDetails = [];
});
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  main.focus({ preventScroll: true });
});
window.addEventListener('pagehide', () => {
  if (currentSession?.status === 'active') saveSession(currentSession);
});
window.addEventListener('storage', (event) => {
  if (event.key === 'tetrad7:state:v1') {
    currentSession = null;
    reloadFromStorage();
    render();
    showToast('Прогресс обновлён из другой вкладки');
  }
});
setInterval(() => {
  if (currentSession?.status === 'active' && !document.hidden) {
    currentSession.elapsedSeconds = (currentSession.elapsedSeconds || 0) + 1;
    const timer = document.getElementById('session-timer');
    if (timer) timer.textContent = formatTime(currentSession.elapsedSeconds);
    if (currentSession.elapsedSeconds % 5 === 0) saveSession(currentSession);
  }
}, 1000);
render();
