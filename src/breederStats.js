/**
 * breederStats.js — Classements de reproducteurs.
 *
 * Femelles  : tri par fertilité combinée
 *   - portées par an (annualisé sur la période d'activité)
 *   - sevrés par portée moyenne
 *   - taux de survie naissance→sevrage
 *
 * Mâles     : tri par paternité confirmée
 *   - nombre de saillies enregistrées (event saillie où data.maleId = mâle)
 *   - nombre de portées attribuables (sevrages dont les lapereaux ont buckId)
 *
 * On expose un score composite pour chaque femelle (utile pour décider
 * d'éliminer les moins productives) — sans imposer une pondération unique :
 * `score = portéesParAn * sevrésParPortée * (survie/100)`.
 */

import { getLitterStatsForDoe } from './litters.js';

const DAY_MS = 86_400_000;

function _ageDays(birthDateISO, ref = new Date()) {
  if (!birthDateISO) return null;
  const b = new Date(birthDateISO);
  if (isNaN(b)) return null;
  return Math.max(1, Math.floor((ref - b) / DAY_MS));
}

/**
 * Calcule les sevrés rattachables à une femelle :
 *   - somme des `weaned`/`weanedCount`/`rabbitIds.length` des events sevrage
 *     dont rabbitId = doeId.
 */
function _weanedForDoe(state, doeId) {
  let total = 0;
  for (const e of (state.events || [])) {
    if (e.type !== 'sevrage' || e.rabbitId !== doeId) continue;
    const d = e.data || {};
    const explicit = Number(d.weanedCount ?? d.weaned);
    if (Number.isFinite(explicit) && explicit > 0) { total += explicit; continue; }
    if (Array.isArray(d.rabbitIds)) total += d.rabbitIds.length;
  }
  return total;
}

/**
 * Classement des femelles. Retourne un tableau trié par `score` décroissant.
 *
 * @param {object} state
 * @param {{ minLitters?: number, includeZero?: boolean }} opts
 *   minLitters  : nombre min de portées pour être inclus (défaut 1 — on
 *                 ignore les non-reproductrices, qui pollueraient le tri).
 *   includeZero : si true, inclut aussi les femelles sans portée (utile pour
 *                 voir les jeunes femelles à mettre en repro).
 */
export function rankFemales(state, { minLitters = 1, includeZero = false } = {}) {
  const today = new Date();
  const out = [];
  const threshold = includeZero ? 0 : Math.max(1, minLitters);
  for (const r of (state.rabbits || [])) {
    if (r.sex !== 'F') continue;
    const stats = getLitterStatsForDoe(state, r.id);
    if (stats.count < threshold) continue;
    const ageDays = _ageDays(r.birthDate, today);
    // Active depuis ~ageDays - 120 (maturité approximative), borne à 30 j min.
    const activeDays = ageDays != null ? Math.max(30, ageDays - 120) : null;
    const littersPerYear = activeDays != null && stats.count > 0
      ? Math.round((stats.count / activeDays) * 365 * 10) / 10
      : null;
    const weanedTotal = _weanedForDoe(state, r.id);
    const weanedPerLitter = stats.count > 0
      ? Math.round((weanedTotal / stats.count) * 10) / 10
      : 0;
    const score = (littersPerYear || 0) * weanedPerLitter * (stats.survival / 100);
    out.push({
      rabbit: r,
      litters: stats.count,
      born: stats.born,
      alive: stats.alive,
      survival: stats.survival,
      activeKits: stats.activeKits,
      weanedTotal,
      weanedPerLitter,
      littersPerYear,
      score: Math.round(score * 10) / 10,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * Classement des mâles. Tri par nombre de paternités confirmées (lapereaux
 * sevrés dont le buckId pointe sur le mâle), puis par nombre de saillies.
 */
export function rankMales(state) {
  const buckByLapereaux = new Map();      // buckId → nombre de lapereaux
  for (const r of (state.rabbits || [])) {
    const bid = r.buckId || r.fatherId;
    if (!bid) continue;
    buckByLapereaux.set(bid, (buckByLapereaux.get(bid) || 0) + 1);
  }

  const matingsByBuck = new Map();        // buckId → nb d'événements saillie où data.maleId = buckId
  for (const e of (state.events || [])) {
    if (e.type !== 'saillie') continue;
    const bid = e.data?.maleId;
    if (!bid) continue;
    matingsByBuck.set(bid, (matingsByBuck.get(bid) || 0) + 1);
  }

  const out = [];
  for (const r of (state.rabbits || [])) {
    if (r.sex !== 'M') continue;
    const matings = matingsByBuck.get(r.id) || 0;
    const offspring = buckByLapereaux.get(r.id) || 0;
    if (matings === 0 && offspring === 0) continue;
    out.push({
      rabbit: r,
      matings,
      offspring,
    });
  }
  // Tri principal : nombre de descendants confirmés. Tie-break : saillies.
  out.sort((a, b) => (b.offspring - a.offspring) || (b.matings - a.matings));
  return out;
}
