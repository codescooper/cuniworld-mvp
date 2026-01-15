// src/rules.js
import { daysBetween } from "./utils.js";
import { getReproInfo } from "./repro.js";

export const RULES = {
  MIN_GESTATION_DAYS: 28,
  MAX_GESTATION_DAYS: 35,   // optionnel (si tu veux juste min, mets null)
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

  const r = state.rabbits.find(x => x.id === rabbitId);
  const err = mustBeActiveRabbit(r);
  if (err) return { ok: false, error: err };

  const type = draft.type;
  const date = draft.date;

  if (!date) return { ok: false, error: "Date obligatoire." };

  // Saillie : uniquement femelle active
  if (type === "saillie") {
    if (r.sex !== "F") return { ok: false, error: "Saillie : seulement pour une femelle." };

    // Option: bloquer si déjà gestante (une saillie récente sans mise-bas)
    const repro = getReproInfo(state, r);
    if (repro?.lastMating?.date && repro?.dueDate) {
      // si on détecte une gestation active
      const alreadyPregnant = !!repro.lastMating && !repro.lastBirth; // selon ton repro.js
      if (alreadyPregnant) {
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
    const repro = getReproInfo(state, r);
    const birthDate = repro?.lastBirth?.date; // adapte si ton repro.js nomme autrement
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

  // Décès : date obligatoire, mettra le lapin en mort (side-effect)
  if (type === "décès" || type === "deces") {
    return { ok: true };
  }

  // Vente : mettra le lapin en vendu (optionnel)
  if (type === "vente") {
    return { ok: true };
  }

  // vaccin/traitement : nextDate si présent doit être >= date
  if (type === "vaccin" || type === "traitement") {
    const nextDate = draft?.data?.nextDate;
    if (nextDate) {
      if (nextDate < date) return { ok: false, error: "nextDate ne peut pas être avant la date de l'événement." };
    }
    return { ok: true };
  }

  return { ok: true };
}

/**
 * Effets automatiques APRÈS insertion.
 * Retourne state (muté ou non).
 */
export function applyEventSideEffects(state, event) {
  const r = state.rabbits.find(x => x.id === event.rabbitId);
  if (!r) return state;

  if (event.type === "décès" || event.type === "deces") {
    r.status = "mort";
    r.updatedAt = new Date().toISOString().slice(0, 10);
  }

  if (event.type === "vente") {
    r.status = "vendu";
    r.updatedAt = new Date().toISOString().slice(0, 10);
  }

  return state;
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
