import { daysBetween } from "./utils.js";
import { getReproInfo } from "./repro.js";

export const RULES = {
  MIN_GESTATION_DAYS: 28,
  MAX_GESTATION_DAYS: null,
  MIN_WEAN_DAYS: 28,
};

function mustBeActiveRabbit(r) {
  if (!r) return "Lapin introuvable.";
  if (r.status === "mort") return "Impossible : ce lapin est déclaré mort.";
  if (r.status === "vendu") return "Impossible : ce lapin est déclaré vendu.";
  return null;
}

/**
 * Valide un événement AVANT insertion.
 * @returns { ok: true } ou { ok:false, error: string }
 */
export function validateEvent(state, rabbitId, draft, opts = {}) {
  const rules = { ...RULES, ...(opts.rules || {}) };

  const r = state.rabbits.find((x) => x.id === rabbitId);
  const err = mustBeActiveRabbit(r);
  if (err) return { ok: false, error: err };

  const type = draft.type;
  const date = draft.date;
  if (!date) return { ok: false, error: "Date obligatoire." };

  // Saillie : uniquement femelle active + mâle obligatoire
  if (type === "saillie") {
    if (r.sex !== "F") return { ok: false, error: "Saillie : seulement pour une femelle." };

    const maleId = draft?.data?.maleId;
    if (!maleId) return { ok: false, error: "Saillie : sélectionne le mâle." };
    if (maleId === rabbitId) return { ok: false, error: "Saillie : le mâle ne peut pas être la femelle." };

    const male = state.rabbits.find((x) => x.id === maleId);
    if (!male) return { ok: false, error: "Saillie : mâle introuvable." };
    if (male.sex !== "M") return { ok: false, error: "Saillie : sélection invalide (pas un mâle)." };
    if (male.status !== "actif") return { ok: false, error: "Saillie : le mâle doit être actif." };

    // Bloquer si gestation déjà en cours
    const repro = getReproInfo(state, r);
    if (repro?.lastMating?.date) {
      const lastMatingDate = repro.lastMating.date;
      const lastBirthDate = repro?.lastBirth?.date;
      const pregnant = !lastBirthDate || lastBirthDate < lastMatingDate;
      if (pregnant) {
        return { ok: false, error: "Impossible : une gestation est déjà en cours pour cette femelle." };
      }
    }
    return { ok: true };
  }

  // Mise-bas : doit suivre une saillie et respecter fenêtre de gestation
  if (type === "mise_bas") {
    if (r.sex !== "F") return { ok: false, error: "Mise-bas : seulement pour une femelle." };

    const repro = getReproInfo(state, r);
    const matingDate = repro?.lastMating?.date;
    if (!matingDate) {
      return { ok: false, error: "Impossible : aucune saillie trouvée avant cette mise-bas." };
    }

    const born = Number(draft?.data?.born ?? 0);
    const alive = Number(draft?.data?.alive ?? 0);
    const dead = Number(draft?.data?.dead ?? 0);
    if (born < 0 || alive < 0 || dead < 0) {
      return { ok: false, error: "Mise-bas : valeurs négatives interdites." };
    }
    if (born > 0 && alive + dead > born) {
      return { ok: false, error: "Mise-bas : vivants + morts ne peut pas dépasser nés." };
    }

    const days = daysBetween(matingDate, date);
    if (days < rules.MIN_GESTATION_DAYS) {
      const minISO = addDaysISO(matingDate, rules.MIN_GESTATION_DAYS);
      return { ok: false, error: `Mise-bas trop tôt : minimum le ${minISO} (saillie le ${matingDate}).` };
    }
    if (rules.MAX_GESTATION_DAYS != null && days > rules.MAX_GESTATION_DAYS) {
      const maxISO = addDaysISO(matingDate, rules.MAX_GESTATION_DAYS);
      return { ok: false, error: `Mise-bas trop tard : maximum le ${maxISO} (saillie le ${matingDate}).` };
    }
    return { ok: true };
  }

  // Sevrage : doit suivre une mise-bas et respecter délai
  if (type === "sevrage") {
    if (r.sex !== "F") return { ok: false, error: "Sevrage : seulement pour une femelle." };
    const repro = getReproInfo(state, r);
    const birthDate = repro?.lastBirth?.date;
    if (!birthDate) {
      return { ok: false, error: "Impossible : sevrage sans mise-bas enregistrée." };
    }
    const days = daysBetween(birthDate, date);
    if (days < rules.MIN_WEAN_DAYS) {
      const minISO = addDaysISO(birthDate, rules.MIN_WEAN_DAYS);
      return { ok: false, error: `Sevrage trop tôt : minimum le ${minISO} (mise-bas le ${birthDate}).` };
    }
    return { ok: true };
  }

  // Décès / Vente
  if (type === "décès" || type === "deces") return { ok: true };
  if (type === "vente") return { ok: true };

  // vaccin/traitement : nextDate si présent doit être >= date
  if (type === "vaccin" || type === "traitement") {
    const nextDate = draft?.data?.nextDate;
    if (nextDate) {
      if (nextDate < date) {
        return { ok: false, error: "nextDate ne peut pas être avant la date de l'événement." };
      }
    }
    return { ok: true };
  }

  return { ok: true };
}

/**
 * Effets automatiques APRÈS insertion.
 */
export function applyEventSideEffects(ctx, event) {
  const state = ctx.state;
  const r = state.rabbits.find((x) => x.id === event.rabbitId);
  if (!r) return state;
  const { nowISO } = ctx.Store.helpers;

  if (event.type === "décès" || event.type === "deces") {
    r.status = "mort";
    r.updatedAt = nowISO();
  }

  if (event.type === "vente") {
    r.status = "vendu";
    r.updatedAt = nowISO();
  }

  // Mise-bas -> création des petits
  if (event.type === "mise_bas") {
    const alive = Number(event?.data?.alive ?? 0);
    if (alive > 0 && !event.data.kitsCreated) {
      const { uid } = ctx.Store.helpers;

      const repro = getReproInfo(state, r);
      const fatherId = repro?.lastMating?.data?.maleId || null;
      const dateStamp = toDateStamp(event.date);
      const startIndex = getNextKitIndex(state, dateStamp);

      for (let i = 1; i <= alive; i++) {
        const n = String(startIndex + i - 1).padStart(2, "0");
        const kit = {
          id: uid("rb"),
          code: `CW-KIT-${dateStamp}-${n}`,
          name: `Laperau ${n}`,
          sex: "U",
          breed: r.breed || "",
          birthDate: event.date,
          cage: r.cage || "",
          status: "actif",
          stage: "kit",
          notes: `Né le ${event.date} (portée ${r.code || r.name || "inconnue"})`,
          doeId: r.id,
          buckId: fatherId,
          litterId: event.id,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        state.rabbits.unshift(kit);
      }

      event.data.kitsCreated = true;
      event.data.kitsCount = alive;
    }
  }

  if (event.type === "sevrage") {
    const repro = getReproInfo(state, r);
    const litterEvent = repro?.lastBirth;
    if (litterEvent) {
      const destCage = (event.data?.destCage || "").trim();
      state.rabbits.forEach((kit) => {
        if (kit.litterId !== litterEvent.id) return;
        if (kit.status !== "actif") return;
        kit.stage = "jeune";
        if (destCage) kit.cage = destCage;
        kit.updatedAt = nowISO();
      });
    }
  }

  return state;
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getNextKitIndex(state, dateStamp) {
  const prefix = `CW-KIT-${dateStamp}-`;
  const existing = state.rabbits
    .map((r) => r.code || "")
    .filter((code) => code.startsWith(prefix))
    .map((code) => Number(code.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));

  const max = existing.length ? Math.max(...existing) : 0;
  return max + 1;
}

function toDateStamp(iso) {
  const cleaned = (iso || "").replaceAll("-", "");
  return cleaned.length >= 6 ? cleaned.slice(2, 8) : cleaned;
}
