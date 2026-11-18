import { getLesson } from './curriculum.js';
const KEY = 'tetrad7:state:v1';
let memory = null;
export let persistentStorage = true;
const initial = () => ({
  version: 1,
  profile: { name: '', className: '' },
  preferences: {},
  sessions: [],
});
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const validDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const gradingOK = (g) =>
  g &&
  [g.five, g.four, g.three].every((x) => Number.isFinite(x) && x > 0 && x <= 100) &&
  g.five > g.four &&
  g.four > g.three;
function sanitizeSession(s) {
  if (
    !s ||
    !/^[A-Za-z0-9_-]{8,80}$/.test(s.id) ||
    !getLesson(s.lessonId) ||
    !['active', 'finished'].includes(s.status) ||
    !['classwork', 'homework', 'practice'].includes(s.work) ||
    !Array.isArray(s.taskIds)
  )
    return null;
  if (
    s.taskIds.length !== (s.work === 'practice' ? 12 : 8) ||
    new Set(s.taskIds).size !== s.taskIds.length ||
    !s.taskIds.every(
      (id) =>
        typeof id === 'string' &&
        id.startsWith(s.lessonId + '-') &&
        /^[ags]\d{2}-(?:0[1-9]|[1-3]\d|4[0-8])$/.test(id)
    )
  )
    return null;
  const variant = String(s.variant ?? '1');
  if (!/^[\w-]{1,30}$/.test(variant)) return null;
  const answers = {};
  for (const id of s.taskIds) {
    const a = s.answers?.[id];
    if (!a || typeof a !== 'object') continue;
    answers[id] = {
      draft: text(a.draft, 320),
      firstInput: text(a.firstInput, 320),
      lastInput: text(a.lastInput, 320),
      manualComment: text(a.manualComment, 1200),
      attempts: Math.min(10000, Math.max(0, Math.floor(Number(a.attempts) || 0))),
      feedback: text(a.feedback, 500),
      solutionSeen: a.solutionSeen === true,
    };
    if (typeof a.firstCorrect === 'boolean') answers[id].firstCorrect = a.firstCorrect;
    if (typeof a.latestCorrect === 'boolean') answers[id].latestCorrect = a.latestCorrect;
  }
  const now = new Date().toISOString();
  return {
    id: s.id,
    version: 1,
    lessonId: s.lessonId,
    work: s.work,
    variant,
    taskIds: [...s.taskIds],
    student: {
      name: text(s.student?.name, 50) || 'Ученик',
      className: text(s.student?.className, 12),
    },
    status: s.status,
    startedAt: validDate(s.startedAt) ? s.startedAt : now,
    updatedAt: validDate(s.updatedAt) ? s.updatedAt : now,
    finishedAt: s.status === 'finished' ? (validDate(s.finishedAt) ? s.finishedAt : now) : null,
    elapsedSeconds: Math.min(2592000, Math.max(0, Math.floor(Number(s.elapsedSeconds) || 0))),
    current: Math.min(s.taskIds.length - 1, Math.max(0, Math.floor(Number(s.current) || 0))),
    answers,
    hints: Array.isArray(s.hints)
      ? [...new Set(s.hints.filter((id) => s.taskIds.includes(id)))]
      : [],
    grading: gradingOK(s.grading) ? { ...s.grading } : { five: 85, four: 70, three: 50 },
    sentAt: validDate(s.sentAt) ? s.sentAt : null,
    telegramMessageId: Number.isInteger(s.telegramMessageId) ? s.telegramMessageId : null,
    sendError: text(s.sendError, 500),
    sendUncertain: s.sendUncertain === true,
  };
}
function sanitize(value) {
  if (!value || value.version !== 1) return initial();
  return {
    version: 1,
    profile: { name: text(value.profile?.name, 50), className: text(value.profile?.className, 12) },
    preferences:
      value.preferences &&
      typeof value.preferences === 'object' &&
      !Array.isArray(value.preferences)
        ? value.preferences
        : {},
    sessions: Array.isArray(value.sessions)
      ? value.sessions.slice(0, 200).map(sanitizeSession).filter(Boolean)
      : [],
  };
}
export function loadState() {
  if (memory) return memory;
  try {
    memory = sanitize(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    persistentStorage = false;
    memory = initial();
  }
  return memory;
}
export function saveState(state = loadState()) {
  memory = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    persistentStorage = false;
    return false;
  }
}
export function saveProfile(profile) {
  const state = loadState();
  state.profile = {
    name: String(profile.name || '')
      .trim()
      .slice(0, 50),
    className: String(profile.className || '')
      .trim()
      .slice(0, 12),
  };
  saveState(state);
  return state.profile;
}
export function savePreferences(patch) {
  const state = loadState();
  state.preferences = { ...state.preferences, ...patch };
  saveState(state);
}
export function saveSession(session) {
  session.updatedAt = new Date().toISOString();
  const state = loadState(),
    i = state.sessions.findIndex((s) => s.id === session.id);
  if (i >= 0) state.sessions[i] = session;
  else state.sessions.unshift(session);
  state.sessions.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  state.sessions = state.sessions.slice(0, 200);
  saveState(state);
  return session;
}
export const findSession = (id) => loadState().sessions.find((s) => s.id === id);
export const finishedSessions = () => loadState().sessions.filter((s) => s.status === 'finished');
export const activeSessions = () => loadState().sessions.filter((s) => s.status === 'active');
export function clearProgress() {
  const state = loadState();
  state.sessions = [];
  saveState(state);
}
export function clearAll() {
  memory = initial();
  saveState(memory);
}
export function reloadFromStorage() {
  memory = null;
  return loadState();
}
export function downloadFile(filename, content, type = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
