import { escapeHTML, num } from "./utils.js";
import { latestEventOf } from "./repro.js";

/**
 * Un LOT = une PORTÉE (événement `mise_bas`), suivi depuis la naissance.
 *
 * Cycle de vie (statut) :
 *   maternité → sevré → loges (individuelles) → vendu / terminé
 *
 * Le statut effectif = override manuel (`state.lotStatuses[lotId]`) sinon
 * statut dérivé du cycle réel (présence d'un sevrage).
 */
export const LOT_STATUSES = {
  maternite: { label: "Maternité", cls: "badge accent",  hint: "Lapereaux sous la mère" },
  sevre:     { label: "Sevré",     cls: "badge warn",    hint: "Sevré, en bâtiment collectif" },
  loges:     { label: "En loges",  cls: "badge ok",      hint: "Répartis en loges individuelles" },
  vendu:     { label: "Vendu",     cls: "badge warning", hint: "Lot vendu" },
  termine:   { label: "Terminé",   cls: "badge muted",   hint: "Lot clôturé" },
};

/** Causes de perte (mortalité) — alimentent les stats de mortalité par cause. */
export const DEATH_CAUSES = {
  maladie:      "Maladie",
  ecrasement:   "Écrasement par la mère",
  froid:        "Froid / hypothermie",
  faim:         "Faim / abandon maternel",
  predateur:    "Prédateur",
  malformation: "Malformation",
  blessure:     "Blessure / accident",
  inconnu:      "Cause inconnue",
};

export function deathCauseLabel(cause) {
  return DEATH_CAUSES[cause] || cause || "—";
}

/** Identifiant stable d'un lot à partir de l'événement mise-bas. */
export function lotIdForLitter(eventId) {
  return `lot_${eventId}`;
}

/** Sevrage rattaché à une portée (par litterId, sinon par mère + date). */
export function weaningEventForLitter(state, litterEvent) {
  return (state.events || []).find(ev =>
    ev.type === "sevrage" && (
      ev.data?.litterId === litterEvent.id ||
      (!ev.data?.litterId && ev.rabbitId === litterEvent.rabbitId && (ev.date || "") >= (litterEvent.date || ""))
    )
  ) || null;
}

/** Statut dérivé du cycle de vie réel (utilisé si pas d'override manuel). */
export function derivedLotStatus(state, litterEvent) {
  return weaningEventForLitter(state, litterEvent) ? "sevre" : "maternite";
}

function _dominantCage(rabbits) {
  const counts = new Map();
  for (const r of rabbits) {
    const c = (r.cage || "").trim();
    if (!c) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  let best = null, bestN = 0;
  for (const [c, n] of counts) if (n > bestN) { best = c; bestN = n; }
  return best;
}

export function buildLots(state) {
  const rabbitsById = new Map((state.rabbits || []).map(r => [r.id, r]));
  const statuses = state.lotStatuses || {};

  const lots = (state.events || [])
    .filter(e => e.type === "mise_bas")
    .map(e => {
      const doe = rabbitsById.get(e.rabbitId);
      const id = lotIdForLitter(e.id);

      // Lapereaux réellement rattachés à la portée (records vivants/morts/vendus).
      const kits     = (state.rabbits || []).filter(r => r.litterId === e.id);
      const alive    = kits.filter(r => r.status === "actif");
      const deadKits = kits.filter(r => r.status === "mort");
      const soldKits = kits.filter(r => r.status === "vendu");

      // Nés / nés vivants / mort-nés.
      const bornAlive = kits.length || num(e.data?.alive);
      const born = (e.data?.born ?? "") === ""
        ? num(e.data?.alive) + num(e.data?.dead)
        : num(e.data?.born);
      const stillborn = Math.max(0, born - bornAlive);

      // Père : dernière saillie de la mère, sinon buckId des lapereaux.
      const lastMating = latestEventOf(state, e.rabbitId, "saillie");
      const kitWithFather = kits.find(k => k.buckId || k.fatherId);
      const fatherId = lastMating?.data?.maleId
        || kitWithFather?.buckId || kitWithFather?.fatherId || null;
      const buck = fatherId ? (rabbitsById.get(fatherId) || null) : null;

      const weaningEvent = weaningEventForLitter(state, e);

      const cage = _dominantCage(alive)
        || (weaningEvent?.data?.destCage || "").trim()
        || (doe?.cage || "").trim()
        || "—";

      const status = statuses[id] || derivedLotStatus(state, e);

      return {
        id,
        eventId: e.id,
        doeId: e.rabbitId,
        doeName: doe?.name || "Mère inconnue",
        doeCode: doe?.code || "—",
        buckName: buck?.name || null,
        buckCode: buck?.code || null,
        date: e.date || "—",
        born,
        bornAlive,
        stillborn,
        aliveCount: alive.length,
        deadPostBirth: deadKits.length,
        deadCount: deadKits.length + stillborn,
        soldCount: soldKits.length,
        weaned: weaningEvent ? num(weaningEvent.data?.weanedCount ?? weaningEvent.data?.weaned) : 0,
        rabbitIds: kits.map(k => k.id),
        aliveRabbitIds: alive.map(k => k.id),
        cage,
        notes: e.notes || "",
        status,
        autoStatus: derivedLotStatus(state, e),
      };
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return lots;
}

export function lotBadge(lot) {
  const meta = LOT_STATUSES[lot.status] || LOT_STATUSES.maternite;
  const alive = `<span class="badge ok">${escapeHTML(String(lot.aliveCount))} vivant${lot.aliveCount > 1 ? "s" : ""}</span>`;
  const losses = lot.deadCount > 0
    ? ` <span class="badge danger">${escapeHTML(String(lot.deadCount))} perte${lot.deadCount > 1 ? "s" : ""}</span>`
    : "";
  return `${alive}${losses} <span class="${meta.cls}">${escapeHTML(meta.label)}</span>`;
}
