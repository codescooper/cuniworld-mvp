# Module Comptabilité exhaustif — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer le module Comptabilité en un journal de trésorerie exhaustif (toutes entrées/sorties d'argent), synchronisé entre appareils, avec P&L mensuel/annuel, trésorerie, export CSV/PDF et graphiques.

**Architecture:** Journal unifié (« ledger ») : tout mouvement = une ligne `{direction:'in'|'out'}`. Sources dérivées (ventes, commandes, achats reproducteurs, achats stock, charges récurrentes dépliées) calculées à la volée ; mouvements manuels stockés dans `state.transactions[]`. Module métier pur `src/ledger.js` + refonte UI à onglets + sync cloud parité module Stock.

**Tech Stack:** JavaScript vanilla (ES modules), Vitest, Supabase (Postgres + Realtime), Vite.

**Spec de référence :** `docs/superpowers/specs/2026-06-05-comptabilite-exhaustive-design.md`

---

## Structure de fichiers

| Fichier | Rôle | Action |
|---|---|---|
| `src/ledger.js` | Module métier pur : taxonomie, CRUD transactions & récurrentes, dépliage, agrégations, CSV, migration | **Créer** |
| `tests/ledger.test.js` | Spec exécutable du module | **Créer** |
| `src/accounting.js` | Devient un ré-export de compat depuis `ledger.js` | **Modifier** |
| `tests/accounting.test.js` | Mis à jour vers la nouvelle API (via ré-export) | **Modifier** |
| `src/store.js` | Schéma v7 : `transactions`, `recurringCharges` + migration `expenses→transactions` | **Modifier** |
| `src/stockService.js` | `addStockMovement` accepte `totalCost`/`unitCost` sur `entree` | **Modifier** |
| `src/rules.js` | Type d'événement `achat` (miroir de `vente`) | **Modifier** |
| `supabase/migrations/015_accounting.sql` | Tables `transactions`, `recurring_charges` (RLS + realtime) | **Créer** |
| `src/db.js` | `loadFarmState` + `upsert/delete` + abonnements realtime | **Modifier** |
| `src/mutationQueue.js` | Types de mutation pour les 2 nouvelles entités | **Modifier** |
| `src/wireAuth.js` | `_autoMigrateLocalModules`, `_remapStateIds`, réconciliation, `_loadFarm` | **Modifier** |
| `src/reconcile.js` | Inclure `transactions`/`recurringCharges` (scopé ferme) | **Modifier** |
| `src/renderAccounting.js` | Refonte UI à 4 onglets + écritures cloud | **Réécrire** |
| `src/renderStock.js` | Champ « Coût total » sur l'entrée de stock | **Modifier** |
| `docs/ops/APPLY_ACCOUNTING_SYNC.md` (ou note) | Rappel d'application de la migration en prod | **Créer** |

**Conventions projet (rappel) :** fonctions métier pures (`state` → valeur), HTML par template literals avec `escapeHTML`/`escapeAttr`, `setAttribute('class')` pour tout SVG, jamais de framework, tests obligatoires. Commits directs sur `main`, push après chaque gros bloc.

---

## Phase A — Module métier `ledger.js` (TDD, pur)

### Task 1 : Taxonomie + migration `expenses → transactions`

**Files:**
- Create: `src/ledger.js`
- Test: `tests/ledger.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `tests/ledger.test.js` :

```js
import { describe, it, expect } from "vitest";
import {
  LEDGER_CATEGORIES,
  categoriesFor,
  migrateExpensesToTransactions,
} from "../src/ledger.js";

describe("ledger — taxonomie & migration", () => {
  it("expose des catégories typées par direction", () => {
    expect(LEDGER_CATEGORIES.aliment.direction).toBe("out");
    expect(LEDGER_CATEGORIES.subvention.direction).toBe("in");
    expect(LEDGER_CATEGORIES.achat_animal.direction).toBe("out");
  });

  it("categoriesFor('in') ne renvoie que des catégories d'entrée saisissables", () => {
    const ins = categoriesFor("in");
    expect(ins.every(([, v]) => v.direction === "in")).toBe(true);
    // les catégories auto ne sont pas proposées à la saisie
    expect(ins.map(([k]) => k)).not.toContain("vente_lapin");
    expect(ins.map(([k]) => k)).not.toContain("vente_boutique");
  });

  it("migre expenses[] vers transactions[] (direction out) une seule fois", () => {
    const state = {
      expenses: [
        { id: "exp_1", date: "2026-03-01", category: "aliment", amount: 5000, description: "sac", createdAt: "2026-03-01T00:00:00Z" },
      ],
    };
    const out = migrateExpensesToTransactions(state);
    expect(out.expenses).toBeUndefined();
    expect(out.transactions).toHaveLength(1);
    expect(out.transactions[0]).toMatchObject({ id: "exp_1", direction: "out", category: "aliment", amount: 5000 });
    // idempotent : re-migrer ne double pas
    const again = migrateExpensesToTransactions(out);
    expect(again.transactions).toHaveLength(1);
  });

  it("ne perd pas les transactions déjà présentes lors de la migration", () => {
    const state = {
      transactions: [{ id: "tx_1", date: "2026-04-01", direction: "in", category: "subvention", amount: 100, currency: "EUR", createdAt: "x" }],
      expenses: [{ id: "exp_1", date: "2026-03-01", category: "veto", amount: 50, createdAt: "x" }],
    };
    const out = migrateExpensesToTransactions(state);
    expect(out.transactions).toHaveLength(2);
    expect(out.transactions.find(t => t.id === "tx_1")).toBeTruthy();
    expect(out.transactions.find(t => t.id === "exp_1").direction).toBe("out");
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npx vitest run tests/ledger.test.js`
Expected: FAIL — `Failed to resolve import "../src/ledger.js"`.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Créer `src/ledger.js` :

```js
/**
 * ledger.js — Journal de trésorerie exhaustif de CuniWorld.
 *
 * Tout mouvement d'argent = une ligne { direction: 'in' | 'out' }.
 * Sources DÉRIVÉES (jamais stockées, zéro double comptage) :
 *   - ventes        ← events type 'vente' (data.price)
 *   - commandes     ← commandes boutique livrées (orders, passées en argument)
 *   - achats animal ← events type 'achat'  (data.price)
 *   - achats stock  ← stockMovements type 'entree' avec data.totalCost
 *   - récurrentes   ← state.recurringCharges[] dépliées mois par mois
 * Sources MANUELLES :
 *   - state.transactions[] (recettes hors-vente + dépenses ponctuelles)
 *
 * Toutes les fonctions sont pures. Voir tests/ledger.test.js.
 */

import { Store } from './store.js';

const { uid, nowISO } = Store.helpers;

// ── Taxonomie ────────────────────────────────────────────────────────────────
// `auto: true` = catégorie alimentée par une source dérivée, non proposée à la
// saisie manuelle.
export const LEDGER_CATEGORIES = {
  // Sorties
  aliment:       { label: 'Aliments',       icon: '🌾', direction: 'out' },
  veto:          { label: 'Vétérinaire',    icon: '💉', direction: 'out' },
  eau:           { label: 'Eau',            icon: '💧', direction: 'out' },
  electricite:   { label: 'Électricité',    icon: '⚡', direction: 'out' },
  main_oeuvre:   { label: "Main d'œuvre",   icon: '👷', direction: 'out' },
  equipement:    { label: 'Équipement',     icon: '🔧', direction: 'out' },
  achat_animal:  { label: 'Achat animal',   icon: '🐇', direction: 'out', auto: true },
  loyer:         { label: 'Loyer',          icon: '🏠', direction: 'out' },
  abonnement:    { label: 'Abonnement',     icon: '🔁', direction: 'out' },
  autre:         { label: 'Autre dépense',  icon: '📦', direction: 'out' },
  // Entrées
  vente_lapin:   { label: 'Vente lapin',    icon: '🐇', direction: 'in', auto: true },
  vente_boutique:{ label: 'Vente boutique', icon: '🏪', direction: 'in', auto: true },
  vente_divers:  { label: 'Vente diverse',  icon: '🏷️', direction: 'in' },
  subvention:    { label: 'Subvention',     icon: '🎁', direction: 'in' },
  saillie:       { label: 'Saillie payante',icon: '💞', direction: 'in' },
  fumier:        { label: 'Fumier / sous-produits', icon: '🌱', direction: 'in' },
  prestation:    { label: 'Prestation',     icon: '🛠️', direction: 'in' },
  autre_recette: { label: 'Autre recette',  icon: '💰', direction: 'in' },
};

/** Catégories saisissables manuellement pour une direction donnée. */
export function categoriesFor(direction) {
  return Object.entries(LEDGER_CATEGORIES)
    .filter(([, v]) => v.direction === direction && !v.auto);
}

/** Migration idempotente expenses[] → transactions[] (direction:'out'). */
export function migrateExpensesToTransactions(state) {
  if (!state || !Array.isArray(state.expenses)) return state;
  const existing = Array.isArray(state.transactions) ? state.transactions : [];
  const existingIds = new Set(existing.map(t => t.id));
  const migrated = state.expenses
    .filter(e => e && e.id && !existingIds.has(e.id))
    .map(e => ({
      id: e.id,
      date: e.date,
      direction: 'out',
      category: LEDGER_CATEGORIES[e.category] ? e.category : 'autre',
      amount: Number(e.amount) || 0,
      currency: e.currency || null,
      description: e.description || '',
      createdAt: e.createdAt || nowISO(),
    }));
  const next = { ...state, transactions: [...existing, ...migrated] };
  delete next.expenses;
  return next;
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npx vitest run tests/ledger.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/ledger.js tests/ledger.test.js
git commit -m "feat(ledger): taxonomie catégories + migration expenses→transactions"
```

---

### Task 2 : CRUD transactions manuelles

**Files:**
- Modify: `src/ledger.js`
- Test: `tests/ledger.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `tests/ledger.test.js` (et l'import en tête : `addTransaction, deleteTransaction`) :

```js
import { addTransaction, deleteTransaction } from "../src/ledger.js";

describe("ledger — transactions manuelles", () => {
  const empty = () => ({ transactions: [] });

  it("addTransaction rejette montant ≤ 0 ou date manquante", () => {
    expect(() => addTransaction(empty(), { date: "", direction: "out", category: "aliment", amount: 100 })).toThrow(/Date/);
    expect(() => addTransaction(empty(), { date: "2026-05-01", direction: "out", category: "aliment", amount: 0 })).toThrow(/Montant/);
    expect(() => addTransaction(empty(), { date: "2026-05-01", direction: "out", category: "aliment", amount: -5 })).toThrow(/Montant/);
  });

  it("addTransaction normalise direction + catégorie cohérente", () => {
    const s = addTransaction(empty(), { date: "2026-05-01", direction: "in", category: "subvention", amount: 100, currency: "EUR" });
    expect(s.transactions[0]).toMatchObject({ direction: "in", category: "subvention", amount: 100, currency: "EUR" });
    expect(s.transactions[0].id).toMatch(/^tx_/);
  });

  it("addTransaction force 'autre'/'autre_recette' si catégorie incohérente avec la direction", () => {
    const out = addTransaction(empty(), { date: "2026-05-01", direction: "out", category: "subvention", amount: 10 });
    expect(out.transactions[0].category).toBe("autre"); // subvention est 'in'
    const inc = addTransaction(empty(), { date: "2026-05-01", direction: "in", category: "aliment", amount: 10 });
    expect(inc.transactions[0].category).toBe("autre_recette"); // aliment est 'out'
  });

  it("deleteTransaction retire la bonne entrée", () => {
    let s = addTransaction(empty(), { date: "2026-05-01", direction: "out", category: "veto", amount: 50 });
    const id = s.transactions[0].id;
    s = addTransaction(s, { date: "2026-05-02", direction: "in", category: "fumier", amount: 20 });
    s = deleteTransaction(s, id);
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0].category).toBe("fumier");
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/ledger.test.js`
Expected: FAIL — `addTransaction is not a function`.

- [ ] **Step 3 : Implémenter**

Ajouter à `src/ledger.js` :

```js
// ── CRUD transactions manuelles ──────────────────────────────────────────────

export function addTransaction(state, { date, direction, category, amount, currency = null, description = '', refType = null, refId = null }) {
  if (!date) throw new Error('Date requise.');
  const dir = direction === 'in' ? 'in' : 'out';
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Montant invalide (doit être > 0).');
  // Catégorie cohérente avec la direction, sinon fallback.
  let cat = category;
  const def = LEDGER_CATEGORIES[cat];
  if (!def || def.direction !== dir || def.auto) cat = dir === 'in' ? 'autre_recette' : 'autre';
  const tx = {
    id: uid('tx'),
    date,
    direction: dir,
    category: cat,
    amount: amt,
    currency: currency || null,
    description: (description || '').trim(),
    createdAt: nowISO(),
    ...(refType ? { refType } : {}),
    ...(refId ? { refId } : {}),
  };
  return { ...state, transactions: [...(state.transactions || []), tx] };
}

export function deleteTransaction(state, txId) {
  return { ...state, transactions: (state.transactions || []).filter(t => t.id !== txId) };
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run tests/ledger.test.js`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/ledger.js tests/ledger.test.js
git commit -m "feat(ledger): CRUD transactions manuelles (in/out)"
```

---

### Task 3 : Charges récurrentes + dépliage

**Files:**
- Modify: `src/ledger.js`
- Test: `tests/ledger.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `tests/ledger.test.js` (imports : `addRecurringCharge, updateRecurringCharge, deleteRecurringCharge, skipRecurringOccurrence, setRecurringOverride, expandRecurring`) :

```js
import {
  addRecurringCharge, updateRecurringCharge, deleteRecurringCharge,
  skipRecurringOccurrence, setRecurringOverride, expandRecurring,
} from "../src/ledger.js";

describe("ledger — charges récurrentes", () => {
  const base = () => ({ recurringCharges: [] });

  it("addRecurringCharge valide montant + startMonth", () => {
    expect(() => addRecurringCharge(base(), { label: "Loyer", category: "loyer", amount: 0, startMonth: "2026-01" })).toThrow(/Montant/);
    expect(() => addRecurringCharge(base(), { label: "Loyer", category: "loyer", amount: 100, startMonth: "" })).toThrow(/Mois/);
    const s = addRecurringCharge(base(), { label: "Loyer", category: "loyer", amount: 100, startMonth: "2026-01", currency: "EUR" });
    expect(s.recurringCharges[0]).toMatchObject({ label: "Loyer", direction: "out", amount: 100, startMonth: "2026-01", skips: [], overrides: {} });
    expect(s.recurringCharges[0].id).toMatch(/^rec_/);
  });

  it("expandRecurring génère une occurrence par mois de start à currentMonth (inclus)", () => {
    let s = addRecurringCharge(base(), { label: "Loyer", category: "loyer", amount: 100, startMonth: "2026-01", currency: "EUR", dayOfMonth: 5 });
    const occ = expandRecurring(s, "2026-03");
    expect(occ.map(o => o.date)).toEqual(["2026-01-05", "2026-02-05", "2026-03-05"]);
    expect(occ.every(o => o.amount === 100 && o.direction === "out")).toBe(true);
  });

  it("respecte endMonth", () => {
    let s = addRecurringCharge(base(), { label: "X", category: "abonnement", amount: 10, startMonth: "2026-01", endMonth: "2026-02", currency: "EUR" });
    const occ = expandRecurring(s, "2026-05");
    expect(occ.map(o => o.date.slice(0, 7))).toEqual(["2026-01", "2026-02"]);
  });

  it("skip retire une occurrence, override change son montant", () => {
    let s = addRecurringCharge(base(), { label: "X", category: "loyer", amount: 100, startMonth: "2026-01", currency: "EUR", dayOfMonth: 1 });
    const id = s.recurringCharges[0].id;
    s = skipRecurringOccurrence(s, id, "2026-02");
    s = setRecurringOverride(s, id, "2026-03", 150);
    const occ = expandRecurring(s, "2026-03");
    expect(occ.map(o => o.date.slice(0, 7))).toEqual(["2026-01", "2026-03"]); // févr. sauté
    expect(occ.find(o => o.date.slice(0, 7) === "2026-03").amount).toBe(150);
  });

  it("updateRecurringCharge et deleteRecurringCharge", () => {
    let s = addRecurringCharge(base(), { label: "X", category: "loyer", amount: 100, startMonth: "2026-01", currency: "EUR" });
    const id = s.recurringCharges[0].id;
    s = updateRecurringCharge(s, id, { amount: 200 });
    expect(s.recurringCharges[0].amount).toBe(200);
    s = deleteRecurringCharge(s, id);
    expect(s.recurringCharges).toHaveLength(0);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/ledger.test.js`
Expected: FAIL — `addRecurringCharge is not a function`.

- [ ] **Step 3 : Implémenter**

Ajouter à `src/ledger.js` :

```js
// ── Charges récurrentes ──────────────────────────────────────────────────────

function _clampDay(day) {
  const d = Number(day);
  if (!Number.isFinite(d) || d < 1) return 1;
  return Math.min(28, Math.floor(d)); // 28 : valide tous les mois
}

export function addRecurringCharge(state, { label, direction = 'out', category, amount, currency = null, dayOfMonth = 1, startMonth, endMonth = null }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Montant invalide (doit être > 0).');
  if (!startMonth || !/^\d{4}-\d{2}$/.test(startMonth)) throw new Error('Mois de début requis (YYYY-MM).');
  const dir = direction === 'in' ? 'in' : 'out';
  let cat = category;
  const def = LEDGER_CATEGORIES[cat];
  if (!def || def.direction !== dir || def.auto) cat = dir === 'in' ? 'autre_recette' : 'autre';
  const rec = {
    id: uid('rec'),
    label: (label || '').trim() || 'Charge récurrente',
    direction: dir,
    category: cat,
    amount: amt,
    currency: currency || null,
    dayOfMonth: _clampDay(dayOfMonth),
    startMonth,
    endMonth: endMonth && /^\d{4}-\d{2}$/.test(endMonth) ? endMonth : null,
    skips: [],
    overrides: {},
    createdAt: nowISO(),
  };
  return { ...state, recurringCharges: [...(state.recurringCharges || []), rec] };
}

export function updateRecurringCharge(state, id, fields) {
  const recurringCharges = (state.recurringCharges || []).map(r => {
    if (r.id !== id) return r;
    const next = { ...r, ...fields, id: r.id };
    if (fields.dayOfMonth !== undefined) next.dayOfMonth = _clampDay(fields.dayOfMonth);
    return next;
  });
  return { ...state, recurringCharges };
}

export function deleteRecurringCharge(state, id) {
  return { ...state, recurringCharges: (state.recurringCharges || []).filter(r => r.id !== id) };
}

export function skipRecurringOccurrence(state, id, month) {
  return updateRecurringCharge(state, id,
    { skips: [...new Set([...(_findRec(state, id)?.skips || []), month])] });
}

export function setRecurringOverride(state, id, month, amount) {
  const rec = _findRec(state, id);
  return updateRecurringCharge(state, id,
    { overrides: { ...(rec?.overrides || {}), [month]: Number(amount) } });
}

function _findRec(state, id) {
  return (state.recurringCharges || []).find(r => r.id === id);
}

/** Itère les mois 'YYYY-MM' de start à end inclus. */
function _monthsBetween(start, end) {
  const out = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Déplie toutes les charges récurrentes en occurrences jusqu'à `currentMonth`.
 * @returns [{ date:'YYYY-MM-DD', direction, category, amount, currency, recId, label }]
 */
export function expandRecurring(state, currentMonth) {
  const out = [];
  for (const r of (state.recurringCharges || [])) {
    const end = r.endMonth && r.endMonth < currentMonth ? r.endMonth : currentMonth;
    if (r.startMonth > end) continue;
    for (const month of _monthsBetween(r.startMonth, end)) {
      if ((r.skips || []).includes(month)) continue;
      const amount = (r.overrides && r.overrides[month] != null) ? Number(r.overrides[month]) : r.amount;
      out.push({
        date: `${month}-${String(r.dayOfMonth || 1).padStart(2, '0')}`,
        direction: r.direction,
        category: r.category,
        amount,
        currency: r.currency || null,
        recId: r.id,
        label: r.label,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run tests/ledger.test.js`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/ledger.js tests/ledger.test.js
git commit -m "feat(ledger): charges récurrentes CRUD + dépliage (skips/overrides)"
```

---

### Task 4 : `listLedger` (journal unifié)

**Files:**
- Modify: `src/ledger.js`
- Test: `tests/ledger.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter (import : `listLedger`) :

```js
import { listLedger } from "../src/ledger.js";

describe("ledger — journal unifié listLedger", () => {
  it("agrège ventes(events) + commandes + achat + stock + récurrentes + manuel, anti-double-compte", () => {
    let state = {
      transactions: [
        { id: "tx1", date: "2026-04-05", direction: "in", category: "fumier", amount: 200, currency: "EUR", createdAt: "x" },
      ],
      recurringCharges: [],
      stockMovements: [
        { id: "sm1", stockItemId: "st1", type: "entree", quantity: 2, date: "2026-04-03", data: { totalCost: 6000 }, totalCost: 6000, stockCategory: "aliment" },
        { id: "sm2", stockItemId: "st1", type: "sortie", quantity: 1, date: "2026-04-04" }, // pas un coût
      ],
      stock: [{ id: "st1", category: "aliment", name: "Granulés" }],
      events: [
        { id: "e1", type: "vente", date: "2026-04-10", rabbitId: "rA", data: { price: 5000 } },
        { id: "e2", type: "achat", date: "2026-04-02", rabbitId: "rZ", data: { price: 12000 } },
      ],
    };
    state = addRecurringCharge(state, { label: "Loyer", category: "loyer", amount: 1000, startMonth: "2026-04", currency: "EUR", dayOfMonth: 1 });

    const orders = [
      { id: "ord1", status: "livre", created_at: "2026-04-10T00:00:00Z", items: [{ rabbit_id: "rA", unit_price: 5000 }], data: { totalAmount: 5000 } }, // déjà reflété → ignoré
      { id: "ord2", status: "livre", created_at: "2026-04-12T00:00:00Z", items: [{ rabbit_id: "rB", unit_price: 8000 }], data: { totalAmount: 8000 } },
    ];

    const rows = listLedger(state, { orders, currentMonth: "2026-04" });
    const by = (src) => rows.filter(r => r.source === src);
    expect(by("event").map(r => r.category).sort()).toEqual(["achat_animal", "vente_lapin"]);
    expect(by("order")).toHaveLength(1);              // ord2 seulement
    expect(by("order")[0].amount).toBe(8000);
    expect(by("stock")).toHaveLength(1);              // sm1 seulement
    expect(by("stock")[0]).toMatchObject({ direction: "out", category: "aliment", amount: 6000 });
    expect(by("recurring")).toHaveLength(1);
    expect(by("manual")).toHaveLength(1);
    // Tri date desc
    const dates = rows.map(r => r.date);
    expect([...dates]).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
    // editable seulement pour manuel
    expect(by("manual")[0].editable).toBe(true);
    expect(by("event")[0].editable).toBe(false);
  });
});
```

> Note : le mapping catégorie stock→dépense lit `movement.stockCategory` si présent, sinon résout via `state.stock` (id). Le test fournit les deux pour rester robuste.

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/ledger.test.js`
Expected: FAIL — `listLedger is not a function`.

- [ ] **Step 3 : Implémenter**

Ajouter à `src/ledger.js` :

```js
// ── Journal unifié ───────────────────────────────────────────────────────────

// Catégorie d'un article de stock → catégorie de dépense.
const STOCK_CAT_TO_EXPENSE = { aliment: 'aliment', medicament: 'veto', equipement: 'equipement' };

function _stockExpenseCategory(movement, state) {
  if (movement.stockCategory && STOCK_CAT_TO_EXPENSE[movement.stockCategory]) {
    return STOCK_CAT_TO_EXPENSE[movement.stockCategory];
  }
  const item = (state.stock || []).find(s => s.id === movement.stockItemId);
  return (item && STOCK_CAT_TO_EXPENSE[item.category]) || 'autre';
}

function _movementCost(m) {
  const c = Number(m?.totalCost ?? m?.data?.totalCost);
  return Number.isFinite(c) && c > 0 ? c : 0;
}

function _currentMonth(opts) {
  return opts?.currentMonth || new Date().toISOString().slice(0, 7);
}

/**
 * Journal unifié, normalisé, trié date desc.
 * @returns [{ date, direction, category, amount, currency, source, refId, label, editable }]
 */
export function listLedger(state, { orders = [], currentMonth = null } = {}) {
  const out = [];
  const cur = _currentMonth({ currentMonth });

  // 1. Ventes (events 'vente') — source de vérité
  const venduRabbitIds = new Set();
  for (const e of (state.events || [])) {
    if (e.type === 'vente') {
      venduRabbitIds.add(e.rabbitId);
      const amount = Number(e.data?.price);
      if (amount > 0) out.push({ date: e.date, direction: 'in', category: 'vente_lapin', amount, currency: null, source: 'event', refId: e.id, label: `Vente ${e.rabbitId || ''}`.trim(), editable: false });
    } else if (e.type === 'achat') {
      const amount = Number(e.data?.price);
      if (amount > 0) out.push({ date: e.date, direction: 'out', category: 'achat_animal', amount, currency: null, source: 'event', refId: e.id, label: `Achat ${e.rabbitId || ''}`.trim(), editable: false });
    }
  }

  // 2. Commandes boutique livrées non reflétées en event vente
  for (const o of (orders || [])) {
    if (o.status !== 'livre') continue;
    const items = Array.isArray(o.items) ? o.items : [];
    const allReflected = items.length > 0 && items.every(it => venduRabbitIds.has(it.rabbit_id));
    if (allReflected) continue;
    const total = Number(o.data?.totalAmount) || items.reduce((s, it) => s + (Number(it.unit_price) || 0), 0);
    if (total <= 0) continue;
    out.push({ date: (o.updated_at || o.created_at || '').slice(0, 10), direction: 'in', category: 'vente_boutique', amount: total, currency: null, source: 'order', refId: o.id, label: `Commande #${(o.id || '').slice(0, 8)}`, editable: false });
  }

  // 3. Achats de stock (mouvements 'entree' avec coût)
  for (const m of (state.stockMovements || [])) {
    if (m.type !== 'entree') continue;
    const cost = _movementCost(m);
    if (cost <= 0) continue;
    out.push({ date: m.date, direction: 'out', category: _stockExpenseCategory(m, state), amount: cost, currency: null, source: 'stock', refId: m.id, label: `Achat stock`, editable: false });
  }

  // 4. Charges récurrentes dépliées
  for (const occ of expandRecurring(state, cur)) {
    out.push({ date: occ.date, direction: occ.direction, category: occ.category, amount: occ.amount, currency: occ.currency, source: 'recurring', refId: occ.recId, label: occ.label, editable: false });
  }

  // 5. Transactions manuelles
  for (const t of (state.transactions || [])) {
    out.push({ date: t.date, direction: t.direction, category: t.category, amount: Number(t.amount) || 0, currency: t.currency || null, source: 'manual', refId: t.id, label: t.description || (LEDGER_CATEGORIES[t.category]?.label || ''), editable: true });
  }

  out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return out;
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run tests/ledger.test.js`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/ledger.js tests/ledger.test.js
git commit -m "feat(ledger): journal unifié listLedger (6 sources, anti-double-compte)"
```

---

### Task 5 : Agrégations P&L (mensuel, annuel, totaux)

**Files:**
- Modify: `src/ledger.js`
- Test: `tests/ledger.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter (import : `computeMonthlyPL, computeYearlyPL, computeTotals`) :

```js
import { computeMonthlyPL, computeYearlyPL, computeTotals } from "../src/ledger.js";

describe("ledger — agrégations", () => {
  const sample = () => ({
    transactions: [
      { id: "t1", date: "2026-03-05", direction: "out", category: "aliment", amount: 5000, currency: "EUR", createdAt: "x" },
      { id: "t2", date: "2026-03-20", direction: "in",  category: "fumier",  amount: 1000, currency: "EUR", createdAt: "x" },
      { id: "t3", date: "2025-12-01", direction: "out", category: "veto",    amount: 2000, currency: "EUR", createdAt: "x" },
    ],
    recurringCharges: [],
    stockMovements: [], stock: [],
    events: [{ id: "e1", type: "vente", date: "2026-03-15", rabbitId: "r1", data: { price: 8000 } }],
  });

  it("computeMonthlyPL agrège in/out/net/byCat par mois", () => {
    const pl = computeMonthlyPL(sample(), { currentMonth: "2026-03" });
    const mar = pl.find(r => r.month === "2026-03");
    expect(mar.in).toBe(9000);  // vente 8000 + fumier 1000
    expect(mar.out).toBe(5000); // aliment
    expect(mar.net).toBe(4000);
    expect(mar.byCat.aliment).toBe(5000);
    expect(pl[0].month >= pl[pl.length - 1].month).toBe(true); // tri desc
  });

  it("computeYearlyPL agrège par année", () => {
    const yl = computeYearlyPL(sample(), { currentMonth: "2026-03" });
    const y2026 = yl.find(r => r.year === "2026");
    expect(y2026.in).toBe(9000);
    expect(y2026.out).toBe(5000);
    const y2025 = yl.find(r => r.year === "2025");
    expect(y2025.out).toBe(2000);
  });

  it("computeTotals additionne tout", () => {
    const t = computeTotals(sample(), { currentMonth: "2026-03" });
    expect(t.in).toBe(9000);
    expect(t.out).toBe(7000);   // 5000 + 2000
    expect(t.net).toBe(2000);
    expect(t.byCat.aliment).toBe(5000);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/ledger.test.js`
Expected: FAIL — `computeMonthlyPL is not a function`.

- [ ] **Step 3 : Implémenter**

Ajouter à `src/ledger.js` :

```js
// ── Agrégations ──────────────────────────────────────────────────────────────

function _aggregate(state, opts, keyOf) {
  const byKey = new Map();
  const ensure = (k) => {
    if (!byKey.has(k)) byKey.set(k, { in: 0, out: 0, byCat: {}, net: 0 });
    return byKey.get(k);
  };
  for (const row of listLedger(state, opts)) {
    const k = keyOf(row.date);
    if (!k) continue;
    const agg = ensure(k);
    agg[row.direction] += row.amount;
    agg.byCat[row.category] = (agg.byCat[row.category] || 0) + row.amount;
  }
  for (const agg of byKey.values()) agg.net = agg.in - agg.out;
  return byKey;
}

export function computeMonthlyPL(state, opts = {}) {
  const m = _aggregate(state, opts, d => (d || '').slice(0, 7));
  return [...m.entries()].map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export function computeYearlyPL(state, opts = {}) {
  const m = _aggregate(state, opts, d => (d || '').slice(0, 4));
  return [...m.entries()].map(([year, v]) => ({ year, ...v }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

export function computeTotals(state, opts = {}) {
  const acc = { in: 0, out: 0, byCat: {}, net: 0 };
  for (const row of listLedger(state, opts)) {
    acc[row.direction] += row.amount;
    acc.byCat[row.category] = (acc.byCat[row.category] || 0) + row.amount;
  }
  acc.net = acc.in - acc.out;
  return acc;
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run tests/ledger.test.js`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/ledger.js tests/ledger.test.js
git commit -m "feat(ledger): agrégations P&L mensuel/annuel + totaux"
```

---

### Task 6 : Trésorerie (solde + série cumulée)

**Files:**
- Modify: `src/ledger.js`
- Test: `tests/ledger.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter (import : `computeTreasury`) :

```js
import { computeTreasury } from "../src/ledger.js";

describe("ledger — trésorerie", () => {
  it("calcule le solde et la série cumulée chronologique", () => {
    const state = {
      transactions: [
        { id: "t1", date: "2026-01-10", direction: "in",  category: "fumier", amount: 1000, currency: "EUR", createdAt: "x" },
        { id: "t2", date: "2026-01-20", direction: "out", category: "aliment", amount: 400, currency: "EUR", createdAt: "x" },
        { id: "t3", date: "2026-02-01", direction: "out", category: "veto", amount: 100, currency: "EUR", createdAt: "x" },
      ],
      recurringCharges: [], stockMovements: [], stock: [], events: [],
    };
    const tr = computeTreasury(state, { currentMonth: "2026-02" });
    expect(tr.balance).toBe(500); // 1000 - 400 - 100
    // série : ordre chronologique ASC, cumul
    expect(tr.series.map(p => p.cumulative)).toEqual([1000, 600, 500]);
    expect(tr.series[0].date).toBe("2026-01-10");
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/ledger.test.js`
Expected: FAIL — `computeTreasury is not a function`.

- [ ] **Step 3 : Implémenter**

Ajouter à `src/ledger.js` :

```js
/**
 * Trésorerie : solde courant + série cumulée (ordre chronologique ASC).
 * @returns { balance, series: [{ date, cumulative }] }
 */
export function computeTreasury(state, opts = {}) {
  const rows = listLedger(state, opts).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let cumulative = 0;
  const series = rows.map(r => {
    cumulative += r.direction === 'in' ? r.amount : -r.amount;
    return { date: r.date, cumulative };
  });
  return { balance: cumulative, series };
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run tests/ledger.test.js`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/ledger.js tests/ledger.test.js
git commit -m "feat(ledger): trésorerie (solde + série cumulée)"
```

---

### Task 7 : Export CSV

**Files:**
- Modify: `src/ledger.js`
- Test: `tests/ledger.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter (import : `listLedgerCSV`) :

```js
import { listLedgerCSV } from "../src/ledger.js";

describe("ledger — export CSV", () => {
  it("produit un CSV avec en-tête et lignes échappées", () => {
    const state = {
      transactions: [
        { id: "t1", date: "2026-03-05", direction: "out", category: "aliment", amount: 5000, currency: "EUR", description: 'Sac "premium"; 25kg', createdAt: "x" },
      ],
      recurringCharges: [], stockMovements: [], stock: [], events: [],
    };
    const csv = listLedgerCSV(state, { currentMonth: "2026-03" });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("date;sens;categorie;libelle;montant;devise;source");
    // le libellé contenant ; et " est entre guillemets avec "" échappés
    expect(lines[1]).toContain('"Sac ""premium""; 25kg"');
    expect(lines[1]).toContain("2026-03-05;out;aliment;");
    expect(lines[1]).toContain(";5000;EUR;manual");
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/ledger.test.js`
Expected: FAIL — `listLedgerCSV is not a function`.

- [ ] **Step 3 : Implémenter**

Ajouter à `src/ledger.js` :

```js
// ── Export CSV ───────────────────────────────────────────────────────────────

function _csvCell(v) {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function listLedgerCSV(state, opts = {}) {
  const header = 'date;sens;categorie;libelle;montant;devise;source';
  const rows = listLedger(state, opts).map(r =>
    [r.date, r.direction, r.category, r.label, r.amount, r.currency || '', r.source].map(_csvCell).join(';')
  );
  return [header, ...rows].join('\n');
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run tests/ledger.test.js`
Expected: PASS (toute la suite ledger verte).

- [ ] **Step 5 : Commit**

```bash
git add src/ledger.js tests/ledger.test.js
git commit -m "feat(ledger): export CSV du journal"
```

---

## Phase B — Schéma & intégration métier

### Task 8 : Schéma Store v7 + migration

**Files:**
- Modify: `src/store.js:9` (SCHEMA_VERSION), `src/store.js:19-36` (defaultState), `src/store.js:59-83` (migrate), `src/store.js:113-121` (optionalArrays)
- Test: `tests/store.migration.test.js` (créer) — sinon réutiliser un test existant si présent

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `tests/store.migration.test.js` :

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

// localStorage minimal pour jsdom/node
beforeEach(() => {
  const store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  });
});

import { Store } from "../src/store.js";

describe("store — migration v6 → v7", () => {
  it("ajoute transactions/recurringCharges et migre expenses", () => {
    localStorage.setItem("cuniworld_mvp_state", JSON.stringify({
      version: 6, rabbits: [], events: [],
      expenses: [{ id: "exp_1", date: "2026-01-01", category: "aliment", amount: 100, createdAt: "x" }],
    }));
    const s = Store.load();
    expect(s.version).toBe(7);
    expect(Array.isArray(s.transactions)).toBe(true);
    expect(Array.isArray(s.recurringCharges)).toBe(true);
    expect(s.expenses).toBeUndefined();
    expect(s.transactions.find(t => t.id === "exp_1").direction).toBe("out");
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/store.migration.test.js`
Expected: FAIL — `expected 6 to be 7` (la migration v7 n'existe pas).

- [ ] **Step 3 : Implémenter**

Dans `src/store.js` :

1. Ligne 9 : `const SCHEMA_VERSION = 7;`

2. Dans `defaultState()` (après `lodgeEvents: []`), ajouter :
```js
    transactions: [],     // journal de trésorerie : mouvements manuels (in/out)
    recurringCharges: [], // charges récurrentes (loyer, salaires...)
```

3. Dans `migrate(state)`, juste avant `return state;`, ajouter le palier v6 → v7. **On inline la migration ici** (et non via un import de `ledger.js`) pour éviter une dépendance circulaire `store.js → ledger.js → store.js` (ledger lit `Store.helpers` au chargement du module) :
```js
  // v6 → v7 : journal de trésorerie (transactions + récurrentes), migre expenses.
  // Migration inline (pas d'import ledger.js : éviterait un cycle d'import).
  if (state.version === 6) {
    const existing = Array.isArray(state.transactions) ? state.transactions : [];
    const existingIds = new Set(existing.map(t => t && t.id));
    const fromExpenses = (Array.isArray(state.expenses) ? state.expenses : [])
      .filter(e => e && e.id && !existingIds.has(e.id))
      .map(e => ({
        id: e.id, date: e.date, direction: 'out',
        category: e.category || 'autre', amount: Number(e.amount) || 0,
        currency: e.currency || null, description: e.description || '',
        createdAt: e.createdAt || nowISO(),
      }));
    state = {
      ...state,
      transactions: [...existing, ...fromExpenses],
      recurringCharges: state.recurringCharges || [],
      version: 7,
    };
    delete state.expenses;
  }
```

4. Dans `_validateImport`, ajouter `"transactions", "recurringCharges"` au tableau `optionalArrays` (et garder `"expenses"` non listé — toléré car objet legacy ignoré).

> Note : `migrateExpensesToTransactions` (Task 1) reste exporté par `ledger.js` pour les tests unitaires et tout appel hors `store.js`, mais `store.js` ne l'importe pas. La logique est volontairement dupliquée (≈10 lignes) pour casser le cycle d'import — DRY cède ici à l'absence de dépendance circulaire.

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run tests/store.migration.test.js tests/ledger.test.js`
Expected: PASS. Si `Cannot access 'Store'`, appliquer le correctif de la note ci-dessus puis relancer.

- [ ] **Step 5 : Commit**

```bash
git add src/store.js tests/store.migration.test.js
git commit -m "feat(store): schéma v7 — transactions + recurringCharges, migration expenses"
```

---

### Task 9 : Coût sur l'entrée de stock

**Files:**
- Modify: `src/stockService.js:48-75` (`addStockMovement`)
- Test: `tests/stockMovement.cost.test.js` (créer)

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `tests/stockMovement.cost.test.js` :

```js
import { describe, it, expect } from "vitest";
import { createStockItem, addStockMovement } from "../src/stockService.js";

describe("stockService — coût sur entrée", () => {
  it("enregistre totalCost + stockCategory sur un mouvement entree", () => {
    let s = createStockItem({ rabbits: [], events: [] }, { name: "Granulés", category: "aliment", quantity: 0, unit: "sac" });
    const id = s.stock[0].id;
    s = addStockMovement(s, { stockItemId: id, type: "entree", quantity: 2, date: "2026-04-01", totalCost: 12000 });
    const mv = s.stockMovements[0];
    expect(mv.totalCost).toBe(12000);
    expect(mv.stockCategory).toBe("aliment");
  });

  it("ignore totalCost ≤ 0 ou absent (pas de champ parasite)", () => {
    let s = createStockItem({ rabbits: [], events: [] }, { name: "X", category: "autre" });
    const id = s.stock[0].id;
    s = addStockMovement(s, { stockItemId: id, type: "sortie", quantity: 1, date: "2026-04-02" });
    expect(s.stockMovements[0].totalCost).toBeUndefined();
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/stockMovement.cost.test.js`
Expected: FAIL — `expected undefined to be 12000`.

- [ ] **Step 3 : Implémenter**

Dans `src/stockService.js`, modifier la signature et le corps de `addStockMovement` :

```js
export function addStockMovement(state, { stockItemId, type, quantity, date, notes = '', totalCost = null }) {
  const item = (state.stock || []).find(x => x.id === stockItemId);
  if (!item) throw new Error('Article introuvable.');
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantité invalide.');
  if (!['entree', 'sortie', 'ajustement'].includes(type)) throw new Error('Type de mouvement invalide.');

  const movement = {
    id:          uid('sm'),
    stockItemId,
    type,
    quantity:    qty,
    date:        date || new Date().toISOString().slice(0, 10),
    notes:       notes.trim(),
    createdAt:   nowISO(),
  };
  // Coût : seulement pertinent sur une entrée payante. On capture aussi la
  // catégorie de l'article pour que le ledger dérive la dépense sans relookup.
  const cost = Number(totalCost);
  if (type === 'entree' && Number.isFinite(cost) && cost > 0) {
    movement.totalCost = cost;
    movement.stockCategory = item.category;
  }

  let newQty;
  if (type === 'entree')     newQty = item.quantity + qty;
  else if (type === 'sortie') newQty = Math.max(0, item.quantity - qty);
  else                        newQty = qty;

  const stock = (state.stock || []).map(x =>
    x.id === stockItemId ? { ...x, quantity: newQty, updatedAt: nowISO() } : x
  );
  const stockMovements = [...(state.stockMovements || []), movement];
  return { ...state, stock, stockMovements };
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run tests/stockMovement.cost.test.js`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/stockService.js tests/stockMovement.cost.test.js
git commit -m "feat(stock): coût optionnel sur l'entrée de stock (alimente la compta)"
```

---

### Task 10 : Type d'événement `achat`

**Files:**
- Modify: `src/rules.js` (`validateEvent` — accepter le type `achat`)
- Test: `tests/rules.achat.test.js` (créer)

- [ ] **Step 1 : Lire le code existant**

Run: `npx grep -n "vente" src/rules.js` (ou ouvrir `src/rules.js`).
But : repérer la liste des types d'événements valides et la branche `vente` (validation de `data.price`) pour la dupliquer en `achat`.

- [ ] **Step 2 : Écrire le test qui échoue**

Créer `tests/rules.achat.test.js` :

```js
import { describe, it, expect } from "vitest";
import { validateEvent } from "../src/rules.js";

describe("rules — événement achat", () => {
  it("accepte un événement achat avec un prix valide", () => {
    const res = validateEvent({ type: "achat", date: "2026-04-01", data: { price: 12000 } }, { rabbits: [], events: [] });
    // validateEvent renvoie { ok: true } ou un objet d'erreur selon la convention
    expect(res.ok ?? res === true ?? !res.error).toBeTruthy();
  });
});
```

> ⚠️ Adapter l'assertion au contrat réel de `validateEvent` observé au Step 1 (certaines versions renvoient `{ valid, errors }`, d'autres lèvent). Écrire l'assertion qui correspond.

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/rules.achat.test.js`
Expected: FAIL (type `achat` rejeté).

- [ ] **Step 4 : Implémenter**

Dans `src/rules.js` : ajouter `'achat'` à la liste des types valides, et dupliquer la branche de validation de `vente` (prix `data.price` numérique ≥ 0) pour `achat`. `applyEventSideEffects` : un `achat` ne change pas le statut du lapin (contrairement à `vente` qui passe `status: 'vendu'`) — ne rien ajouter pour `achat` côté effets, ou s'aligner sur le comportement neutre de `vaccin`.

- [ ] **Step 5 : Lancer, vérifier le succès**

Run: `npx vitest run tests/rules.achat.test.js`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/rules.js tests/rules.achat.test.js
git commit -m "feat(rules): type d'événement achat (entrée d'animal payante)"
```

---

## Phase C — Synchronisation cloud (parité module Stock)

### Task 11 : Migration SQL `015_accounting.sql`

**Files:**
- Create: `supabase/migrations/015_accounting.sql`

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/015_accounting.sql` (calqué sur `012_sync_modules.sql`) :

```sql
-- Migration 015 : synchronisation cloud du module Comptabilité (journal de trésorerie)
-- À exécuter dans le SQL Editor de Supabase. Idempotent.
-- Prérequis : tables `farms` et `farm_members`. RLS : membre de la ferme.

-- ── transactions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id         TEXT        PRIMARY KEY,
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transactions_farm_member ON transactions;
CREATE POLICY transactions_farm_member ON transactions
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── recurring_charges ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_charges (
  id         TEXT        PRIMARY KEY,
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE recurring_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recurring_charges_farm_member ON recurring_charges;
CREATE POLICY recurring_charges_farm_member ON recurring_charges
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── Realtime : replica identity + publication (idempotent) ─────────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['transactions','recurring_charges']) LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    FOR t IN SELECT unnest(ARRAY['transactions','recurring_charges']) LOOP
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
        BEGIN
          EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
      END IF;
    END LOOP;
  END IF;
END $$;

-- Diagnostic
SELECT 'table' AS check, table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('transactions','recurring_charges');
```

- [ ] **Step 2 : Vérifier la cohérence (lecture seule)**

Run: `npx grep -n "transactions\|recurring_charges" supabase/migrations/015_accounting.sql`
Expected: les deux tables apparaissent dans CREATE, RLS, et les deux blocs realtime.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/015_accounting.sql
git commit -m "feat(sql): migration 015 — tables transactions + recurring_charges (RLS+realtime)"
```

> Note d'exploitation : cette migration doit être appliquée en prod (SQL Editor). À documenter en Task 18.

---

### Task 12 : Couche DB (load + upsert/delete + realtime)

**Files:**
- Modify: `src/db.js:36-86` (`loadFarmState`), `src/db.js:157-169` (zone d'ajout des fonctions), `src/db.js:339-369` (abonnements realtime)
- Test: manuel (couvert par l'intégration ; pas de test unitaire DB car Supabase non mocké — cf. CLAUDE.md).

- [ ] **Step 1 : Étendre `loadFarmState`**

Dans le `Promise.all` de `loadFarmState` (src/db.js:37-50), ajouter deux requêtes :
```js
      supabase.from('transactions').select('id, data').eq('farm_id', farmId),
      supabase.from('recurring_charges').select('id, data').eq('farm_id', farmId),
```
Ajouter les deux variables de déstructuration en fin de tableau de résultats (ex. `txRes, recRes`).
Après les `_safeData` existants, ajouter :
```js
    const txData  = _safeData(txRes,  'transactions');
    const recData = _safeData(recRes, 'recurring_charges');
```
Dans l'objet retourné, ajouter :
```js
      transactions:     txData  !== null ? txData.map(r => ({ id: r.id, ...r.data }))  : null,
      recurringCharges: recData !== null ? recData.map(r => ({ id: r.id, ...r.data })) : null,
```

- [ ] **Step 2 : Ajouter les fonctions upsert/delete**

Après le bloc « Mouvements de stock » (src/db.js:169), ajouter au DB :
```js
  // ── Comptabilité ──────────────────────────────────────────────────
  async upsertTransaction(farmId, tx) {
    const { id, ...data } = tx;
    const { error } = await supabase.from('transactions')
      .upsert({ id, farm_id: farmId, data }, { onConflict: 'id' });
    _throwIfError('upsertTransaction', error);
  },
  async deleteTransaction(farmId, txId) {
    const { error } = await supabase.from('transactions').delete()
      .eq('id', txId).eq('farm_id', farmId);
    _throwIfError('deleteTransaction', error);
  },
  async upsertRecurringCharge(farmId, rec) {
    const { id, ...data } = rec;
    const { error } = await supabase.from('recurring_charges')
      .upsert({ id, farm_id: farmId, data }, { onConflict: 'id' });
    _throwIfError('upsertRecurringCharge', error);
  },
  async deleteRecurringCharge(farmId, recId) {
    const { error } = await supabase.from('recurring_charges').delete()
      .eq('id', recId).eq('farm_id', farmId);
    _throwIfError('deleteRecurringCharge', error);
  },
```

- [ ] **Step 3 : Ajouter les abonnements realtime**

Après le bloc « Stock » des `.on('postgres_changes', ...)` (src/db.js:353), ajouter :
```js
      // ── Comptabilité ──
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'transactions', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!Array.isArray(ctx.state.transactions)) ctx.state.transactions = [];
        _applyChange(ctx.state.transactions, payload, row => ({ id: row.id, ...row.data }));
        _scheduleRender(ctx);
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'recurring_charges', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!Array.isArray(ctx.state.recurringCharges)) ctx.state.recurringCharges = [];
        _applyChange(ctx.state.recurringCharges, payload, row => ({ id: row.id, ...row.data }));
        _scheduleRender(ctx);
      })
```

- [ ] **Step 4 : Vérifier le build**

Run: `npm run build`
Expected: build OK (pas d'erreur de syntaxe).

- [ ] **Step 5 : Commit**

```bash
git add src/db.js
git commit -m "feat(db): sync compta — load + upsert/delete + realtime (transactions, récurrentes)"
```

---

### Task 13 : Types de mutation hors-ligne

**Files:**
- Modify: `src/mutationQueue.js:59-69`
- Test: `tests/mutationQueue.accounting.test.js` (créer)

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `tests/mutationQueue.accounting.test.js` :

```js
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/db.js", () => ({
  DB: {
    upsertTransaction: vi.fn().mockResolvedValue(),
    deleteTransaction: vi.fn().mockResolvedValue(),
    upsertRecurringCharge: vi.fn().mockResolvedValue(),
    deleteRecurringCharge: vi.fn().mockResolvedValue(),
  },
}));

// localStorage stub
const store = new Map();
vi.stubGlobal("localStorage", {
  getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k),
});

import { enqueueMutation, replayMutationQueue } from "../src/mutationQueue.js";
import { DB } from "../src/db.js";

describe("mutationQueue — compta", () => {
  it("rejoue upsertTransaction et upsertRecurringCharge", async () => {
    enqueueMutation("upsertTransaction", { farmId: "f1", tx: { id: "t1" } });
    enqueueMutation("upsertRecurringCharge", { farmId: "f1", rec: { id: "r1" } });
    const res = await replayMutationQueue();
    expect(res.remaining).toBe(0);
    expect(DB.upsertTransaction).toHaveBeenCalledWith("f1", { id: "t1" });
    expect(DB.upsertRecurringCharge).toHaveBeenCalledWith("f1", { id: "r1" });
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/mutationQueue.accounting.test.js`
Expected: FAIL — `Type de mutation inconnu: upsertTransaction`.

- [ ] **Step 3 : Implémenter**

Dans `src/mutationQueue.js`, dans le `switch` de `runMutation`, avant `default:` :
```js
    // ── Comptabilité ──
    case 'upsertTransaction':     return DB.upsertTransaction(p.farmId, p.tx);
    case 'deleteTransaction':     return DB.deleteTransaction(p.farmId, p.txId);
    case 'upsertRecurringCharge': return DB.upsertRecurringCharge(p.farmId, p.rec);
    case 'deleteRecurringCharge': return DB.deleteRecurringCharge(p.farmId, p.recId);
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run tests/mutationQueue.accounting.test.js`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/mutationQueue.js tests/mutationQueue.accounting.test.js
git commit -m "feat(sync): file hors-ligne pour transactions + récurrentes"
```

---

### Task 14 : Chargement, migration auto & réconciliation

**Files:**
- Modify: `src/wireAuth.js:459-499` (`_autoMigrateLocalModules`), `src/wireAuth.js:508+` (`_remapStateIds`), `src/reconcile.js`
- Test: `tests/reconcile.test.js` (étendre)

- [ ] **Step 1 : Étendre `_autoMigrateLocalModules`**

Dans `src/wireAuth.js`, dans `_autoMigrateLocalModules`, après la ligne `needsArr(freshCloud.rounds, ...)` (src/wireAuth.js:488), ajouter :
```js
  needsArr(freshCloud.transactions,     m.transactions,     t => DB.upsertTransaction(fid, t));
  needsArr(freshCloud.recurringCharges, m.recurringCharges, r => DB.upsertRecurringCharge(fid, r));
```

- [ ] **Step 2 : Étendre `_remapStateIds`**

Dans `_remapStateIds` (src/wireAuth.js:508+), ajouter le remap des nouveaux tableaux (ids autonomes, pas de référence croisée vers rabbits sauf `refId` optionnel). Avant le `return`, ajouter à l'objet retourné :
```js
  const transactions = (local.transactions || []).map((t) => ({ ...t, id: newId('tx') }));
  const recurringCharges = (local.recurringCharges || []).map((r) => ({ ...r, id: newId('rec') }));
```
et inclure `transactions, recurringCharges` dans l'objet retourné par la fonction (à côté de `rabbits`, `events`, etc.).

> Note : on ne remap pas `tx.refId` vers les nouveaux ids lapins ici. Le `refId` n'est utilisé que pour un lien d'affichage facultatif ; le perdre n'altère aucun calcul comptable (les achats animal réels passent par les events, déjà remappés). Acceptable pour la migration one-shot.

- [ ] **Step 3 : Étendre la réconciliation**

Dans `src/reconcile.js`, ajouter `transactions` et `recurringCharges` à la logique de `reconcileLocalToCloud` en suivant le même motif que `stock`/`rounds` (récupérer les entrées locales absentes du cloud, scopées par ferme — ces entités n'ont pas de `farmId` interne, donc s'aligner sur le traitement des modules « non taggés » déjà géré pour stock/rounds). Lire le fichier d'abord pour copier le motif exact.

- [ ] **Step 4 : Écrire/étendre le test**

Dans `tests/reconcile.test.js`, ajouter un cas : une transaction locale absente du cloud est détectée pour récupération ; une transaction déjà présente cloud n'est pas dupliquée. Calquer sur les tests `stock`/`rounds` existants.

- [ ] **Step 5 : Lancer la suite + build**

Run: `npx vitest run tests/reconcile.test.js && npm run build`
Expected: PASS + build OK.

- [ ] **Step 6 : Commit**

```bash
git add src/wireAuth.js src/reconcile.js tests/reconcile.test.js
git commit -m "feat(sync): migration auto + réconciliation compta (transactions, récurrentes)"
```

---

## Phase D — UI

### Task 15 : Refonte `renderAccounting.js` en onglets + écritures cloud

**Files:**
- Rewrite: `src/renderAccounting.js`
- Modify (compat): `src/accounting.js` → ré-export depuis `ledger.js`

- [ ] **Step 1 : Transformer `accounting.js` en ré-export**

Remplacer le contenu de `src/accounting.js` par :
```js
/**
 * accounting.js — Compat. Le module a été remplacé par ledger.js (journal
 * de trésorerie exhaustif). Ce fichier ré-exporte l'API encore utilisée
 * ailleurs et conserve l'ancien nom EXPENSE_CATEGORIES pour rétro-compat.
 */
export {
  LEDGER_CATEGORIES,
  LEDGER_CATEGORIES as EXPENSE_CATEGORIES,
  categoriesFor,
  addTransaction,
  deleteTransaction,
  addRecurringCharge,
  updateRecurringCharge,
  deleteRecurringCharge,
  skipRecurringOccurrence,
  setRecurringOverride,
  expandRecurring,
  listLedger,
  computeMonthlyPL,
  computeYearlyPL,
  computeTotals,
  computeTreasury,
  listLedgerCSV,
  migrateExpensesToTransactions,
} from './ledger.js';
```

- [ ] **Step 2 : Réécrire `renderAccounting.js` — coquille à onglets**

Réécrire `src/renderAccounting.js`. Structure (conserver `openAccountingModal(ctx)` comme entrée, déjà câblée dans `app.js:471`). Imports :
```js
import { openModal, closeModal } from './modal.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { formatCurrency, getSettings } from './settingsService.js';
import { showToast, showConfirm } from './notifications.js';
import { trackCloudWrite } from './actions.js';
import { DB } from './db.js';
import {
  LEDGER_CATEGORIES, categoriesFor,
  addTransaction, deleteTransaction,
  addRecurringCharge, deleteRecurringCharge, skipRecurringOccurrence,
  listLedger, computeMonthlyPL, computeYearlyPL, computeTotals, computeTreasury, listLedgerCSV,
} from './ledger.js';

let _activeTab = 'overview';
const _curMonth = () => new Date().toISOString().slice(0, 10).slice(0, 7);
const _today = () => new Date().toISOString().slice(0, 10);

export function openAccountingModal(ctx) { _render(ctx); }
```

Helper de persistance cloud d'une transaction (réutilisé par les handlers) :
```js
function _saveTx(ctx, nextState, tx) {
  ctx.state = ctx.Store.save(nextState);
  const f = ctx.farmId;
  if (f && tx) trackCloudWrite(ctx, DB.upsertTransaction(f, tx), { type: 'upsertTransaction', payload: { farmId: f, tx } });
}
function _delTx(ctx, nextState, txId) {
  ctx.state = ctx.Store.save(nextState);
  const f = ctx.farmId;
  if (f && txId) trackCloudWrite(ctx, DB.deleteTransaction(f, txId), { type: 'deleteTransaction', payload: { farmId: f, txId } });
}
function _saveRec(ctx, nextState, rec) {
  ctx.state = ctx.Store.save(nextState);
  const f = ctx.farmId;
  if (f && rec) trackCloudWrite(ctx, DB.upsertRecurringCharge(f, rec), { type: 'upsertRecurringCharge', payload: { farmId: f, rec } });
}
function _delRec(ctx, nextState, recId) {
  ctx.state = ctx.Store.save(nextState);
  const f = ctx.farmId;
  if (f && recId) trackCloudWrite(ctx, DB.deleteRecurringCharge(f, recId), { type: 'deleteRecurringCharge', payload: { farmId: f, recId } });
}
```

`_render(ctx)` : ouvre la modale avec une barre d'onglets + un conteneur `#accBody`, puis appelle `_renderTab(ctx)`. Barre d'actions : boutons Export CSV + Imprimer + Fermer.
```js
function _render(ctx) {
  openModal(ctx.el, '📊 Comptabilité', `
    <div class="acc-tabs" role="tablist" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px">
      ${_tabBtn('overview', "Vue d'ensemble")}
      ${_tabBtn('journal', 'Journal')}
      ${_tabBtn('pl', 'P&L')}
      ${_tabBtn('recurring', 'Récurrentes')}
    </div>
    <div id="accBody"></div>
    <div class="row" style="justify-content:space-between;gap:8px;margin-top:14px;flex-wrap:wrap">
      <div style="display:flex;gap:8px">
        <button class="btn secondary" id="accExportCsv">⬇ Export CSV</button>
        <button class="btn secondary" id="accPrint">🖨 Imprimer</button>
      </div>
      <button class="btn secondary" id="accClose">Fermer</button>
    </div>
  `);
  document.getElementById('accClose')?.addEventListener('click', () => closeModal(ctx.el));
  document.getElementById('accExportCsv')?.addEventListener('click', () => _exportCsv(ctx));
  document.getElementById('accPrint')?.addEventListener('click', () => window.print());
  ctx.el.querySelectorAll('[data-acc-tab]').forEach(b =>
    b.addEventListener('click', () => { _activeTab = b.dataset.accTab; _renderTab(ctx); _syncTabStyles(ctx); }));
  _renderTab(ctx);
}

function _tabBtn(id, label) {
  return `<button class="btn" data-acc-tab="${id}" style="font-size:.85rem;padding:6px 10px">${escapeHTML(label)}</button>`;
}
function _syncTabStyles(ctx) {
  ctx.el.querySelectorAll('[data-acc-tab]').forEach(b => {
    const on = b.dataset.accTab === _activeTab;
    b.classList.toggle('secondary', !on);
  });
}
```

- [ ] **Step 3 : Onglets — contenu**

Implémenter `_renderTab(ctx)` qui remplit `#accBody` selon `_activeTab`, en appelant `listLedger(ctx.state, { orders: [], currentMonth: _curMonth() })` etc. (les commandes boutique restent `[]` côté local, comme aujourd'hui ; la sync orders est hors périmètre).

```js
function _renderTab(ctx) {
  const body = document.getElementById('accBody');
  if (!body) return;
  _syncTabStyles(ctx);
  if (_activeTab === 'overview')      body.innerHTML = _overviewHTML(ctx);
  else if (_activeTab === 'journal')  { body.innerHTML = _journalHTML(ctx); _wireJournal(ctx); }
  else if (_activeTab === 'pl')       body.innerHTML = _plHTML(ctx);
  else if (_activeTab === 'recurring'){ body.innerHTML = _recurringHTML(ctx); _wireRecurring(ctx); }
}
```

**`_overviewHTML`** : 3 tuiles (in/out/net via `computeTotals`) + tuile solde (`computeTreasury().balance`) + 2 graphiques (réutiliser le helper barres ; voir Task 17). Utiliser `formatCurrency(x, settings)`.

**`_journalHTML` + `_wireJournal`** : reprend le formulaire de saisie (date, sens in/out → recharge les catégories via `categoriesFor`, montant, description) + la liste `listLedger`. Chaque ligne affiche `direction` (couleur), `LEDGER_CATEGORIES[cat].icon/label`, montant, source (badge), date. Bouton supprimer **uniquement** si `row.editable` (source manuelle) → `_delTx`. Filtres : `<select>` période (mois), sens, source. Soumission du formulaire :
```js
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const next = addTransaction(ctx.state, {
      date: fd.get('date'), direction: fd.get('direction'),
      category: fd.get('category'), amount: fd.get('amount'),
      currency: getSettings(ctx).currencyCode || null, description: fd.get('description'),
    });
    const tx = next.transactions[next.transactions.length - 1];
    _saveTx(ctx, next, tx);
    showToast('Mouvement enregistré.', 'success');
    _renderTab(ctx);
  } catch (err) { showToast(err.message || String(err), 'error'); }
});
```
Le changement du `<select name="direction">` recharge dynamiquement les `<option>` de catégorie via `categoriesFor(dir)`.

**`_plHTML`** : table `computeMonthlyPL` (colonnes Mois / Recettes / Dépenses / Net) + bascule annuel `computeYearlyPL`. Conserver le helper `_fmtMonth` de l'ancien fichier.

**`_recurringHTML` + `_wireRecurring`** : liste des `state.recurringCharges` (label, montant, catégorie, période) + formulaire d'ajout (label, catégorie, montant, jour du mois, mois de début, mois de fin optionnel). Boutons : supprimer (`_delRec`), « ignorer ce mois » (skip `_curMonth()` → `skipRecurringOccurrence` puis `_saveRec`). Ajout :
```js
const next = addRecurringCharge(ctx.state, { label, direction: 'out', category, amount, currency, dayOfMonth, startMonth, endMonth });
const rec = next.recurringCharges[next.recurringCharges.length - 1];
_saveRec(ctx, next, rec);
```

**`_exportCsv`** :
```js
function _exportCsv(ctx) {
  const csv = listLedgerCSV(ctx.state, { orders: [], currentMonth: _curMonth() });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `comptabilite_${_today()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
```

> Réutiliser au maximum les styles et helpers de l'ancien `renderAccounting.js` (tuiles `.tile`, table `.acc-table`, `_fmtMonth`). Tout contenu utilisateur passe par `escapeHTML`/`escapeAttr`.

- [ ] **Step 4 : Vérifier build + suite complète**

Run: `npm run build && npx vitest run`
Expected: build OK ; tous les tests verts.

- [ ] **Step 5 : Vérification manuelle (navigateur)**

Run: `npm run dev` puis ouvrir l'app → panneau Actions → « 📊 Comptabilité ».
Vérifier : les 4 onglets s'affichent ; ajout d'une recette manuelle et d'une dépense ; la ligne apparaît dans le Journal et impacte Vue d'ensemble + P&L + solde ; ajout d'une charge récurrente génère les occurrences passées ; Export CSV télécharge un fichier ; suppression d'une ligne manuelle fonctionne (pas de bouton supprimer sur les lignes dérivées).

- [ ] **Step 6 : Commit**

```bash
git add src/renderAccounting.js src/accounting.js
git commit -m "feat(accounting): refonte UI à onglets (vue/journal/P&L/récurrentes) + sync cloud"
```

---

### Task 16 : Champ « Coût total » dans l'UI Stock

**Files:**
- Modify: `src/renderStock.js` (formulaire d'ajout de mouvement, autour de la ligne 245 qui appelle `addStockMovement`)

- [ ] **Step 1 : Lire le formulaire de mouvement existant**

Run: `npx grep -n "type\|entree\|quantity\|addStockMovement\|moveForm\|FormData" src/renderStock.js`
But : localiser le formulaire de mouvement de stock et son handler de soumission (~ligne 245).

- [ ] **Step 2 : Ajouter le champ coût (affiché si type=entree)**

Dans le template du formulaire de mouvement, ajouter un champ optionnel :
```html
<div class="field" id="smCostField">
  <div class="label">Coût total <span class="muted small">(optionnel, pour la compta)</span></div>
  <input class="input" type="number" name="totalCost" min="0" step="0.01" placeholder="ex: 12000" />
</div>
```
Optionnel : masquer le champ quand le type sélectionné n'est pas `entree` (écouteur `change` sur le `<select>` de type → `smCostField.hidden = type !== 'entree'`).

- [ ] **Step 3 : Passer `totalCost` au service**

Dans le handler de soumission, lire `fd.get('totalCost')` et le passer :
```js
ctx.state = Store.save(addStockMovement(ctx.state, {
  stockItemId: itemId, type, quantity: qty, date, notes,
  totalCost: type === 'entree' ? fd.get('totalCost') : null,
}));
```
(Le mouvement résultant `mv` est déjà ré-uploadé via `DB.upsertStockMovement` existant — le champ `totalCost`/`stockCategory` part dans `data`, aucune autre modif sync nécessaire.)

- [ ] **Step 4 : Build + vérif manuelle**

Run: `npm run build`
Expected: OK. Vérif manuelle : entrée de stock avec coût → la dépense apparaît dans le Journal compta (source « stock »).

- [ ] **Step 5 : Commit**

```bash
git add src/renderStock.js
git commit -m "feat(stock): saisie du coût d'une entrée → dépense automatique en compta"
```

---

### Task 17 : Graphiques (Vue d'ensemble)

**Files:**
- Modify: `src/renderAccounting.js` (`_overviewHTML`)
- Réutiliser un helper de graphe existant si présent.

- [ ] **Step 1 : Repérer un helper de graphe réutilisable**

Run: `npx grep -rn "svg\|chart\|bar\|sparkline\|setAttribute('class'" src/render.js src/renderStats.js`
But : réutiliser le style de graphes déjà employé dans Stats (barres SVG). Rappel impératif : pour SVG, `setAttribute('class')`, jamais `.className` ([[feedback-svg-classname]]).

- [ ] **Step 2 : Implémenter deux graphes en barres**

Dans `_overviewHTML`, ajouter :
1. **Recettes vs dépenses dans le temps** : à partir de `computeMonthlyPL(ctx.state, {...})`, barres groupées (in vert / out rouge) par mois (limiter aux 12 derniers mois).
2. **Répartition des dépenses par catégorie** : à partir de `computeTotals(...).byCat` filtré sur les catégories `out`, barres horizontales triées desc.

Construire le SVG en chaîne (template literal) — les barres sont des `<rect>` ; si des classes sont posées sur des nœuds SVG créés via DOM, utiliser `el.setAttribute('class', ...)`. Si tout est généré en string `innerHTML`, l'attribut `class="..."` dans la string est sûr.

- [ ] **Step 3 : Build + vérif manuelle**

Run: `npm run build`
Expected: OK. Vérif manuelle : onglet Vue d'ensemble affiche les 2 graphiques, cohérents avec les chiffres.

- [ ] **Step 4 : Commit**

```bash
git add src/renderAccounting.js
git commit -m "feat(accounting): graphiques recettes/dépenses + répartition par catégorie"
```

---

## Phase E — Finalisation

### Task 18 : Mise à jour tests legacy, docs, suite complète

**Files:**
- Modify: `tests/accounting.test.js`
- Create: `docs/ops/APPLY_ACCOUNTING_SYNC.md`
- Modify: `ROADMAP_PRODUCTION.md` (tableau de suivi)

- [ ] **Step 1 : Adapter `tests/accounting.test.js`**

L'ancien test importe `addExpense, listRevenues, listExpenses` qui n'existent plus. Deux options — choisir la plus simple :
- **(a)** Réécrire `tests/accounting.test.js` pour cibler la nouvelle API via le ré-export (`addTransaction`, `listLedger`, `computeMonthlyPL` avec la forme `{in,out,net}`), OU
- **(b)** Supprimer `tests/accounting.test.js` (la couverture est désormais dans `tests/ledger.test.js`) et retirer le fichier.

Recommandé : **(b)** suppression, pour éviter la redondance.
```bash
git rm tests/accounting.test.js
```

- [ ] **Step 2 : Lancer la suite complète + lint + build**

Run: `npx vitest run && npm run build`
Expected: tous les tests verts, build OK.
Run (si lint configuré) : `npm run lint`
Expected: pas d'erreur.

- [ ] **Step 3 : Documenter l'application de la migration en prod**

Créer `docs/ops/APPLY_ACCOUNTING_SYNC.md` :
```markdown
# Activer la sync de la comptabilité (prod)

Le journal de trésorerie (transactions + charges récurrentes) se synchronise
entre appareils via deux tables Supabase. Appliquer **une fois** en prod :

1. Supabase Dashboard → SQL Editor → New query.
2. Coller le contenu de `supabase/migrations/015_accounting.sql` → Run.
3. Vérifier dans Results la présence de `transactions` et `recurring_charges`.

Tant que la migration n'est pas appliquée, la compta fonctionne en **local
uniquement** (les écritures cloud sont mises en file et rejouées une fois les
tables disponibles). Voir aussi `supabase/APPLY_PHOTOS_SYNC.sql` pour le même
type d'opération sur les photos.
```

- [ ] **Step 4 : Mettre à jour la roadmap**

Dans `ROADMAP_PRODUCTION.md`, ajouter une ligne au tableau « Suivi des sessions » :
```markdown
| 2026-06-05 | _ce commit_ | Hors roadmap — module Comptabilité exhaustif : journal de trésorerie unifié (ledger.js), recettes hors-vente, achats stock=dépenses, achat reproducteurs, charges récurrentes, P&L mensuel/annuel, trésorerie, export CSV/PDF, graphiques, sync cloud (tables 015) | 100 % |
```

- [ ] **Step 5 : Commit + push**

```bash
git add tests/ docs/ops/APPLY_ACCOUNTING_SYNC.md ROADMAP_PRODUCTION.md
git commit -m "test+docs: finalise module compta exhaustif (suite verte, doc migration, roadmap)"
git push
```

---

## Récapitulatif de validation finale

Après la dernière tâche, confirmer par des preuves :
- `npx vitest run` → **tous verts** (dont `tests/ledger.test.js`).
- `npm run build` → **OK**.
- Vérif navigateur : modale Comptabilité, 4 onglets, saisie recette/dépense, récurrentes, export CSV, graphes, suppression réservée aux lignes manuelles.
- Migration `015_accounting.sql` documentée pour application prod (sync cross-appareils effective une fois appliquée).
