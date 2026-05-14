import { escapeHTML, num } from "./utils.js";

export const LOT_STATUSES = {
  en_cours: { label: "En cours",  cls: "badge ok"      },
  vendu:    { label: "Vendu",     cls: "badge warning"  },
  termine:  { label: "Terminé",   cls: "badge muted"    },
};

export function buildLots(state) {
  const rabbitsById = new Map(state.rabbits.map(r => [r.id, r]));
  const statuses = state.lotStatuses || {};

  const lots = state.events
    .filter(e => e.type === "sevrage")
    .map(e => {
      const doe = rabbitsById.get(e.rabbitId);
      const rabbitIds = e.data?.rabbitIds || [];
      const weaned = Math.max(num(e.data?.weanedCount), rabbitIds.length, num(e.data?.weaned)) || 0;
      const cage = (e.data?.destCage || "").trim() || "—";
      const id = `lot_${e.id}`;
      // Père : dérivé du buckId des lapereaux du lot (renseigné à la mise-bas).
      let buck = null;
      for (const rid of rabbitIds) {
        const kit = rabbitsById.get(rid);
        if (kit && (kit.buckId || kit.fatherId)) {
          buck = rabbitsById.get(kit.buckId || kit.fatherId);
          if (buck) break;
        }
      }
      return {
        id,
        eventId: e.id,
        doeId: e.rabbitId,
        doeName: doe?.name || "Mère inconnue",
        doeCode: doe?.code || "—",
        buckName: buck?.name || null,
        buckCode: buck?.code || null,
        date: e.date || "—",
        weaned,
        rabbitIds,
        cage,
        notes: e.notes || "",
        status: statuses[id] || "en_cours",
      };
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return lots;
}

export function lotBadge(lot) {
  const statusMeta = LOT_STATUSES[lot.status] || LOT_STATUSES.en_cours;
  return `<span class="badge ok">${escapeHTML(String(lot.weaned))} sevrés</span> <span class="${statusMeta.cls}">${statusMeta.label}</span>`;
}
