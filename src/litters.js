import { num, sum } from "./utils.js";

export function getEvents(state, rabbitId, type) {
  return state.events
    .filter(e => e.rabbitId === rabbitId && (!type || e.type === type))
    .sort((a,b) => (b.date || "").localeCompare(a.date || ""));
}

export function getLitterStatsForDoe(state, rabbitId) {
  const litters = getEvents(state, rabbitId, "mise_bas");
  const born = sum(litters.map(e => num(e.data?.born)));
  const alive = sum(litters.map(e => num(e.data?.alive)));
  const dead = sum(litters.map(e => num(e.data?.dead)));
  const count = litters.length;
  const survival = born > 0 ? Math.round((alive / born) * 100) : 0;
  return { count, born, alive, dead, survival };
}

export function formatEventDetails(e) {
  const parts = [];
  if (e.type === "mise_bas") {
    const b = num(e.data?.born);
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
  if (e.notes) parts.push(e.notes);
  return parts.length ? parts.join(" — ") : "—";
}
