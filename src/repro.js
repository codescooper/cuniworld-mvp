import { addDays } from "./utils.js";

export function latestEventOf(state, rabbitId, type) {
  // O(n) scan : on cherche juste le max sur date, pas besoin de filter+sort
  // (qui était O(n log n) et faisait exploser le dashboard à 1000 lapins).
  let best = null;
  for (const e of (state.events || [])) {
    if (e.rabbitId !== rabbitId || e.type !== type) continue;
    if (!best || (e.date || "").localeCompare(best.date || "") > 0) best = e;
  }
  return best;
}

/**
 * Indexe l'événement le plus récent de chaque (rabbitId, type) demandé en
 * UN seul passage sur state.events. Retourne Map<rabbitId, event>.
 *
 * Critique pour les renderers qui itèrent sur tous les lapins (dashboard,
 * liste) — sans cet index, on faisait O(rabbits × events) par render.
 */
export function buildLatestEventIndex(state, type) {
  const map = new Map();
  for (const e of (state.events || [])) {
    if (e.type !== type) continue;
    const prev = map.get(e.rabbitId);
    if (!prev || (e.date || "").localeCompare(prev.date || "") > 0) {
      map.set(e.rabbitId, e);
    }
  }
  return map;
}

export function getReproInfo(state, rabbit) {
  if (!rabbit || rabbit.sex !== "F" || rabbit.status !== "actif") return null;

  const lastMating = latestEventOf(state, rabbit.id, "saillie");
  const lastBirth = latestEventOf(state, rabbit.id, "mise_bas");

  if (!lastMating || !lastMating.date) {
    return { lastMating: null, lastBirth, dueDate: null, isPregnant: false, maleId: null };
  }

  const dueDate = addDays(lastMating.date, 28);
  const isPregnant = !lastBirth || lastBirth.date < lastMating.date;
  const maleId = lastMating.data?.maleId || null;

  return { lastMating, lastBirth, dueDate, isPregnant, maleId };
}

/**
 * Variante rapide de getReproInfo : prend en entrée des index pré-calculés
 * (cf. buildLatestEventIndex). Utilisée par les renderers en boucle sur
 * tous les lapins.
 */
export function getReproInfoFromIndex(rabbit, matingIdx, birthIdx) {
  if (!rabbit || rabbit.sex !== "F" || rabbit.status !== "actif") return null;
  const lastMating = matingIdx.get(rabbit.id) || null;
  const lastBirth  = birthIdx.get(rabbit.id)  || null;
  if (!lastMating || !lastMating.date) {
    return { lastMating: null, lastBirth, dueDate: null, isPregnant: false, maleId: null };
  }
  const dueDate = addDays(lastMating.date, 28);
  const isPregnant = !lastBirth || lastBirth.date < lastMating.date;
  const maleId = lastMating.data?.maleId || null;
  return { lastMating, lastBirth, dueDate, isPregnant, maleId };
}
