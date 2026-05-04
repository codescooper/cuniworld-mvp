/**
 * rabbitNameService.js – Gestion du pool de noms Naruto
 *
 * Modèle de données :
 *   state.usedNames = { [name]: rabbitId }
 *   Un nom absent de usedNames est disponible.
 *   Seul l'ensemble des noms utilisés est persisté (pas les 528 noms).
 *
 * API publique :
 *   isNameFromPool(name)                           – vrai si le nom vient du pool
 *   isNameAvailable(state, name, exceptId?)        – vrai si le nom est libre
 *   isNameUsedByLivingRabbit(name, rabbits, exceptId?) – vrai si un lapin actif le porte
 *   suggestAvailableRabbitName(state, previous?)   – tire un nom disponible aléatoirement
 *   lockRabbitName(state, name, rabbitId)          – marque le nom comme utilisé (mutate)
 *   releaseRabbitName(state, name)                 – libère le nom (mutate)
 */

import { NARUTO_NAMES } from "./narutoNames.js";

// Set pour O(1) sur isNameFromPool
const _POOL_SET = new Set(NARUTO_NAMES);

// ─── Requêtes ─────────────────────────────────────────────────────────────────

/** Vrai si le nom fait partie du pool Naruto. */
export function isNameFromPool(name) {
  return _POOL_SET.has(name);
}

/**
 * Vrai si le nom est disponible dans l'état courant.
 * `exceptId` permet à un lapin de "garder" son propre nom lors d'une modification.
 */
export function isNameAvailable(state, name, exceptId = null) {
  const owner = state.usedNames?.[name];
  if (!owner) return true;
  return owner === exceptId;
}

/**
 * Vrai si au moins un lapin actif (autre que `exceptId`) porte déjà ce nom.
 * Utilisé pour les noms manuels (hors pool).
 */
export function isNameUsedByLivingRabbit(name, rabbits, exceptId = null) {
  return rabbits.some(r => r.name === name && r.status === "actif" && r.id !== exceptId);
}

// ─── Suggestion ───────────────────────────────────────────────────────────────

/**
 * Tire aléatoirement un nom disponible dans le pool.
 * - Évite de reproposer `previous` sauf s'il n'y a plus d'autre choix.
 * - Si le pool est épuisé, génère un nom de secours "Lapin-XXX".
 *
 * @param   {object}      state     État applicatif (nécessite usedNames + rabbits)
 * @param   {string|null} previous  Dernière suggestion, à éviter si possible
 * @returns {string}
 */
export function suggestAvailableRabbitName(state, previous = null) {
  const used = state.usedNames || {};

  // Candidats : tous les noms libres, sauf la suggestion précédente si d'autres existent
  let candidates = NARUTO_NAMES.filter(n => !used[n] && n !== previous);

  if (candidates.length === 0) {
    // Ré-inclure l'ancien previous s'il a été libéré entre-temps
    candidates = NARUTO_NAMES.filter(n => !used[n]);
  }

  if (candidates.length === 0) {
    return _fallbackName(state);
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ─── Mutations (conformes au pattern du codebase) ────────────────────────────

/**
 * Enregistre `name → rabbitId` dans `state.usedNames`.
 * No-op si le nom n'est pas dans le pool.
 */
export function lockRabbitName(state, name, rabbitId) {
  if (!_POOL_SET.has(name)) return;
  if (!state.usedNames) state.usedNames = {};
  state.usedNames[name] = rabbitId;
}

/**
 * Supprime l'entrée `name` de `state.usedNames`.
 * No-op si le nom n'est pas dans le pool ou pas enregistré.
 */
export function releaseRabbitName(state, name) {
  if (!_POOL_SET.has(name) || !state.usedNames) return;
  delete state.usedNames[name];
}

// ─── Interne ─────────────────────────────────────────────────────────────────

function _fallbackName(state) {
  const living = new Set(
    (state.rabbits || [])
      .filter(r => r.status === "actif")
      .map(r => r.name)
  );
  let i = 1;
  while (i <= 9999) {
    const candidate = `Lapin-${String(i).padStart(3, "0")}`;
    if (!living.has(candidate)) return candidate;
    i++;
  }
  return `Lapin-${Date.now()}`;
}
