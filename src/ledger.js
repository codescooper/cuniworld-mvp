/**
 * ledger.js — Journal de trésorerie exhaustif de CuniWorld.
 *
 * Toute somme d'argent qui entre ou sort de la ferme devient une ligne de
 * journal `{ direction: 'in' | 'out' }`. Le journal est en grande partie
 * DÉRIVÉ (jamais persisté en double) :
 *   - ventes de lapins  → événements `vente`            (in / vente_lapin)
 *   - ventes boutique    → commandes livrées             (in / vente_boutique)
 *   - achats d'animaux   → événements `achat`            (out / achat_animal)
 *   - achats de stock    → mouvements `entree` + coût    (out / cat. mappée)
 *   - charges récurrentes → dépliées à la lecture        (in|out)
 *   - saisies manuelles  → `state.transactions[]`        (in|out, éditables)
 *
 * Module PUR : `state` en entrée → valeur en sortie (cf. tests/ledger.test.js).
 * La logique anti-double-comptage ventes/commandes est réutilisée telle quelle
 * depuis `accounting.js` (source de vérité historique).
 */

import { Store } from './store.js';
import { EXPENSE_CATEGORIES, listRevenues } from './accounting.js';

const { uid, nowISO } = Store.helpers;

// ── Taxonomie des catégories ──────────────────────────────────────────────────
// Chaque catégorie porte sa `direction`. `auto: true` = catégorie dérivée, non
// proposée à la saisie manuelle.
export const LEDGER_CATEGORIES = {
  // Sorties (dépenses)
  aliment:      { label: 'Aliments',      icon: '🌾', direction: 'out' },
  veto:         { label: 'Vétérinaire',   icon: '💉', direction: 'out' },
  eau:          { label: 'Eau',           icon: '💧', direction: 'out' },
  electricite:  { label: 'Électricité',   icon: '⚡', direction: 'out' },
  main_oeuvre:  { label: "Main d'œuvre",  icon: '👷', direction: 'out' },
  equipement:   { label: 'Équipement',    icon: '🔧', direction: 'out' },
  achat_animal: { label: 'Achat animal',  icon: '🐇', direction: 'out' },
  loyer:        { label: 'Loyer',         icon: '🏠', direction: 'out' },
  abonnement:   { label: 'Abonnement',    icon: '🔁', direction: 'out' },
  autre:        { label: 'Autre dépense', icon: '📦', direction: 'out' },
  // Entrées (recettes)
  vente_lapin:    { label: 'Vente lapin',     icon: '🐇', direction: 'in', auto: true },
  vente_boutique: { label: 'Vente boutique',  icon: '🛒', direction: 'in', auto: true },
  vente_divers:   { label: 'Vente diverse',   icon: '💰', direction: 'in' },
  subvention:     { label: 'Subvention',      icon: '🏛️', direction: 'in' },
  saillie:        { label: 'Saillie (service)', icon: '❤️', direction: 'in' },
  fumier:         { label: 'Fumier',          icon: '🌱', direction: 'in' },
  prestation:     { label: 'Prestation',      icon: '🛠️', direction: 'in' },
  autre_recette:  { label: 'Autre recette',   icon: '➕', direction: 'in' },
};

/** Catégories proposées à la saisie manuelle pour un sens donné. */
export function manualCategories(direction) {
  return Object.entries(LEDGER_CATEGORIES)
    .filter(([, v]) => v.direction === direction && !v.auto)
    .map(([key, v]) => ({ key, ...v }));
}

/**
 * Catégories saisissables manuellement pour une direction donnée.
 * Retourne des paires [key, value] (format Object.entries).
 */
export function categoriesFor(direction) {
  return Object.entries(LEDGER_CATEGORIES)
    .filter(([, v]) => v.direction === direction && !v.auto);
}

export function categoryLabel(category) {
  return LEDGER_CATEGORIES[category]?.label || category || 'Autre';
}

export function categoryIcon(category) {
  return LEDGER_CATEGORIES[category]?.icon || '•';
}

// Mapping catégorie de stock → catégorie de dépense (cf. STOCK_CATEGORIES).
function mapStockCategory(stockCategory) {
  switch (stockCategory) {
    case 'aliment':    return 'aliment';
    case 'medicament': return 'veto';
    case 'equipement': return 'equipement';
    default:           return 'autre';
  }
}

// ── Dépliage des charges récurrentes ───────────────────────────────────────────

function _monthKey(dateISO) {
  return (dateISO || '').slice(0, 7);
}

// Liste inclusive des mois 'YYYY-MM' de start à end (bornes incluses).
function _monthsBetween(startMonth, endMonth) {
  const out = [];
  if (!startMonth || startMonth.length < 7 || !endMonth || endMonth.length < 7) return out;
  let [y, m] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m)) return out;
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 1200) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    guard += 1;
  }
  return out;
}

/**
 * Déplie les charges récurrentes en lignes de journal, de `startMonth` jusqu'au
 * mois courant (ou `endMonth` si antérieur). `skips` retire une occurrence ;
 * `overrides` ajuste son montant. Aucune occurrence future n'est générée.
 */
export function unfoldRecurring(state, today) {
  const todayStr = today || new Date().toISOString().slice(0, 10);
  const currentMonth = todayStr.slice(0, 7);
  const lines = [];
  for (const r of (state.recurringCharges || [])) {
    if (!r || !r.startMonth) continue;
    const lastBound = r.endMonth && r.endMonth < currentMonth ? r.endMonth : currentMonth;
    const months = _monthsBetween(r.startMonth, lastBound);
    const day = String(Math.min(28, Math.max(1, Number(r.dayOfMonth) || 1))).padStart(2, '0');
    for (const month of months) {
      if (Array.isArray(r.skips) && r.skips.includes(month)) continue;
      const override = r.overrides && r.overrides[month];
      const amount = Number(override != null ? override : r.amount) || 0;
      if (amount <= 0) continue;
      lines.push({
        date:      `${month}-${day}`,
        direction: r.direction === 'in' ? 'in' : 'out',
        category:  r.category || (r.direction === 'in' ? 'autre_recette' : 'autre'),
        amount,
        currency:  r.currency || null,
        source:    'recurring',
        refId:     r.id,
        label:     r.label || 'Charge récurrente',
        editable:  false,
      });
    }
  }
  return lines;
}

// ── Journal unifié ──────────────────────────────────────────────────────────

/**
 * Liste normalisée de toutes les lignes du journal, triées par date desc.
 * @returns Array<{date, direction, category, amount, currency, source, refId, label, editable}>
 */
export function listLedger(state, { orders = [], today } = {}) {
  const lines = [];

  // Ventes (events `vente` + commandes boutique livrées), anti-double-compte hérité.
  for (const r of listRevenues(state, orders)) {
    lines.push({
      date:      r.date,
      direction: 'in',
      category:  r.source === 'order' ? 'vente_boutique' : 'vente_lapin',
      amount:    r.amount,
      currency:  null,
      source:    r.source,
      refId:     r.refId,
      label:     r.label,
      editable:  false,
    });
  }

  // Achats d'animaux (events `achat`).
  for (const e of (state.events || [])) {
    if (e.type !== 'achat') continue;
    const amount = Number(e.data?.price);
    if (!(amount > 0)) continue;
    lines.push({
      date:      e.date,
      direction: 'out',
      category:  'achat_animal',
      amount,
      currency:  null,
      source:    'event',
      refId:     e.id,
      label:     `Achat ${e.rabbitId || ''}`.trim(),
      editable:  false,
    });
  }

  // Achats de stock : mouvements `entree` portant un coût total.
  const stockById = new Map((state.stock || []).map(s => [s.id, s]));
  for (const m of (state.stockMovements || [])) {
    if (m.type !== 'entree') continue;
    const cost = Number(m.totalCost);
    if (!(cost > 0)) continue;
    const item = stockById.get(m.stockItemId);
    lines.push({
      date:      m.date,
      direction: 'out',
      category:  mapStockCategory(item?.category),
      amount:    cost,
      currency:  null,
      source:    'stock',
      refId:     m.id,
      label:     `Achat stock ${item?.name || ''}`.trim(),
      editable:  false,
    });
  }

  // Charges récurrentes dépliées.
  for (const line of unfoldRecurring(state, today)) lines.push(line);

  // Saisies manuelles (seules lignes éditables/supprimables).
  for (const t of (state.transactions || [])) {
    lines.push({
      date:      t.date,
      direction: t.direction === 'in' ? 'in' : 'out',
      category:  t.category,
      amount:    Number(t.amount) || 0,
      currency:  t.currency || null,
      source:    'manual',
      refId:     t.id,
      label:     (t.description || '').trim() || categoryLabel(t.category),
      editable:  true,
    });
  }

  lines.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return lines;
}

// ── CRUD transactions manuelles ───────────────────────────────────────────────

export function addTransaction(state, { date, direction, category, amount, currency = null, description = '', refType = null, refId = null }) {
  if (!date) throw new Error('Date requise.');
  const dir = direction === 'in' ? 'in' : direction === 'out' ? 'out' : null;
  if (!dir) throw new Error('Sens invalide (entrée ou sortie).');
  const cat = LEDGER_CATEGORIES[category] && LEDGER_CATEGORIES[category].direction === dir && !LEDGER_CATEGORIES[category].auto
    ? category
    : (dir === 'in' ? 'autre_recette' : 'autre');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Montant invalide (doit être > 0).');
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

export function deleteTransaction(state, id) {
  return { ...state, transactions: (state.transactions || []).filter(t => t.id !== id) };
}

// ── CRUD charges récurrentes ────────────────────────────────────────────────

export function addRecurringCharge(state, { label, direction = 'out', category, amount, currency = null, dayOfMonth = 1, startMonth, endMonth = null }) {
  if (!label || !label.trim()) throw new Error('Libellé requis.');
  if (!startMonth || startMonth.length < 7) throw new Error('Mois de début requis (YYYY-MM).');
  const dir = direction === 'in' ? 'in' : 'out';
  const cat = LEDGER_CATEGORIES[category] && LEDGER_CATEGORIES[category].direction === dir && !LEDGER_CATEGORIES[category].auto
    ? category
    : (dir === 'in' ? 'autre_recette' : 'autre');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Montant invalide (doit être > 0).');
  const rec = {
    id: uid('rec'),
    label: label.trim(),
    direction: dir,
    category: cat,
    amount: amt,
    currency: currency || null,
    dayOfMonth: Math.min(28, Math.max(1, Number(dayOfMonth) || 1)),
    startMonth,
    endMonth: endMonth || null,
    skips: [],
    overrides: {},
    createdAt: nowISO(),
  };
  return { ...state, recurringCharges: [...(state.recurringCharges || []), rec] };
}

export function updateRecurringCharge(state, id, fields) {
  const recurringCharges = (state.recurringCharges || []).map(r => {
    if (r.id !== id) return r;
    return { ...r, ...fields, id: r.id };
  });
  return { ...state, recurringCharges };
}

export function deleteRecurringCharge(state, id) {
  return { ...state, recurringCharges: (state.recurringCharges || []).filter(r => r.id !== id) };
}

export function skipRecurringOccurrence(state, id, month) {
  const recurringCharges = (state.recurringCharges || []).map(r => {
    if (r.id !== id) return r;
    const skips = Array.isArray(r.skips) ? r.skips : [];
    return skips.includes(month) ? r : { ...r, skips: [...skips, month] };
  });
  return { ...state, recurringCharges };
}

export function setRecurringOverride(state, id, month, amount) {
  const recurringCharges = (state.recurringCharges || []).map(r => {
    if (r.id !== id) return r;
    const overrides = { ...(r.overrides || {}) };
    const amt = Number(amount);
    if (Number.isFinite(amt) && amt > 0) overrides[month] = amt;
    else delete overrides[month];
    return { ...r, overrides };
  });
  return { ...state, recurringCharges };
}

// ── Agrégations ─────────────────────────────────────────────────────────────

function _accumulate(lines) {
  let inSum = 0, outSum = 0;
  const byCat = {};
  for (const l of lines) {
    if (l.direction === 'in') inSum += l.amount;
    else outSum += l.amount;
    byCat[l.category] = (byCat[l.category] || 0) + l.amount;
  }
  return { in: inSum, out: outSum, net: inSum - outSum, byCat };
}

export function computeTotals(state, opts = {}) {
  return _accumulate(listLedger(state, opts));
}

export function computeMonthlyPL(state, opts = {}) {
  const groups = new Map();
  for (const l of listLedger(state, opts)) {
    const month = _monthKey(l.date);
    if (!month) continue;
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(l);
  }
  return [...groups.entries()]
    .map(([month, lines]) => ({ month, ..._accumulate(lines) }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export function computeYearlyPL(state, opts = {}) {
  const groups = new Map();
  for (const l of listLedger(state, opts)) {
    const year = (l.date || '').slice(0, 4);
    if (!year) continue;
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(l);
  }
  return [...groups.entries()]
    .map(([year, lines]) => ({ year, ..._accumulate(lines) }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

/** Trésorerie : solde courant + série cumulée par date (ordre chronologique). */
export function computeTreasury(state, opts = {}) {
  const lines = [...listLedger(state, opts)].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let cumulative = 0;
  const series = [];
  for (const l of lines) {
    cumulative += l.direction === 'in' ? l.amount : -l.amount;
    series.push({ date: l.date, cumulative });
  }
  return { balance: cumulative, series };
}

// ── Export CSV ────────────────────────────────────────────────────────────────

function _csvCell(value) {
  const s = String(value ?? '');
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const SOURCE_LABELS = {
  event: 'Auto (lapin)', order: 'Auto (boutique)', stock: 'Auto (stock)',
  recurring: 'Récurrente', manual: 'Manuelle',
};

/** Journal exporté en CSV (séparateur `;`, compatible Excel FR). */
export function listLedgerCSV(state, opts = {}) {
  const header = ['Date', 'Sens', 'Catégorie', 'Libellé', 'Montant', 'Devise', 'Source'];
  const rows = listLedger(state, opts)
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(l => [
      l.date,
      l.direction === 'in' ? 'Entrée' : 'Sortie',
      categoryLabel(l.category),
      l.label,
      l.amount,
      l.currency || '',
      SOURCE_LABELS[l.source] || l.source,
    ].map(_csvCell).join(';'));
  return [header.map(_csvCell).join(';'), ...rows].join('\r\n');
}

// ── Migration expenses → transactions (idempotente) ─────────────────────────
// Miroir de la migration interne de store.js, exposé pour les tests et tout
// appelant souhaitant replier d'anciennes données.
export function migrateExpensesToTransactions(state) {
  if (!state || !Array.isArray(state.expenses)) return state;
  const existing = Array.isArray(state.transactions) ? state.transactions : [];
  const existingIds = new Set(existing.map(t => t.id));
  const migrated = state.expenses
    .filter(e => e && e.id && !existingIds.has(e.id))
    .map((e) => ({
      id:          e.id,
      date:        e.date,
      direction:   'out',
      category:    LEDGER_CATEGORIES[e.category] ? e.category : 'autre',
      amount:      Number(e.amount) || 0,
      currency:    e.currency || null,
      description: (e.description || '').trim(),
      createdAt:   e.createdAt || nowISO(),
    }));
  const next = { ...state, transactions: [...existing, ...migrated] };
  delete next.expenses;
  return next;
}

// Ré-export pratique de la taxonomie héritée (compat éventuelle).
export { EXPENSE_CATEGORIES };
