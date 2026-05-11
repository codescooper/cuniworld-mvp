/**
 * storage.js – Module de persistance localStorage
 *
 * API publique :
 *   saveData(key, data)              – sérialise et persiste
 *   loadData(key, defaultValue?)     – charge et désérialise ; reset si JSON corrompu
 *   deleteData(key)                  – supprime la clé
 *   watch(key, fn)                   – s'abonner aux changements (retourne unsubscribe)
 *   unwatch(key, fn)                 – se désabonner manuellement
 *   debounce(fn, delay?)             – utilitaire générique avec .flush() et .cancel()
 *   createAutoSave(key, delay?)      – sauvegarde debouncée liée à une clé
 */

// ─── Quota ────────────────────────────────────────────────────────────────────

function isQuotaError(err) {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22)
  );
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Sérialise `data` en JSON et le stocke sous `key`.
 * Notifie les observateurs internes après écriture.
 * @throws {Error} si le quota localStorage est dépassé
 * @returns {boolean} true si succès
 */
export function saveData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    _notify(key, data);
    return true;
  } catch (err) {
    if (isQuotaError(err)) {
      throw new Error(
        `localStorage plein – libérez de l'espace avant de sauvegarder (clé : "${key}").`,
        { cause: err }
      );
    }
    throw err;
  }
}

/**
 * Charge et désérialise la valeur associée à `key`.
 * – Retourne `defaultValue` si la clé est absente.
 * – Remet `defaultValue` en place si le JSON stocké est corrompu.
 *
 * @param {string} key
 * @param {*}      defaultValue  Valeur de repli (défaut : null)
 */
export function loadData(key, defaultValue = null) {
  const raw = localStorage.getItem(key);
  if (raw === null) return defaultValue;

  try {
    return JSON.parse(raw);
  } catch {
    // JSON corrompu → reset pour éviter un état bloquant à chaque chargement
    console.warn(`[storage] JSON corrompu pour la clé "${key}". Réinitialisation avec la valeur par défaut.`);
    saveData(key, defaultValue);
    return defaultValue;
  }
}

/**
 * Supprime la clé du localStorage et notifie les observateurs (data = undefined).
 */
export function deleteData(key) {
  localStorage.removeItem(key);
  _notify(key, undefined);
}

// ─── Observateurs (pub/sub interne) ──────────────────────────────────────────

/** @type {Map<string, Set<Function>>} */
const _watchers = new Map();

/**
 * Enregistre un callback déclenché à chaque modification de `key`.
 * Le callback reçoit `(data, key)`.
 *
 * @param   {string}   key
 * @param   {Function} callback
 * @returns {() => void}  Fonction de désinscription
 */
export function watch(key, callback) {
  if (!_watchers.has(key)) _watchers.set(key, new Set());
  _watchers.get(key).add(callback);
  return () => unwatch(key, callback);
}

/** Retire un callback spécifique de la liste d'observateurs de `key`. */
export function unwatch(key, callback) {
  _watchers.get(key)?.delete(callback);
}

function _notify(key, data) {
  _watchers.get(key)?.forEach((fn) => {
    try {
      fn(data, key);
    } catch (e) {
      console.error("[storage] Erreur dans un observateur :", e);
    }
  });
}

// ─── Synchronisation cross-onglet ─────────────────────────────────────────────
// L'événement "storage" n'est émis que par les AUTRES onglets,
// ce qui en fait un canal de synchro gratuit entre tabs.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === null) return; // localStorage.clear() global – on ignore
    const parsed = e.newValue !== null ? _safeParse(e.newValue) : undefined;
    _notify(e.key, parsed);
  });
}

function _safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // valeur brute si non-JSON
  }
}

// ─── Debounce ─────────────────────────────────────────────────────────────────

/**
 * Reporte `fn` de `delay` ms après le dernier appel.
 *
 * Expose deux méthodes utiles :
 *   .flush()   – exécute immédiatement le dernier appel en attente
 *   .cancel()  – annule sans exécuter
 *
 * @param   {Function} fn
 * @param   {number}   delay  En millisecondes (défaut : 300)
 * @returns {Function & { flush(): void, cancel(): void }}
 */
export function debounce(fn, delay = 300) {
  let timer = null;
  let lastArgs = null;

  function debounced(...args) {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...lastArgs);
    }, delay);
  }

  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
      fn(...lastArgs);
    }
  };

  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  return debounced;
}

// ─── Auto-save helper ─────────────────────────────────────────────────────────

/**
 * Crée une fonction de sauvegarde debouncée liée à une clé donnée.
 *
 * Usage :
 *   const autoSave = createAutoSave("profil-utilisateur", 300);
 *   autoSave({ nom: "Alice" });   // enregistré après 300 ms d'inactivité
 *   autoSave.flush();             // force l'écriture immédiate
 *   autoSave.cancel();            // abandonne la sauvegarde en attente
 *
 * @param   {string} key
 * @param   {number} delay  Délai en ms (défaut : 300)
 * @returns {Function & { flush(): void, cancel(): void }}
 */
export function createAutoSave(key, delay = 300) {
  return debounce((data) => saveData(key, data), delay);
}
