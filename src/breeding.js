/**
 * breeding.js – Règles métier de reproduction des lapins
 *
 * API publique :
 *   BREEDING_CONFIG                              – valeurs configurables
 *   isRabbitMatureForBreeding(rabbit, date?)     – vrai si âge ≥ MIN_AGE_DAYS
 *   isFemaleAvailableAfterBirth(rabbit, state, date?) – vrai si délai post-mise-bas écoulé
 *   getBreedingStatus(rabbit, state, date?)      – statut complet avec raison et date de dispo
 *   breedingStatusBadge(status)                  – badge HTML pour l'affichage
 */

import { daysBetween, addDays } from "./utils.js";
import { latestEventOf } from "./repro.js";

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Toutes les durées sont en jours. Modifier ici pour ajuster les règles.
 */
export const BREEDING_CONFIG = {
  MIN_AGE_DAYS: 120,          // 4 mois – âge minimum absolu pour la reproduction
  RECOMMENDED_AGE_DAYS: 150,  // 5 mois – âge conseillé
  WEAN_DAYS: 35,              // durée d'allaitement estimée après mise-bas
  REST_DAYS: 14,              // repos post-sevrage avant nouvelle saillie
  // Délai total post-mise-bas = WEAN_DAYS + REST_DAYS = 49 j par défaut
};

// ─── Fonctions de haut niveau ─────────────────────────────────────────────────

/**
 * Vérifie si un lapin a atteint l'âge minimum de reproduction.
 * Retourne `true` si la date de naissance est absente (bénéfice du doute).
 */
export function isRabbitMatureForBreeding(rabbit, currentDate = _today()) {
  if (!rabbit?.birthDate) return true;
  return daysBetween(rabbit.birthDate, currentDate) >= BREEDING_CONFIG.MIN_AGE_DAYS;
}

/**
 * Vérifie si une femelle est passée le délai post-mise-bas.
 * Utilise la date de sevrage enregistrée si disponible, sinon estime à partir de la mise-bas.
 * Retourne toujours `true` pour un mâle ou un lapin sans historique de mise-bas.
 */
export function isFemaleAvailableAfterBirth(rabbit, state, currentDate = _today()) {
  if (rabbit?.sex !== "F") return true;

  const lastBirth = latestEventOf(state, rabbit.id, "mise_bas");
  if (!lastBirth?.date) return true;

  const lastWeaning = latestEventOf(state, rabbit.id, "sevrage");
  const weaningAfterBirth = lastWeaning?.date >= lastBirth.date ? lastWeaning.date : null;

  if (weaningAfterBirth) {
    return daysBetween(weaningAfterBirth, currentDate) >= BREEDING_CONFIG.REST_DAYS;
  }
  const delay = BREEDING_CONFIG.WEAN_DAYS + BREEDING_CONFIG.REST_DAYS;
  return daysBetween(lastBirth.date, currentDate) >= delay;
}

/**
 * Calcule le statut complet de reproduction d'un lapin.
 *
 * @returns {{
 *   status: "trop_jeune"|"disponible"|"gestante"|"allaitement"|"repos"|"indisponible",
 *   reason: string,
 *   availableFrom?: string  // ISO date, présente seulement si non disponible
 * }}
 */
export function getBreedingStatus(rabbit, state, currentDate = _today()) {
  // ── Lapin inactif ────────────────────────────────────────────────────────────
  if (!rabbit || rabbit.status !== "actif") {
    const reason =
      rabbit?.status === "mort"  ? "Lapin décédé." :
      rabbit?.status === "vendu" ? "Lapin vendu." :
                                   "Lapin inactif.";
    return { status: "indisponible", reason };
  }

  // ── Override manuel ───────────────────────────────────────────────────────────
  // "indisponible" : bloque immédiatement, quels que soient âge et événements.
  // "disponible"   : saute uniquement la vérification d'âge ; gestation/allaitement/repos restent actifs.
  if (rabbit.breedingOverride === "indisponible") {
    return { status: "indisponible", reason: "Non disponible (renseigné manuellement)." };
  }
  const skipAgeCheck = rabbit.breedingOverride === "disponible";

  // ── Trop jeune ───────────────────────────────────────────────────────────────
  if (!skipAgeCheck && rabbit.birthDate) {
    const ageDays = daysBetween(rabbit.birthDate, currentDate);
    if (ageDays < BREEDING_CONFIG.MIN_AGE_DAYS) {
      const daysLeft = BREEDING_CONFIG.MIN_AGE_DAYS - ageDays;
      return {
        status: "trop_jeune",
        reason: `Trop jeune pour la reproduction (encore ${daysLeft}j, min. ${BREEDING_CONFIG.MIN_AGE_DAYS}j).`,
        availableFrom: addDays(rabbit.birthDate, BREEDING_CONFIG.MIN_AGE_DAYS),
      };
    }
  }

  // ── Statuts spécifiques aux femelles ─────────────────────────────────────────
  if (rabbit.sex === "F") {
    const lastMating  = latestEventOf(state, rabbit.id, "saillie");
    const lastBirth   = latestEventOf(state, rabbit.id, "mise_bas");
    const lastWeaning = latestEventOf(state, rabbit.id, "sevrage");

    // Gestante : dernière saillie sans mise-bas suivante
    if (lastMating?.date && (!lastBirth || lastBirth.date < lastMating.date)) {
      const dueDate = addDays(lastMating.date, 31);
      return {
        status: "gestante",
        reason: `Gestation en cours (terme estimé le ${dueDate}).`,
        availableFrom: addDays(dueDate, BREEDING_CONFIG.WEAN_DAYS + BREEDING_CONFIG.REST_DAYS),
      };
    }

    // Post-mise-bas : allaitement ou repos
    if (lastBirth?.date) {
      const weaningAfterBirth = (lastWeaning?.date && lastWeaning.date >= lastBirth.date)
        ? lastWeaning.date
        : null;

      if (!weaningAfterBirth) {
        // Pas encore de sevrage enregistré → estimation à partir de la mise-bas
        const daysSinceBirth = daysBetween(lastBirth.date, currentDate);
        const availableFrom  = addDays(lastBirth.date, BREEDING_CONFIG.WEAN_DAYS + BREEDING_CONFIG.REST_DAYS);

        if (daysSinceBirth < BREEDING_CONFIG.WEAN_DAYS) {
          const daysLeft = BREEDING_CONFIG.WEAN_DAYS - daysSinceBirth;
          return {
            status: "allaitement",
            reason: `En allaitement (sevrage estimé dans ${daysLeft}j).`,
            availableFrom,
          };
        }

        if (daysSinceBirth < BREEDING_CONFIG.WEAN_DAYS + BREEDING_CONFIG.REST_DAYS) {
          const daysLeft = BREEDING_CONFIG.WEAN_DAYS + BREEDING_CONFIG.REST_DAYS - daysSinceBirth;
          return {
            status: "repos",
            reason: `En récupération post-sevrage (${daysLeft}j restants).`,
            availableFrom,
          };
        }
      } else {
        // Sevrage enregistré → repos à partir de la date réelle
        const daysSinceWeaning = daysBetween(weaningAfterBirth, currentDate);
        if (daysSinceWeaning < BREEDING_CONFIG.REST_DAYS) {
          const daysLeft = BREEDING_CONFIG.REST_DAYS - daysSinceWeaning;
          return {
            status: "repos",
            reason: `En récupération post-sevrage (${daysLeft}j restants).`,
            availableFrom: addDays(weaningAfterBirth, BREEDING_CONFIG.REST_DAYS),
          };
        }
      }
    }
  }

  // ── Disponible ───────────────────────────────────────────────────────────────
  // Signale si l'âge recommandé n'est pas encore atteint (mais ne bloque pas)
  if (rabbit.birthDate) {
    const ageDays = daysBetween(rabbit.birthDate, currentDate);
    if (ageDays < BREEDING_CONFIG.RECOMMENDED_AGE_DAYS) {
      const daysLeft = BREEDING_CONFIG.RECOMMENDED_AGE_DAYS - ageDays;
      return {
        status: "disponible",
        reason: `Disponible (âge optimal dans ${daysLeft}j, recommandé : ${BREEDING_CONFIG.RECOMMENDED_AGE_DAYS}j).`,
      };
    }
  }

  return { status: "disponible", reason: "Disponible pour reproduction." };
}

// ─── Badge HTML ───────────────────────────────────────────────────────────────

export function breedingStatusBadge(status) {
  const map = {
    trop_jeune:   ["warn",   "Trop jeune"],
    disponible:   ["ok",     "Disponible"],
    gestante:     ["accent", "Gestante"],
    allaitement:  ["accent", "Allaitement"],
    repos:        ["warn",   "Repos"],
    indisponible: ["danger", "Indisponible"],
  };
  const [cls, label] = map[status] ?? ["", status];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── Interne ─────────────────────────────────────────────────────────────────

function _today() {
  return new Date().toISOString().slice(0, 10);
}
