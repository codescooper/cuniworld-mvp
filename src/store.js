const KEY = "cuniworld_mvp_state";

const SCHEMA_VERSION = 2;

function nowISO() {
  return new Date().toISOString();
}

function uid(prefix="id") {
  // simple, suffisant pour un MVP local
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

function defaultState() {
  return {
    version: SCHEMA_VERSION,
    meta: { createdAt: nowISO(), updatedAt: nowISO() },
    rabbits: [],   // [{id, code, name, sex, breed, birthDate, cage, status, notes, createdAt, updatedAt}]
    events: [],    // [{id, rabbitId, type, date, notes, data, createdAt}]
    photos: []     // [{id, rabbitId, dataUrl, date, source, eventId, createdAt}]
  };
}

function migrate(state) {
  if (!state || typeof state !== "object") return defaultState();
  if (!state.version) return { ...defaultState(), ...state, version: SCHEMA_VERSION };
  // v1 → v2 : ajout du tableau photos
  if (state.version === 1) {
    return { ...state, photos: [], version: 2 };
  }
  return state;
}

export const Store = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch {
      return defaultState();
    }
  },
  save(state) {
    const next = {
      ...state,
      meta: { ...(state.meta || {}), updatedAt: nowISO() }
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED") {
        throw new Error("Stockage local plein. Supprimez des photos ou exportez/réinitialisez vos données.");
      }
      throw e;
    }
    return next;
  },
  reset() {
    localStorage.removeItem(KEY);
    return defaultState();
  },
  exportJSON(state) {
    return JSON.stringify(state, null, 2);
  },
  importJSON(text) {
    const parsed = JSON.parse(text);
    const migrated = migrate(parsed);
    // validation minimale
    if (!Array.isArray(migrated.rabbits) || !Array.isArray(migrated.events)) {
      throw new Error("Fichier invalide (rabbits/events manquants).");
    }
    return this.save(migrated);
  },
  helpers: { uid, nowISO, SCHEMA_VERSION }
};
