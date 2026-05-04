import { saveData, loadData } from "./storage.js";

const KEY = "cuniworld_mvp_state";

const SCHEMA_VERSION = 2;

function nowISO() {
  return new Date().toISOString();
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultState() {
  return {
    version: SCHEMA_VERSION,
    meta: { createdAt: nowISO(), updatedAt: nowISO() },
    rabbits: [],
    events: [],
    photos: [],
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
    // loadData réinitialise automatiquement si le JSON est corrompu
    const raw = loadData(KEY, null);
    return migrate(raw ?? defaultState());
  },

  save(state) {
    const next = {
      ...state,
      meta: { ...(state.meta || {}), updatedAt: nowISO() },
    };
    // saveData lève une Error explicite si le quota est dépassé
    saveData(KEY, next);
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
    if (!Array.isArray(migrated.rabbits) || !Array.isArray(migrated.events)) {
      throw new Error("Fichier invalide (rabbits/events manquants).");
    }
    return this.save(migrated);
  },

  helpers: { uid, nowISO, SCHEMA_VERSION },
};
