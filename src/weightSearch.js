/**
 * weightSearch.js — Recherche, tri et statistiques de poids du cheptel
 *
 * S'appuie sur weightService.getCurrentWeight (dernière pesée connue)
 * et settingsService.estimateRabbitValue (prix vif/carcasse paramétrés).
 *
 * API publique :
 *   getRabbitsWithWeight(state, { forSaleOnly })
 *     → [{ rabbit, weightKg }] des lapins actifs ayant au moins une pesée
 *   getRabbitsSortedByWeight(state, { direction, forSaleOnly })
 *     → idem, trié ASC/DESC
 *   getRabbitsByWeightRange(state, { min, max, forSaleOnly })
 *     → lapins dont la dernière pesée tombe dans [min, max] kg
 *   getWeightExtremes(state, { forSaleOnly })
 *     → { lightest, heaviest } | nulls si pas de données
 *   getRabbitsByBudget(state, { budget, type, tolerance, forSaleOnly, settings })
 *     → lapins dont la valeur estimée tombe dans budget * (1 ± tolerance),
 *        triés par proximité du budget
 */

import { getCurrentWeight, buildCurrentWeightIndex } from './weightService.js';
import { estimateRabbitValue } from './settingsService.js';

// ── Lecture de base ──────────────────────────────────────────────────────────

/**
 * Lapins actifs ayant au moins une pesée.
 * @param {object} state
 * @param {{ forSaleOnly?: boolean }} [opts]
 */
export function getRabbitsWithWeight(state, { forSaleOnly = false } = {}) {
  // Indexation en un seul passage pour éviter O(rabbits × events) — sans ça
  // les dashboards/recherches devenaient injouables au-delà de 200 lapins.
  const weightIndex = buildCurrentWeightIndex(state);
  const out = [];
  for (const r of (state?.rabbits || [])) {
    if (r.status !== 'actif') continue;
    if (forSaleOnly && !r.forSale) continue;
    const w = weightIndex.get(r.id);
    if (w == null) continue;
    out.push({ rabbit: r, weightKg: w });
  }
  return out;
}

// ── Tri ──────────────────────────────────────────────────────────────────────

/**
 * Trie les lapins pesés par poids. Direction : 'asc' (défaut) ou 'desc'.
 */
export function getRabbitsSortedByWeight(state, { direction = 'asc', forSaleOnly = false } = {}) {
  const items = getRabbitsWithWeight(state, { forSaleOnly });
  const dir = direction === 'desc' ? -1 : 1;
  return items.sort((a, b) => dir * (a.weightKg - b.weightKg));
}

// ── Filtre par fourchette ────────────────────────────────────────────────────

/**
 * Filtre les lapins dont la dernière pesée tombe dans [min, max] kg (bornes incluses).
 * min/max nuls/non finis = pas de borne sur ce côté.
 */
export function getRabbitsByWeightRange(state, { min, max, forSaleOnly = false } = {}) {
  const lo = Number.isFinite(Number(min)) ? Number(min) : -Infinity;
  const hi = Number.isFinite(Number(max)) ? Number(max) :  Infinity;
  return getRabbitsWithWeight(state, { forSaleOnly })
    .filter(({ weightKg }) => weightKg >= lo && weightKg <= hi);
}

// ── Extrêmes ─────────────────────────────────────────────────────────────────

/**
 * Renvoie le plus léger et le plus lourd du cheptel pesé.
 * { lightest: {rabbit, weightKg} | null, heaviest: {…} | null }
 */
export function getWeightExtremes(state, { forSaleOnly = false } = {}) {
  const items = getRabbitsWithWeight(state, { forSaleOnly });
  if (items.length === 0) return { lightest: null, heaviest: null };
  let lightest = items[0];
  let heaviest = items[0];
  for (const it of items) {
    if (it.weightKg < lightest.weightKg) lightest = it;
    if (it.weightKg > heaviest.weightKg) heaviest = it;
  }
  return { lightest, heaviest };
}

// ── Recherche par budget ─────────────────────────────────────────────────────

/**
 * Trouve les lapins dont la valeur estimée correspond au budget client,
 * à ± `tolerance` près (0.10 = ±10 %).
 *
 * @param {object} state
 * @param {object} opts
 *   budget       – montant en devise de la ferme (number > 0)
 *   type         – 'live' (vif, défaut) ou 'carcass'
 *   tolerance    – fraction (défaut 0.10)
 *   forSaleOnly  – n'inclure que r.forSale === true (défaut true)
 *   settings     – farmSettings (priceLivePerKg, priceCarcassPerKg, carcassYield)
 *
 * @returns Array<{ rabbit, weightKg, value, deltaPct }>
 *   triée par |deltaPct| croissant (plus proche du budget en premier).
 *   deltaPct = (value - budget) / budget (signé).
 */
export function getRabbitsByBudget(state, {
  budget,
  type = 'live',
  tolerance = 0.10,
  forSaleOnly = true,
  settings,
} = {}) {
  const b = Number(budget);
  if (!Number.isFinite(b) || b <= 0) return [];
  const tol = Math.max(0, Number(tolerance) || 0);
  const lo  = b * (1 - tol);
  const hi  = b * (1 + tol);

  const out = [];
  for (const { rabbit, weightKg } of getRabbitsWithWeight(state, { forSaleOnly })) {
    const est   = estimateRabbitValue(weightKg, settings);
    const value = type === 'carcass' ? est.carcass : est.live;
    if (value < lo || value > hi) continue;
    out.push({
      rabbit,
      weightKg,
      value,
      deltaPct: (value - b) / b,
    });
  }
  out.sort((a, b2) => Math.abs(a.deltaPct) - Math.abs(b2.deltaPct));
  return out;
}
