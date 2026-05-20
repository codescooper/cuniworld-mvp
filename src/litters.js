import { num, sum } from "./utils.js";
import { deathCauseLabel } from "./lots.js";

export function getEvents(state, rabbitId, type) {
  return state.events
    .filter(e => e.rabbitId === rabbitId && (!type || e.type === type))
    .sort((a,b) => (b.date || "").localeCompare(a.date || ""));
}

/**
 * Statistiques de portée d'une femelle, calculées EN DIRECT à partir des
 * lapereaux réels (records) — pas seulement des chiffres figés à la mise-bas.
 * Ainsi les mort-nés ET les décès survenus après la naissance sont reflétés
 * dans la survie et la mortalité.
 */
export function getLitterStatsForDoe(state, rabbitId) {
  const litters = getEvents(state, rabbitId, "mise_bas");
  const born = sum(litters.map((e) => {
    const declared = e.data?.born;
    if (declared !== null && declared !== undefined && declared !== "") return num(declared);
    return num(e.data?.alive) + num(e.data?.dead);
  }));
  const aliveAtBirth = sum(litters.map(e => num(e.data?.alive)));
  const stillborn = Math.max(0, born - aliveAtBirth);

  // Descendance réelle rattachée à la mère.
  const offspring = (state.rabbits || []).filter(r => (r.doeId || r.motherId) === rabbitId);
  const currentAlive   = offspring.filter(r => r.status === "actif").length;
  const deadPostBirth  = offspring.filter(r => r.status === "mort").length;
  const sold           = offspring.filter(r => r.status === "vendu").length;

  const dead = stillborn + deadPostBirth;            // mortalité totale
  const survivors = Math.max(0, born - dead);
  const survival = born > 0 ? Math.round((survivors / born) * 100) : 0;
  const count = litters.length;

  return {
    count, born,
    alive: aliveAtBirth,   // compat : nés vivants
    aliveAtBirth,
    currentAlive,
    dead,                  // total morts (mort-nés + post-naissance)
    deadPostBirth,
    stillborn,
    sold,
    survival,
    activeKits: currentAlive, // compat
  };
}

export function formatEventDetails(e) {
  const parts = [];
  if (e.type === "mise_bas") {
    const b = (e.data?.born ?? "") === "" ? num(e.data?.alive) + num(e.data?.dead) : num(e.data?.born);
    const a = num(e.data?.alive);
    const d = num(e.data?.dead);
    if (b || a || d) parts.push(`Nés: ${b} · Vivants: ${a} · Morts: ${d}`);
  }
  if (e.type === "sevrage") {
    const w = num(e.data?.weaned);
    const c = (e.data?.destCage || "").trim();
    if (w) parts.push(`Sevrés: ${w}`);
    if (c) parts.push(`Cage: ${c}`);
  }
  if (e.type === "pesée") {
    const weight = num(e.data?.weight);
    if (weight) parts.push(`Poids: ${weight} kg`);
  }
  if (e.type === "décès" || e.type === "deces") {
    const cause = (e.data?.cause || "").trim();
    if (cause) parts.push(`Cause: ${deathCauseLabel(cause)}`);
  }
  if (e.notes) parts.push(e.notes);
  return parts.length ? parts.join(" — ") : "—";
}
