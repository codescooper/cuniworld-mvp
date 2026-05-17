/**
 * feedTracking.js — Suivi de l'alimentation et indice de consommation.
 *
 * Indice de consommation (IC) = kg aliment consommé / kg vif produit.
 * En cuniculture, un IC sain tourne autour de 3.0–3.5 pour l'engraissement.
 *
 * Pour le MVP, on agrège **au niveau global** (toute la ferme) et **par
 * période** (mois ou période libre). On n'essaie pas de répartir précisément
 * par lot car la traçabilité aliment→cage→lot demande de l'instrumentation
 * que peu d'éleveurs feront. À la place :
 *   - Conso aliments = somme des sorties stock (`type=sortie`) des articles
 *     en catégorie `aliment`, sur la période, convertie en kg quand l'unité
 *     est explicitement "kg" ou "sac" (1 sac = 25 kg par défaut, paramétrable).
 *   - Production vive = somme des poids actuels des lapins encore actifs +
 *     poids à la vente (event `vente`) sur la période.
 *
 * On retourne les détails pour permettre à l'utilisateur de comprendre d'où
 * vient l'IC affiché et d'en discuter avec son vétérinaire.
 */

const SACK_KG_DEFAULT = 25;

function _unitToKg(quantity, unit, sackKg = SACK_KG_DEFAULT) {
  const q = Number(quantity);
  if (!Number.isFinite(q)) return 0;
  const u = (unit || '').toLowerCase().trim();
  if (u === 'kg' || u === 'kilo' || u === 'kilos') return q;
  if (u === 'g' || u === 'gramme' || u === 'grammes') return q / 1000;
  if (u === 'sac' || u === 'sacs') return q * sackKg;
  if (u === 't' || u === 'tonne' || u === 'tonnes') return q * 1000;
  // unité inconnue : on suppose des kg (conservateur — n'inflate pas l'IC).
  return q;
}

/**
 * Calcule la conso d'aliments (en kg) sur une période [from, to] inclusive.
 *
 * @param state
 * @param {{ from?: string, to?: string, sackKg?: number }} opts
 *   from / to : dates ISO (YYYY-MM-DD). Bornes nulles = ouvertes.
 *   sackKg    : kg par sac (défaut 25).
 * @returns { totalKg, byItem: Array<{ itemId, name, kg, lastUnit }> }
 */
export function computeFeedConsumption(state, { from, to, sackKg = SACK_KG_DEFAULT } = {}) {
  const stockById = new Map((state.stock || []).map(i => [i.id, i]));
  const movements = (state.stockMovements || []).filter(m => {
    if (m.type !== 'sortie') return false;
    const item = stockById.get(m.stockItemId);
    if (!item || item.category !== 'aliment') return false;
    if (from && (m.date || '') < from) return false;
    if (to   && (m.date || '') > to)   return false;
    return true;
  });
  const byItem = new Map();
  let totalKg = 0;
  for (const m of movements) {
    const item = stockById.get(m.stockItemId);
    const kg = _unitToKg(m.quantity, item.unit, sackKg);
    totalKg += kg;
    const row = byItem.get(item.id) || { itemId: item.id, name: item.name, kg: 0, lastUnit: item.unit };
    row.kg += kg;
    byItem.set(item.id, row);
  }
  return {
    totalKg: Math.round(totalKg * 1000) / 1000,
    byItem: [...byItem.values()].sort((a, b) => b.kg - a.kg),
  };
}

/**
 * Production vive sur la période = poids vendus + poids actuel des lapins
 * actifs (estimation, dernière pesée connue).
 *
 * @param {{ from?: string, to?: string }} opts
 * @returns { producedKg, soldKg, currentStockKg, weighedActive }
 */
export function computeLiveProduction(state, { from, to } = {}) {
  const events = state.events || [];

  // Ventes sur la période — on prend le poids inscrit dans data.weight si dispo,
  // sinon la dernière pesée connue du lapin AVANT la vente.
  const peseesByRabbit = new Map();
  for (const e of events) {
    if (e.type !== 'pesée') continue;
    const arr = peseesByRabbit.get(e.rabbitId) || [];
    arr.push(e);
    peseesByRabbit.set(e.rabbitId, arr);
  }
  for (const arr of peseesByRabbit.values()) arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  let soldKg = 0;
  for (const e of events) {
    if (e.type !== 'vente') continue;
    if (from && (e.date || '') < from) continue;
    if (to   && (e.date || '') > to)   continue;
    const explicit = Number(e.data?.weight);
    if (explicit > 0) { soldKg += explicit; continue; }
    // Sinon : dernière pesée avant la date de vente
    const pesees = peseesByRabbit.get(e.rabbitId) || [];
    const matching = [...pesees].reverse().find(p => (p.date || '') <= (e.date || ''));
    if (matching) soldKg += Number(matching.data?.weight) || 0;
  }

  // Cheptel actif aujourd'hui : poids actuel des lapins encore vivants.
  let currentStockKg = 0;
  let weighedActive = 0;
  for (const r of (state.rabbits || [])) {
    if (r.status !== 'actif') continue;
    const pesees = peseesByRabbit.get(r.id) || [];
    if (pesees.length === 0) continue;
    const last = pesees[pesees.length - 1];
    currentStockKg += Number(last.data?.weight) || 0;
    weighedActive += 1;
  }

  return {
    soldKg:         Math.round(soldKg * 1000) / 1000,
    currentStockKg: Math.round(currentStockKg * 1000) / 1000,
    producedKg:     Math.round((soldKg + currentStockKg) * 1000) / 1000,
    weighedActive,
  };
}

/**
 * Indice de consommation global sur la période.
 *
 * @returns {{
 *   feedKg, producedKg, indice (null si producedKg = 0),
 *   feed: <feedConsumption>, production: <liveProduction>
 * }}
 */
export function computeConsumptionIndex(state, opts = {}) {
  const feed = computeFeedConsumption(state, opts);
  const production = computeLiveProduction(state, opts);
  const indice = production.producedKg > 0
    ? Math.round((feed.totalKg / production.producedKg) * 100) / 100
    : null;
  return {
    feedKg:     feed.totalKg,
    producedKg: production.producedKg,
    indice,
    feed,
    production,
  };
}

export { SACK_KG_DEFAULT };
