/**
 * monitoring.js — capture des erreurs JS de production.
 *
 * Stratégie : pas de SDK Sentry (le client officiel pèse > 80 kB gzip). On
 * pose un handler global `window.onerror` + `unhandledrejection` et on
 * formate manuellement un payload compatible avec l'endpoint d'ingestion
 * Sentry ("store"). Si VITE_SENTRY_DSN n'est pas défini, le module reste
 * silencieux — utile en dev et en self-hosted sans monitoring.
 *
 * Le DSN est de la forme :
 *   https://<publicKey>@<host>/<projectId>
 *
 * Endpoint visé :
 *   https://<host>/api/<projectId>/store/?sentry_version=7&sentry_client=cuniworld/1&sentry_key=<publicKey>
 */

const DSN_RE = /^https:\/\/([^@]+)@([^/]+)\/(\d+)$/;

let _enabled = false;
let _endpoint = '';
let _release  = 'unknown';
let _env      = 'production';

// Rate-limit : un même message ne part qu'une fois toutes les 60 s pour
// éviter qu'une boucle d'erreurs vide le quota Sentry / sature le réseau
// mobile. Clé = `${message}|${filename}|${lineno}`.
const _lastSentAt = new Map();
const RATE_LIMIT_MS = 60_000;

export function initMonitoring(opts = {}) {
  if (_enabled) return;
  const dsn = opts.dsn || (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SENTRY_DSN : '') || '';
  if (!dsn) return;

  const m = dsn.match(DSN_RE);
  if (!m) {
    console.warn('[monitoring] VITE_SENTRY_DSN mal formé, monitoring désactivé.');
    return;
  }
  const [, publicKey, host, projectId] = m;
  _endpoint = `https://${host}/api/${projectId}/store/?sentry_version=7&sentry_client=cuniworld/1&sentry_key=${publicKey}`;
  _release  = opts.release || (typeof __APP_VERSION__ !== 'undefined' ? `cuniworld@${__APP_VERSION__}` : 'cuniworld@dev');
  _env      = opts.environment || 'production';
  _enabled  = true;

  // Handlers globaux : sync errors + promise rejections non gérées.
  window.addEventListener('error', (e) => {
    captureException(e.error || new Error(e.message), {
      filename: e.filename, lineno: e.lineno, colno: e.colno,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    captureException(err, { source: 'unhandledrejection' });
  });
}

export function captureException(err, extra = {}) {
  if (!_enabled || !err) return;

  const message = err.message || String(err);
  const key = `${message}|${extra.filename || ''}|${extra.lineno || ''}`;
  const now = Date.now();
  if ((now - (_lastSentAt.get(key) || 0)) < RATE_LIMIT_MS) return;
  _lastSentAt.set(key, now);

  const payload = {
    event_id: _uuid(),
    timestamp: now / 1000,
    platform: 'javascript',
    level: 'error',
    release: _release,
    environment: _env,
    exception: {
      values: [{
        type: err.name || 'Error',
        value: message,
        stacktrace: { frames: _parseStack(err.stack) },
      }],
    },
    request: {
      url: window.location.href,
      headers: { 'User-Agent': navigator.userAgent },
    },
    extra,
  };

  try {
    // sendBeacon = livraison best-effort même si l'onglet se ferme.
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    if (navigator.sendBeacon?.(_endpoint, blob)) return;
    fetch(_endpoint, { method: 'POST', body: blob, keepalive: true }).catch(() => {});
  } catch (_) { /* silencieux : un crash dans le monitoring ne doit pas en générer un autre */ }
}

function _uuid() {
  // Sentry attend un id hexa 32 chars sans tirets.
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function _parseStack(stack) {
  if (!stack) return [];
  // Parser minimaliste — Chrome/FF/Safari. On extrait fichier:ligne:colonne
  // + fonction. C'est volontairement permissif : un stack mal parsé n'empêche
  // pas l'envoi (Sentry sait afficher le `value` seul).
  const lines = stack.split('\n').slice(1, 21);
  const frames = [];
  for (const line of lines) {
    const m = line.match(/at\s+([^\s]+)\s*\(?(.+?):(\d+):(\d+)\)?/) ||
              line.match(/([^\s@]+)@(.+?):(\d+):(\d+)/);
    if (m) {
      frames.push({
        function: m[1],
        filename: m[2],
        lineno: parseInt(m[3], 10),
        colno: parseInt(m[4], 10),
      });
    }
  }
  // Sentry attend l'ordre "oldest first".
  return frames.reverse();
}

// Tests : expose une fonction pour vérifier l'état interne sans toucher au DOM.
export function _monitoringState() {
  return { enabled: _enabled, endpoint: _endpoint, release: _release };
}
