// Logs photo pipeline events under a single namespace, activable à la volée :
//
//   - via console : `localStorage.setItem('cuniworld.debug.photos','1')`
//   - via URL    : `?debug=photos`
//
// Désactiver : `localStorage.removeItem('cuniworld.debug.photos')`.
//
// Garder ce module léger ; il sera retiré après validation du bug A/B.

const KEY = 'cuniworld.debug.photos';

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
  if (!_enabled()) return;
  // Format compact, une seule ligne, pour grep facile.
  // Exemples : photo.local.saved, photo.upload.success, photo.realtime.received…
  // eslint-disable-next-line no-console
  console.info(`[photo:${event}]`, details);
}

export function isPhotoDebugEnabled() { return _enabled(); }
