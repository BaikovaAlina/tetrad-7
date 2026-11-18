/* Опциональный антиспам для режима proxy. В обычном тренажёре сеть не нужна.
   Скрипт Cloudflare загружается только если учитель указал публичный site key. */
const widgets = new Map(),
  tokens = new Map();
let loading;
function enabled(config) {
  return config?.mode === 'proxy' && /^0x[A-Za-z0-9_-]{10,}$/.test(config.turnstileSiteKey || '');
}
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () =>
        window.turnstile
          ? resolve(window.turnstile)
          : reject(new Error('Проверка не загрузилась.'));
      script.onerror = () => {
        loading = null;
        reject(new Error('Антиспам-проверка Cloudflare недоступна. Проверьте подключение.'));
      };
      document.head.appendChild(script);
    });
  return loading;
}
export async function mountChallenge(containerId, config) {
  const target = document.getElementById(containerId);
  if (!target || !enabled(config)) return;
  tokens.delete(containerId);
  target.textContent = 'Загружаем антиспам-проверку…';
  try {
    const api = await loadScript();
    if (!target.isConnected) return;
    target.textContent = '';
    const previous = widgets.get(containerId);
    if (previous !== undefined) {
      try {
        api.remove(previous);
      } catch {}
    }
    const id = api.render(target, {
      sitekey: config.turnstileSiteKey,
      action: 'homework',
      theme: 'light',
      size: 'flexible',
      callback: (token) => tokens.set(containerId, token),
      'expired-callback': () => tokens.delete(containerId),
      'error-callback': () => {
        tokens.delete(containerId);
      },
    });
    widgets.set(containerId, id);
  } catch (error) {
    if (target.isConnected) {
      target.textContent = error.message;
      target.classList.add('send-status', 'error');
    }
  }
}
export function getChallengeToken(containerId) {
  const siteKey = window.TRAINER_CONFIG?.telegram?.turnstileSiteKey;
  if (/^0x[A-Za-z0-9_-]{10,}$/.test(siteKey || '') && !tokens.has(containerId))
    throw new Error('Сначала пройди антиспам-проверку Cloudflare над кнопкой отправки.');
  return tokens.get(containerId) || '';
}
export function resetChallenge(containerId) {
  tokens.delete(containerId);
  const id = widgets.get(containerId);
  if (id !== undefined && window.turnstile) {
    try {
      window.turnstile.reset(id);
    } catch {}
  }
}
