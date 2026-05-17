/**
 * accounting.js — Comptabilité simplifiée pour CuniWorld.
 *
 * Recettes  : automatiques depuis les événements `vente` (data.price) + commandes
 *             boutique livrées (orders.status === 'livre').
 * Dépenses  : saisies manuellement (`state.expenses[]`), catégorisées.
 * P&L       : agrégation par mois civil (YYYY-MM).
 *
 * Pas de double comptage : si une commande boutique génère un événement vente
 * (cf. `auto-vente livraison`), l'événement est la source de vérité — les
 * commandes sont ignorées dans le calcul. Si pas d'événement (vente directe
 * sans passer par la fiche lapin), la commande est comptée.
 *
 * Voir tests/accounting.test.js pour la spec exécutable.
 */

import { Store } from './store.js';

const { uid, nowISO } = Store.helpers;

export const EXPENSE_CATEGORIES = {
  aliment:      { label: 'Aliments',     icon: '🌾' },
  veto:         { label: 'Vétérinaire',  icon: '💉' },
  eau:          { label: 'Eau',          icon: '💧' },
  electricite:  { label: 'Électricité',  icon: '⚡' },
  main_oeuvre:  { label: "Main d'œuvre", icon: '👷' },
  equipement:   { label: 'Équipement',   icon: '🔧' },
  autre:        { label: 'Autre',        icon: '📦' },
};

// ── CRUD dépenses ───────────────────────────────────────────────────────────

export function addExpense(state, { date, category, amount, description = '' }) {
  if (!date) throw new Error('Date requise.');
  const cat = EXPENSE_CATEGORIES[category] ? category : 'autre';
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Montant invalide (doit être > 0).');
  }
  const expense = {
    id: uid('exp'),
    date,
    category: cat,
    amount: amt,
    description: (description || '').trim(),
    createdAt: nowISO(),
  };
  return { ...state, expenses: [...(state.expenses || []), expense] };
}

export function deleteExpense(state, expenseId) {
  return { ...state, expenses: (state.expenses || []).filter(e => e.id !== expenseId) };
}

// ── Lecture & agrégation ────────────────────────────────────────────────────

/**
 * Liste les recettes (ventes) toutes sources confondues, normalisées.
 * Retour : [{ date, amount, source: 'event'|'order', label, refId }]
 *
 * @param {object} state
 * @param {Array} [orders] — commandes Supabase éventuelles (passées explicitement
 *   par le caller car non stockées en local). Format attendu :
 *   { id, status, created_at, items: [{ unit_price }], data: { totalAmount? } }
 */
export function listRevenues(state, orders = []) {
  const out = [];

  // 1. Événements `vente` locaux (source de vérité)
  for (const e of (state.events || [])) {
    if (e.type !== 'vente') continue;
    const amount = Number(e.data?.price);
    if (!(amount > 0)) continue;
    out.push({
      date: e.date,
      amount,
      source: 'event',
      label: `Vente ${e.rabbitId || ''}`.trim(),
      refId: e.id,
    });
  }

  // 2. Commandes shop livrées non encore reflétées en événement vente
  //    (sécurité : si l'auto-vente livraison a tourné, l'événement existe déjà
  //    pour les mêmes lapins, on ignore donc la commande pour éviter le double
  //    comptage).
  const venduRabbitIds = new Set(
    (state.events || [])
      .filter(e => e.type === 'vente')
      .map(e => e.rabbitId)
      .filter(Boolean)
  );

  for (const o of (orders || [])) {
    if (o.status !== 'livre') continue;
    const items = Array.isArray(o.items) ? o.items : [];
    // Toutes les lignes déjà comptabilisées en événement ? On skip.
    const allReflected = items.length > 0 && items.every(it => venduRabbitIds.has(it.rabbit_id));
    if (allReflected) continue;
    const total = Number(o.data?.totalAmount)
      || items.reduce((s, it) => s + (Number(it.unit_price) || 0), 0);
    if (total <= 0) continue;
    out.push({
      date: (o.updated_at || o.created_at || '').slice(0, 10),
      amount: total,
      source: 'order',
      label: `Commande boutique #${(o.id || '').slice(0, 8)}`,
      refId: o.id,
    });
  }

  // Tri chrono inverse pour affichage par défaut
  out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return out;
}

/**
 * Liste les dépenses, triées par date desc.
 */
export function listExpenses(state) {
  return [...(state.expenses || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * P&L agrégé par mois (YYYY-MM).
 *
 * @returns Array<{
 *   month: string,            // 'YYYY-MM'
 *   revenue: number,
 *   expensesTotal: number,
 *   expensesByCat: Record<string, number>,
 *   net: number,              // revenue - expensesTotal
 * }>  trié desc par mois.
 */
export function computeMonthlyPL(state, orders = []) {
  const byMonth = new Map();

  function ensure(month) {
    if (!byMonth.has(month)) {
      byMonth.set(month, {
        month,
        revenue: 0,
        expensesTotal: 0,
        expensesByCat: {},
        net: 0,
      });
    }
    return byMonth.get(month);
  }

  for (const rev of listRevenues(state, orders)) {
    const m = (rev.date || '').slice(0, 7);
    if (!m) continue;
    ensure(m).revenue += rev.amount;
  }

  for (const exp of listExpenses(state)) {
    const m = (exp.date || '').slice(0, 7);
    if (!m) continue;
    const row = ensure(m);
    row.expensesTotal += exp.amount;
    row.expensesByCat[exp.category] = (row.expensesByCat[exp.category] || 0) + exp.amount;
  }

  for (const row of byMonth.values()) row.net = row.revenue - row.expensesTotal;

  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Bilan global toutes périodes confondues.
 */
export function computeTotals(state, orders = []) {
  let revenue = 0;
  for (const r of listRevenues(state, orders)) revenue += r.amount;
  const expensesByCat = {};
  let expensesTotal = 0;
  for (const e of listExpenses(state)) {
    expensesTotal += e.amount;
    expensesByCat[e.category] = (expensesByCat[e.category] || 0) + e.amount;
  }
  return { revenue, expensesTotal, expensesByCat, net: revenue - expensesTotal };
}
