/**
 * weightService.js – Suivi et visualisation du poids des lapins
 *
 * Design : les pesées sont stockées en tant qu'événements de type "pesée"
 * dans state.events (source de vérité). Ce module les lit, les agrège
 * et génère les graphiques SVG — aucune duplication de données.
 *
 * API publique :
 *   getRabbitWeightHistory(state, rabbitId)    → [{date, weightKg}] trié ASC
 *   getCurrentWeight(state, rabbitId)           → number | null
 *   getRabbitWeightEvolution                    → alias getRabbitWeightHistory
 *   getTotalHerdWeightEvolution(state)          → [{date, totalWeightKg}]
 *   migrateRabbitWeightData(state)              → bool (true si migration effectuée)
 *   renderWeightSVG(points, opts?)              → string SVG
 */

import { daysBetween } from "./utils.js";

// ─── Historique individuel ────────────────────────────────────────────────────

/**
 * Retourne les pesées d'un lapin triées par date croissante.
 * Dédoublonne les pesées du même jour en gardant la plus récente (par createdAt).
 */
export function getRabbitWeightHistory(state, rabbitId) {
  const pesees = (state.events || [])
    .filter(e => e.rabbitId === rabbitId && e.type === "pesée" && Number(e.data?.weight) > 0)
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : (a.createdAt || "").localeCompare(b.createdAt || "");
    });

  // En cas de plusieurs pesées le même jour, garder la dernière
  const byDate = new Map();
  for (const e of pesees) byDate.set(e.date, e);

  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, weightKg: Number(e.data.weight) }));
}

export const getRabbitWeightEvolution = getRabbitWeightHistory;

/** Poids actuel = dernière pesée enregistrée. */
export function getCurrentWeight(state, rabbitId) {
  const h = getRabbitWeightHistory(state, rabbitId);
  return h.length > 0 ? h[h.length - 1].weightKg : null;
}

// ─── Évolution globale du cheptel ─────────────────────────────────────────────

/**
 * Pour chaque date de pesée, additionne le dernier poids connu de chaque
 * lapin vivant à cette date.
 *
 * Exclut un lapin si un événement décès existe AVANT la date calculée.
 *
 * @returns {Array<{date: string, totalWeightKg: number}>}
 */
export function getTotalHerdWeightEvolution(state) {
  const rabbits = state.rabbits || [];
  const events  = state.events  || [];

  // Index des dates de décès par rabbitId
  const deathDates = {};
  for (const e of events) {
    if ((e.type === "décès" || e.type === "deces") && !deathDates[e.rabbitId]) {
      deathDates[e.rabbitId] = e.date;
    }
  }

  // Index des pesées par rabbitId → liste triée DESC
  const peseesByRabbit = {};
  for (const e of events) {
    if (e.type === "pesée" && Number(e.data?.weight) > 0) {
      if (!peseesByRabbit[e.rabbitId]) peseesByRabbit[e.rabbitId] = [];
      peseesByRabbit[e.rabbitId].push(e);
    }
  }
  for (const id in peseesByRabbit) {
    peseesByRabbit[id].sort((a, b) => b.date.localeCompare(a.date));
  }

  // Toutes les dates de pesée distinctes, triées
  const allDates = [...new Set(
    events.filter(e => e.type === "pesée" && Number(e.data?.weight) > 0).map(e => e.date)
  )].sort();

  if (allDates.length === 0) return [];

  return allDates.map(date => {
    let total = 0;
    for (const rabbit of rabbits) {
      // Exclure les lapins décédés avant cette date
      const death = deathDates[rabbit.id];
      if (death && death < date) continue;

      // Dernier poids connu à cette date
      const pesees = peseesByRabbit[rabbit.id] || [];
      const last = pesees.find(e => e.date <= date);
      if (last) total += Number(last.data.weight);
    }
    return { date, totalWeightKg: Math.round(total * 1000) / 1000 };
  });
}

// ─── Migration des anciennes données ──────────────────────────────────────────

/**
 * Détecte les lapins avec `weight` ou `currentWeight` en champ direct
 * et crée un événement pesée de migration.
 * Idempotent : vérifie l'ID de migration avant d'insérer.
 *
 * @returns {boolean} true si au moins un lapin a été migré
 */
export function migrateRabbitWeightData(state) {
  const today = new Date().toISOString().slice(0, 10);
  let changed = false;

  for (const rabbit of (state.rabbits || [])) {
    const legacy = rabbit.weight ?? rabbit.currentWeight;
    const legacyKg = Number(legacy);
    if (!Number.isFinite(legacyKg) || legacyKg <= 0) continue;

    const migId = `ev_mig_${rabbit.id}_w`;
    const alreadyMigrated = (state.events || []).some(e => e.id === migId);
    if (alreadyMigrated) continue;

    if (!state.events) state.events = [];
    state.events.push({
      id: migId,
      rabbitId: rabbit.id,
      type: "pesée",
      date: (rabbit.createdAt || today).slice(0, 10),
      notes: "Poids migré depuis une ancienne version",
      data: { weight: legacyKg },
      createdAt: new Date().toISOString(),
    });

    delete rabbit.weight;
    delete rabbit.currentWeight;
    changed = true;
  }
  return changed;
}

// ─── Graphique SVG ────────────────────────────────────────────────────────────

/**
 * Génère un graphique en ligne (SVG) à partir d'une série de points.
 *
 * @param {Array<{label: string, value: number}>} points
 * @param {object} opts
 *   id        – préfixe unique pour les IDs SVG (défaut: aléatoire)
 *   width     – largeur du viewBox (défaut: 560)
 *   height    – hauteur du viewBox (défaut: 180)
 *   color     – couleur principale (défaut: #4f7942)
 *   unit      – unité affichée dans les tooltips (défaut: "kg")
 *   maxLabels – nombre max de labels sur l'axe X (défaut: 6)
 */
export function renderWeightSVG(points, opts = {}) {
  const W      = opts.width     ?? 560;
  const H      = opts.height    ?? 180;
  const color  = opts.color     ?? "#4f7942";
  const unit   = opts.unit      ?? "kg";
  const maxL   = opts.maxLabels ?? 6;
  const gid    = `wg_${opts.id || Math.random().toString(36).slice(2, 8)}`;
  const PAD    = { top: 16, right: 16, bottom: 36, left: 52 };
  const iW     = W - PAD.left - PAD.right;
  const iH     = H - PAD.top  - PAD.bottom;

  if (points.length === 0) {
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block">
      <text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#aaa" font-size="13" font-family="system-ui">Aucune donnée de poids.</text>
    </svg>`;
  }

  const values = points.map(p => p.value);
  let minV = Math.min(...values);
  let maxV = Math.max(...values);
  if (minV === maxV) { minV -= 0.2; maxV += 0.2; }
  const rangeV = maxV - minV;

  const xOf = i => PAD.left + (points.length === 1 ? iW / 2 : (i / (points.length - 1)) * iW);
  const yOf = v => PAD.top  + iH - ((v - minV) / rangeV) * iH;

  // Aire de remplissage
  let fillPath = "";
  if (points.length > 1) {
    const pts = points.map((p, i) => `${xOf(i)},${yOf(p.value)}`).join(" L ");
    fillPath = `M${xOf(0)},${yOf(minV)} L${pts} L${xOf(points.length - 1)},${yOf(minV)} Z`;
  }

  // Polyline
  const polyline = points.length > 1
    ? `<polyline points="${points.map((p, i) => `${xOf(i)},${yOf(p.value)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
    : "";

  // Points
  const dots = points.map((p, i) =>
    `<circle cx="${xOf(i)}" cy="${yOf(p.value)}" r="${points.length === 1 ? 6 : 4}" fill="${color}" stroke="#fff" stroke-width="2"><title>${_fmtDate(p.label)} : ${p.value} ${unit}</title></circle>`
  ).join("");

  // Grille Y + labels Y (3 niveaux)
  const yTicks = [minV, minV + rangeV * 0.5, maxV].map(v => {
    const y = yOf(v);
    return `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + iW}" y2="${y}" stroke="#ececec" stroke-width="1"/>
    <text x="${PAD.left - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#999" font-family="system-ui">${v.toFixed(2)}</text>`;
  }).join("");

  // Labels X (max maxL, toujours le premier et le dernier)
  const step    = Math.max(1, Math.floor(points.length / maxL));
  const indices = new Set([0, points.length - 1]);
  for (let i = step; i < points.length - 1; i += step) indices.add(i);
  const xLabels = [...indices].sort((a, b) => a - b).map(i => {
    const p = points[i];
    return `<text x="${xOf(i)}" y="${H - PAD.bottom + 14}" text-anchor="middle" font-size="10" fill="#999" font-family="system-ui">${_fmtDate(p.label)}</text>`;
  }).join("");

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block" role="img" aria-label="Graphique de poids">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="${color}" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>

      <!-- Axes -->
      <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + iH}" stroke="#ddd" stroke-width="1"/>
      <line x1="${PAD.left}" y1="${PAD.top + iH}" x2="${PAD.left + iW}" y2="${PAD.top + iH}" stroke="#ddd" stroke-width="1"/>

      <!-- Grille et labels Y -->
      ${yTicks}

      <!-- Aire -->
      ${fillPath ? `<path d="${fillPath}" fill="url(#${gid})"/>` : ""}

      <!-- Ligne -->
      ${polyline}

      <!-- Points -->
      ${dots}

      <!-- Labels X -->
      ${xLabels}
    </svg>`;
}

// ─── Interne ─────────────────────────────────────────────────────────────────

function _fmtDate(iso) {
  if (!iso || iso.length < 10) return iso || "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
