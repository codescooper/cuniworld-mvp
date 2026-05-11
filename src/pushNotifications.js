import { getTodayFarmActions } from './farmActionsService.js';

const NOTIF_KEY   = 'cuniworld_notif_fired';
const PERM_KEY    = 'cuniworld_notif_perm_asked';
// ── Permission ────────────────────────────────────────────────────────────────

export function notificationsSupported() {
  return 'Notification' in window;
}

export function notificationsGranted() {
  return notificationsSupported() && Notification.permission === 'granted';
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return false;
  try { localStorage.setItem(PERM_KEY, '1'); } catch (_) {}
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function permissionAlreadyAsked() {
  try { return !!localStorage.getItem(PERM_KEY); } catch (_) { return false; }
}

// ── Fired-today cache (avoids spam) ──────────────────────────────────────────

function _getFired() {
  try {
    const data = JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}');
    const today = new Date().toISOString().slice(0, 10);
    if (data.date !== today) return {};
    return data.ids || {};
  } catch (_) { return {}; }
}

function _markFired(id) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const data  = JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}');
    const ids   = data.date === today ? (data.ids || {}) : {};
    ids[id] = 1;
    localStorage.setItem(NOTIF_KEY, JSON.stringify({ date: today, ids }));
  } catch (_) {}
}

// ── Fire a single notification ────────────────────────────────────────────────

function _fire(title, body, tag) {
  if (!notificationsGranted()) return;
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
          body,
          tag,
          data: { url: window.location.pathname },
        });
      }).catch(() => {
        new Notification(title, { body, tag });
      });
    } else {
      new Notification(title, { body, tag });
    }
  } catch (_) {}
}

// ── Check and fire all pending notifications ──────────────────────────────────

export function checkAndFireNotifications(state) {
  if (!notificationsGranted()) return;
  const fired = _getFired();
  const { urgent } = getTodayFarmActions(state);

  for (const action of urgent) {
    const key = `u_${action.id}`;
    if (fired[key]) continue;
    _fire(`🚨 ${action.label}`, action.meta || '', action.id);
    _markFired(key);
  }
}

// ── Register Service Worker ───────────────────────────────────────────────────

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch (err) {
    console.warn('[SW] Registration failed:', err?.message || err);
    return null;
  }
}
