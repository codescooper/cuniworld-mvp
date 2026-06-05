import { saveData, loadData } from "./storage.js";
import { migrateRabbitWeightData } from "./weightService.js";
import { autoMigrateFromCages, normalizeLegacyCageCodes } from "./buildingService.js";

const KEY = "cuniworld_mvp_state";
const BACKUPS_KEY = "cuniworld_mvp_backups";
const MAX_BACKUPS = 5;

const SCHEMA_VERSION = 7;

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
    lotStatuses: {},  // { [lotId]: "maternite" | "sevre" | "loges" | "vendu" | "termine" } — override manuel du statut dérivé
    stock: [],        // inventory items
    stockMovements: [], // stock in/out/adjust history
    rounds: [],       // daily farm rounds
    buildings: [],    // farm buildings (bâtiments)
    lodges: [],       // individual lodges (loges)
    lodgeDefects: [], // reported lodge/building defects
    lodgeEvents: [],  // lodge inspection/cleaning history
    transactions: [],     // comptabilité : mouvements d'argent manuels { direction:'in'|'out', ... }
    recurringCharges: [], // comptabilité : charges/recettes récurrentes dépliées à la lecture
  };
}

// Replie les anciennes dépenses (`state.expenses[]`) dans le journal unifié
// `state.transactions[]` en tant que mouvements `out`. Idempotente : si
// `expenses` est absent, renvoie l'état avec un `transactions` garanti. Définie
// ici (et non importée de ledger.js) pour éviter un cycle d'imports au chargement.
function migrateExpensesToTransactions(state) {
  const transactions = Array.isArray(state.transactions) ? state.transactions : [];
  if (!Array.isArray(state.expenses) || state.expenses.length === 0) {
    const { expenses: _drop, ...rest } = state;
    return { ...rest, transactions };
  }
  const migrated = state.expenses.map((e) => ({
    id:          (typeof e.id === "string" && e.id) ? e.id : uid("tx"),
    date:        e.date,
    direction:   "out",
    category:    e.category || "autre",
    amount:      Number(e.amount) || 0,
    currency:    e.currency || null,
    description: (e.description || "").trim(),
    createdAt:   e.createdAt || nowISO(),
  }));
  const { expenses: _drop, ...rest } = state;
  return { ...rest, transactions: [...transactions, ...migrated] };
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
  // v5 → v6 : ajout buildings, lodges, lodgeDefects, lodgeEvents
  if (state.version === 5) {
    state = { ...state, buildings: [], lodges: [], lodgeDefects: [], lodgeEvents: [], version: 6 };
  }
  // v6 → v7 : comptabilité — ajout recurringCharges + repli expenses → transactions
  if (state.version === 6) {
    state = { ...state, recurringCharges: state.recurringCharges || [], version: 7 };
  }
  // Repli one-shot des anciennes dépenses dans le journal (idempotent ; couvre
  // aussi les états sans `version` ré-hydratés depuis defaultState).
  state = migrateExpensesToTransactions(state);
  if (!Array.isArray(state.recurringCharges)) state.recurringCharges = [];
  return state;
}

// Throws an Error with a user-facing message if `parsed` does not look like a
// valid CuniWorld export. Returns `parsed` unchanged on success.
//
// Strategy: required fields must be present with correct types. Optional fields
// may be missing (back-compat) but must have the correct type when present.
// Each entity must be an object with a non-empty id.
function _validateImport(parsed) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Fichier invalide : un objet JSON est attendu.");
  }

  if (parsed.version !== undefined) {
    const v = parsed.version;
    if (!Number.isInteger(v) || v < 1) {
      throw new Error(`Fichier invalide : version "${v}" non reconnue.`);
    }
    if (v > SCHEMA_VERSION) {
      throw new Error(`Fichier issu d'une version plus récente (v${v}) que cette application (v${SCHEMA_VERSION}). Mettez l'application à jour avant d'importer.`);
    }
  }

  const requiredArrays = ["rabbits", "events"];
  for (const key of requiredArrays) {
    if (!Array.isArray(parsed[key])) {
      throw new Error(`Fichier invalide : champ "${key}" manquant ou non-tableau.`);
    }
  }

  const optionalArrays = [
    "photos", "stock", "stockMovements", "rounds",
    "buildings", "lodges", "lodgeDefects", "lodgeEvents",
    "expenses", "transactions", "recurringCharges",
  ];
  for (const key of optionalArrays) {
    if (parsed[key] !== undefined && !Array.isArray(parsed[key])) {
      throw new Error(`Fichier invalide : champ "${key}" doit être un tableau.`);
    }
  }

  const optionalObjects = ["usedNames", "lotStatuses", "meta"];
  for (const key of optionalObjects) {
    const val = parsed[key];
    if (val !== undefined && (val === null || typeof val !== "object" || Array.isArray(val))) {
      throw new Error(`Fichier invalide : champ "${key}" doit être un objet.`);
    }
  }

  const allArrays = [...requiredArrays, ...optionalArrays];
  for (const key of allArrays) {
    const arr = parsed[key];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i += 1) {
      const item = arr[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`Fichier invalide : entrée ${key}[${i}] n'est pas un objet.`);
      }
      if (typeof item.id !== "string" || item.id.length === 0) {
        throw new Error(`Fichier invalide : entrée ${key}[${i}] sans identifiant.`);
      }
    }
  }

  return parsed;
}

function stripPhotoPayloads(state) {
  if (!state || !Array.isArray(state.photos)) return state;
  const photos = state.photos.map((p) => {
    if (!p || typeof p !== "object") return p;
    const { dataUrl: _dataUrl, ...meta } = p;
    return meta;
  });
  return { ...state, photos };
}

export const Store = {
  load() {
    const raw = loadData(KEY, null);
    let state = migrate(raw ?? defaultState());
    // Migration one-shot : champs weight/currentWeight → événements pesée
    if (migrateRabbitWeightData(state)) saveData(KEY, state);
    // Normalise les anciens codes cage "A-01" → "A1" avant la migration bâtiments
    const normalized = normalizeLegacyCageCodes(state);
    if (normalized !== state) { state = normalized; saveData(KEY, state); }
    // Auto-create buildings from existing rabbit cage codes (one-shot)
    const migrated = autoMigrateFromCages(state);
    if (migrated !== state) { state = migrated; saveData(KEY, state); }
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
    // Validate fully before touching current state or backups. A corrupt file
    // must never overwrite live data or burn a slot of MAX_BACKUPS.
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`Fichier JSON illisible : ${err?.message || err}`, { cause: err });
    }
    _validateImport(parsed);
    const migrated = migrate(parsed);
    // Defensive recheck after migration in case a migration step yielded an
    // unexpected shape — protects against future migration regressions.
    _validateImport(migrated);
    backupCurrentState("import");
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
