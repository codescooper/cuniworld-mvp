// Logs photo pipeline events under a single namespace, activable à la volée :
//
//   - via console : `localStorage.setItem('cuniworld.debug.photos','1')`
//   - via URL    : `?debug=photos`
//
// Désactiver : `localStorage.removeItem('cuniworld.debug.photos')`.
//
// Garder ce module léger ; il sera retiré après validation du bug A/B.

const KEY = 'cuniworld.debug.photos';
const MAX_BUFFER = 200;

// Buffer ring en mémoire (volontairement TOUJOURS actif, indépendamment du
// flag debug). Ça permet à l'utilisateur d'ouvrir le panneau diagnostic à
// n'importe quel moment et de voir ce qui s'est passé, sans avoir à
// pré-activer les logs avant de reproduire le bug. Le surcoût est négligeable
// (200 objets max, ~quelques Ko).
const _buffer = [];

function _enabled() {
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
      const v = new URLSearchParams(location.search).get('debug') || '';
      if (v.split(',').includes('photos')) return true;
    }
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function photoLog(event, details = {}) {
  // 1) Toujours pousser dans le buffer in-app (pour le panneau diagnostic).
  const entry = { at: new Date().toISOString(), event, details };
  _buffer.push(entry);
  if (_buffer.length > MAX_BUFFER) _buffer.shift();

  // 2) Console uniquement si flag activé (évite le bruit en prod).
  if (!_enabled()) return;
  console.info(`[photo:${event}]`, details);
}

export function isPhotoDebugEnabled() { return _enabled(); }

// Snapshot du buffer pour le panneau diagnostic (renvoie une copie pour que
// l'appelant puisse trier/filtrer sans muter l'état interne).
export function getPhotoLogBuffer() {
  return _buffer.slice();
}

export function clearPhotoLogBuffer() {
  _buffer.length = 0;
}
