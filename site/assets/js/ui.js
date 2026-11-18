import { escapeHtml } from './telegram.js';
export const esc = escapeHtml;
const paths = {
  book: '<path d="M4 3h12a2 2 0 0 1 2 2v15H6a3 3 0 0 1-3-3V5a2 2 0 0 1 1-2Z"/><path d="M6 16h12M7 3v13M10 7h5M10 10h5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.7"/><rect x="14" y="3" width="7" height="7" rx="1.7"/><rect x="3" y="14" width="7" height="7" rx="1.7"/><rect x="14" y="14" width="7" height="7" rx="1.7"/>',
  chart: '<path d="M4 3v17h17M8 15v-4M13 15V6M18 15v-7"/>',
  homework:
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h4M9 18h6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 12h8M8 16h6"/>',
  compass:
    '<circle cx="12" cy="5" r="2"/><path d="m11 7-6 14M13 7l6 14M8 14a7 7 0 0 0 8 0M12 1v2"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9Z"/>',
  spark: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6ZM20 2v4M18 4h4"/>',
  triangle: '<path d="M12 3 2 21h20ZM12 3l3 18"/>',
  ruler: '<path d="m3 16 13-13 5 5L8 21ZM7 12l3 3M11 8l3 3M15 4l3 3"/>',
  function: '<path d="M4 20V4m0 16h17M7 16 18 5M9 19h1M13 19h1M17 19h1"/>',
  calculator:
    '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 6h8v4H8ZM8 14h1M12 14h1M16 14h.1M8 18h1M12 18h1M16 18h.1"/>',
  equal: '<path d="M5 8h14M5 16h14M3 3l2 2M19 19l2 2"/>',
  power: '<path d="m3 9 8 12M11 9 3 21M15 4c0-3 6-3 6 0 0 2-5 4-6 7h6"/>',
  brackets: '<path d="M8 3H5v18h3M16 3h3v18h-3M10 9l4 6M14 9l-4 6"/>',
  system: '<path d="M7 2H5v7l-2 3 2 3v7h2M11 8h9M11 15h9M15 5v6M11 19h9"/>',
  parallel: '<path d="M3 7h18M3 17h18M15 2 8 22"/>',
  angle: '<path d="M4 20h17M4 20 16 3M12 20a8 8 0 0 0-5-7"/>',
  circle: '<circle cx="12" cy="12" r="9"/><path d="M12 12h9M5.5 5.5l13 13M12 12h.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4ZM22 2 11 13"/>',
  bulb: '<path d="M9 18h6M10 22h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3ZM12 1v1"/>',
  pencil: '<path d="m16 3 5 5L8 21H3v-5ZM13 6l5 5M3 21l5-1-4-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  settings:
    '<path d="m9 3 1-1h4l1 3 3 1 3 1v4l-2 1-1 3 1 3-3 3-3-1-3 1-1 2H7l-1-3-3-1V8l2-1 1-3Z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
  link: '<path d="m10 13 4-4M9 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M15 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(0 0) scale(.94)"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6ZM8 12l3 3 5-6"/>',
  warning: '<path d="m12 3 10 18H2ZM12 9v5M12 18h.01"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  trophy:
    '<path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a5 5 0 0 0 5 5M17 5h4v3a5 5 0 0 1-5 5M12 14v6M8 21h8"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  external:
    '<path d="M14 3h7v7M21 3 11 13M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};
export function icon(name, size = 20, cls = '') {
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
}
export const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n);
export const dateLabel = (iso) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
export function emptyState(title, text, button = '') {
  return `<div class="empty-state"><div class="empty-icon">${icon('pencil', 32)}</div><h2>${esc(title)}</h2><p>${esc(text)}</p>${button}</div>`;
}
export function pageHeading(eyebrow, title, description, action = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${description ? `<p>${esc(description)}</p>` : ''}</div>${action}</div>`;
}
export function showToast(message, kind = 'success') {
  const toast = document.getElementById('toast');
  toast.innerHTML = `${icon(kind === 'error' ? 'warning' : 'check')}<span>${esc(message)}</span>`;
  toast.dataset.kind = kind;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => (toast.hidden = true), 4200);
}
export function openModal(title, body, actions = '') {
  const dialog = document.getElementById('modal');
  document.getElementById('modal-content').innerHTML =
    `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="Закрыть">${icon('close')}</button></div><div class="modal-body">${body}</div>${actions ? `<div class="modal-actions">${actions}</div>` : ''}`;
  if (!dialog.open) dialog.showModal();
}
export function closeModal() {
  document.getElementById('modal').close();
}
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Ссылка скопирована');
    return true;
  } catch {
    openModal(
      'Скопируй ссылку',
      `<label class="field-label" for="copy-link">Ссылка на работу</label><input id="copy-link" class="input" value="${esc(text)}" readonly><p class="help">Выдели и скопируй её вручную.</p>`
    );
    document.getElementById('copy-link').select();
    return false;
  }
}
export function heroArtwork() {
  return `<div class="hero-art" aria-hidden="true">
  <div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div>
  <div class="art-note"><span class="note-pin"></span><div class="note-top"><span>МАТЕМАТИКА</span><span>№ 7</span></div><svg class="art-drawing" viewBox="0 0 300 200" fill="none"><path d="M30 170h245M65 190V20" stroke="#6e8a7b" stroke-width="1.4"/><path d="m270 166 6 4-6 4M61 26l4-7 4 7" stroke="#6e8a7b" stroke-width="1.4"/><path d="m40 164 185-119" stroke="#2e644c" stroke-width="2.6"/><path d="M95 170 155 78l100 92Z" stroke="#8d8ab5" stroke-width="2.2"/><path d="M155 78v92" stroke="#8d8ab5" stroke-width="1.6" stroke-dasharray="5 5"/><circle cx="155" cy="78" r="4.5" fill="#8d8ab5"/><circle cx="106" cy="121" r="4" fill="#2e644c"/><text x="155" y="65" fill="#65628e" text-anchor="middle" font-family="Georgia" font-size="17" font-style="italic">A</text><text x="79" y="188" fill="#65628e" font-family="Georgia" font-size="17" font-style="italic">B</text><text x="260" y="186" fill="#65628e" font-family="Georgia" font-size="17" font-style="italic">C</text><text x="190" y="42" fill="#2e644c" font-family="Georgia" font-size="19" font-style="italic" transform="rotate(-8 190 42)">y = kx + b</text></svg><div class="note-formula">a² − b² = (a − b)(a + b)</div></div>
  <div class="art-sticky">Всё получится.<br><span>По шагам.</span><svg viewBox="0 0 100 35"><path d="M7 20q35 17 78-8m-9-5 12 5-9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
  <div class="art-pencil"><span></span></div><span class="art-plus plus-one">+</span><span class="art-plus plus-two">✳</span>
</div>`;
}
