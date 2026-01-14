import { escapeHTML } from "./utils.js";

export function buildLots(state) {
  // 1 lot = 1 événement sevrage
  const rabbitsById = new Map(state.rabbits.map(r => [r.id, r]));
  const lots = state.events
    .filter(e => e.type === "sevrage")
    .map(e => {
      const doe = rabbitsById.get(e.rabbitId);
      const weaned = Number(e.data?.weaned || 0) || 0;
      const cage = (e.data?.destCage || "").trim() || "—";
      return {
        id: `lot_${e.id}`,
        eventId: e.id,
        doeId: e.rabbitId,
        doeName: doe?.name || "Mère inconnue",
        doeCode: doe?.code || "—",
        date: e.date || "—",
        weaned,
        cage,
        notes: e.notes || ""
      };
    })
    .sort((a,b) => (b.date || "").localeCompare(a.date || ""));

  return lots;
}

export function lotBadge(lot) {
  return `<span class="badge ok">${escapeHTML(String(lot.weaned))} sevrés</span>`;
}
