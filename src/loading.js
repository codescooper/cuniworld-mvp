import { escapeHTML } from "./utils.js";

/**
 * loading.js — Indicateurs de chargement réutilisables.
 *
 * - `spinnerHTML()` : bloc spinner inline pour remplacer les placeholders
 *   « Chargement… » d'un panneau.
 * - `beginFetch()/endFetch()/trackFetch()` : barre de chargement globale
 *   (en haut de l'écran), à compteur, affichée pendant la récupération de
 *   données distantes (lecture cloud, imports différés…).
 */

/** Markup d'un spinner inline réutilisable. */
export function spinnerHTML(label = "Chargement…", { size = "" } = {}) {
  const cls = size === "lg" ? "spinner spinner-lg" : size === "sm" ? "spinner spinner-sm" : "spinner";
  return `<div class="loading-block" role="status" aria-live="polite">
    <span class="${cls}" aria-hidden="true"></span>
    ${label ? `<span class="loading-label">${escapeHTML(label)}</span>` : ""}
  </div>`;
}

// ── Barre de chargement globale (récupération de données) ────────────────────
let _count = 0;

function _bar() {
  return (typeof document !== "undefined") ? document.getElementById("appLoadingBar") : null;
}

export function beginFetch() {
  _count += 1;
  const b = _bar();
  if (b) { b.classList.add("active"); b.setAttribute("aria-hidden", "false"); }
}

export function endFetch() {
  _count = Math.max(0, _count - 1);
  if (_count === 0) {
    const b = _bar();
    if (b) { b.classList.remove("active"); b.setAttribute("aria-hidden", "true"); }
  }
}

/** Affiche la barre globale le temps qu'une promesse de lecture se résolve. */
export function trackFetch(promise) {
  beginFetch();
  return Promise.resolve(promise).finally(endFetch);
}

/** Remet le compteur à zéro (sécurité, ex. après une erreur de navigation). */
export function resetFetch() {
  _count = 0;
  const b = _bar();
  if (b) { b.classList.remove("active"); b.setAttribute("aria-hidden", "true"); }
}
