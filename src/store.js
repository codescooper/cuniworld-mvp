import { saveData, loadData } from "./storage.js";
import { migrateRabbitWeightData } from "./weightService.js";

const KEY = "cuniworld_mvp_state";
const BACKUPS_KEY = "cuniworld_mvp_backups";
const MAX_BACKUPS = 5;

const SCHEMA_VERSION = 5;

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
    usedNames: {},
    lotStatuses: {},  // { [lotId]: "en_cours" | "vendu" | "termine" }
    stock: [],        // inventory items
    stockMovements: [], // stock in/out/adjust history
    rounds: [],       // daily farm rounds
  };
}

function listBackupsFromStorage() {
  const raw = loadData(BACKUPS_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

function backupCurrentState(reason) {
  const current = loadData(KEY, null);
  if (!current || typeof current !== "object") return;

  const backups = listBackupsFromStorage();
  const entry = {
    id: uid("backup"),
    createdAt: nowISO(),
    reason,
    version: current.version ?? SCHEMA_VERSION,
    state: current,
  };
  const next = [...backups, entry].slice(-MAX_BACKUPS);
  saveData(BACKUPS_KEY, next);
}

function migrate(state) {
  if (!state || typeof state !== "object") return defaultState();
  if (!state.version) return { ...defaultState(), ...state, version: SCHEMA_VERSION };
  // v1 → v2 : ajout du tableau photos
  if (state.version === 1) {
    state = { ...state, photos: [], version: 2 };
  }
  // v2 → v3 : ajout du dictionnaire usedNames
  if (state.version === 2) {
    state = { ...state, usedNames: {}, version: 3 };
  }
  // v3 → v4 : ajout du dictionnaire lotStatuses
  if (state.version === 3) {
    state = { ...state, lotStatuses: {}, version: 4 };
  }
  // v4 → v5 : ajout stock, stockMovements, rounds
  if (state.version === 4) {
    state = { ...state, stock: [], stockMovements: [], rounds: [], version: 5 };
  }
  return state;
}

function stripPhotoPayloads(state) {
  if (!state || !Array.isArray(state.photos)) return state;
  const photos = state.photos.map((p) => {
    if (!p || typeof p !== "object") return p;
    const { dataUrl, ...meta } = p;
    return meta;
  });
  return { ...state, photos };
}

export const Store = {
  load() {
    const raw = loadData(KEY, null);
    const state = migrate(raw ?? defaultState());
    // Migration one-shot : champs weight/currentWeight → événements pesée
    if (migrateRabbitWeightData(state)) saveData(KEY, state);
    return state;
  },

  save(state) {
    const next = {
      ...state,
      meta: { ...(state.meta || {}), updatedAt: nowISO() },
    };
    const persistable = stripPhotoPayloads(next);
    // saveData lève une Error explicite si le quota est dépassé
    saveData(KEY, persistable);
    return next;
  },

  reset() {
    backupCurrentState("reset");
    localStorage.removeItem(KEY);
    return defaultState();
  },

  exportJSON(state) {
    return JSON.stringify(stripPhotoPayloads(state), null, 2);
  },

  importJSON(text) {
    backupCurrentState("import");
    const parsed = JSON.parse(text);
    const migrated = migrate(parsed);
    if (!Array.isArray(migrated.rabbits) || !Array.isArray(migrated.events)) {
      throw new Error("Fichier invalide (rabbits/events manquants).");
    }
    return this.save(migrated);
  },

  listBackups() {
    return listBackupsFromStorage();
  },

  restoreBackup(backupId) {
    const backups = listBackupsFromStorage();
    const backup = backups.find((b) => b && b.id === backupId);
    if (!backup || !backup.state) {
      throw new Error("Backup introuvable.");
    }
    const migrated = migrate(backup.state);
    return this.save(migrated);
  },

  helpers: { uid, nowISO, SCHEMA_VERSION, BACKUPS_KEY, MAX_BACKUPS },
};
