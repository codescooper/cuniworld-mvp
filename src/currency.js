/**
 * currency.js — Conversion multi-devises avec taux figés par exercice.
 *
 * Pourquoi des taux figés par année plutôt que des taux temps réel ?
 * Pour la comptabilité, les administrations fiscales attendent un taux
 * stable pour toute la durée d'un exercice. Et on évite la dépendance à
 * un service externe (rate-limits, indispo réseau).
 *
 * Les taux sont saisis manuellement dans `RATES[year][CODE]` (1 unité de
 * cette devise = X devises de référence). La devise de référence est la
 * devise CONFIGURÉE PAR LA FERME (settings.currencyCode) — par défaut XOF
 * pour CuniWorld FR/Afrique de l'Ouest.
 *
 * Pour convertir un montant : multiplier par le taux source / taux cible.
 */

/**
 * Table des taux relatifs à l'EUR (1 EUR = X devise).
 * Ces taux sont des MOYENNES officielles à mettre à jour par année.
 * Source à privilégier : Banque de France (taux de référence annuels).
 *
 * Format : RATES[YYYY][CODE] = nb d'unités de CODE pour 1 EUR.
 */
export const RATES = {
  2024: {
    EUR: 1,
    USD: 1.08,
    XOF: 655.957,    // Fixe CFA-Euro depuis 1999
    XAF: 655.957,    // Idem
    CDF: 2940,
    MAD: 10.9,
    GBP: 0.85,
  },
  2025: {
    EUR: 1,
    USD: 1.08,
    XOF: 655.957,
    XAF: 655.957,
    CDF: 3100,
    MAD: 10.85,
    GBP: 0.84,
  },
  2026: {
    EUR: 1,
    USD: 1.10,        // estimatif — à mettre à jour début d'exercice
    XOF: 655.957,
    XAF: 655.957,
    CDF: 3250,
    MAD: 10.9,
    GBP: 0.85,
  },
};

const CODES_LABELS = {
  EUR: 'Euro',
  USD: 'Dollar US',
  XOF: 'Franc CFA BCEAO',
  XAF: 'Franc CFA BEAC',
  CDF: 'Franc congolais',
  MAD: 'Dirham marocain',
  GBP: 'Livre sterling',
};

/**
 * Liste des codes connus avec leur libellé. Utile pour les sélecteurs UI.
 */
export function availableCurrencies() {
  return Object.entries(CODES_LABELS).map(([code, label]) => ({ code, label }));
}

/**
 * Année comptable d'une date ISO (slice 0..4). null si invalide.
 */
function _year(dateISO) {
  if (!dateISO || dateISO.length < 4) return null;
  const y = Number(dateISO.slice(0, 4));
  return Number.isInteger(y) ? y : null;
}

/**
 * Retourne le taux disponible pour `code` à l'année `year`, avec fallback
 * sur l'année la plus récente disponible. Null si code totalement inconnu.
 */
function _rateForYear(code, year) {
  if (!code) return null;
  const code0 = code.toUpperCase();
  if (year && RATES[year]?.[code0] !== undefined) return RATES[year][code0];
  // Fallback : prendre l'année la plus récente disponible.
  const years = Object.keys(RATES).map(Number).sort((a, b) => b - a);
  for (const y of years) {
    if (RATES[y][code0] !== undefined) return RATES[y][code0];
  }
  return null;
}

/**
 * Convertit `amount` exprimé en `fromCode` vers `toCode`, en utilisant la
 * table de taux de l'année `year` (ou la plus récente disponible).
 *
 * @returns number | null  null si une devise est inconnue.
 */
export function convert(amount, fromCode, toCode, year) {
  const a = Number(amount);
  if (!Number.isFinite(a)) return null;
  if (!fromCode || !toCode) return null;
  if (fromCode.toUpperCase() === toCode.toUpperCase()) return a;

  const rFrom = _rateForYear(fromCode, year);
  const rTo   = _rateForYear(toCode, year);
  if (rFrom == null || rTo == null) return null;

  // amount (from) → EUR : / rFrom ;  EUR → to : × rTo
  return Math.round((a / rFrom) * rTo * 10000) / 10000;
}

/**
 * Convertit en utilisant l'année déduite d'une date ISO.
 */
export function convertOnDate(amount, fromCode, toCode, dateISO) {
  return convert(amount, fromCode, toCode, _year(dateISO));
}

/**
 * Convertit un agrégat comptable. Prend un tableau `{ date, amount }` en
 * devise `fromCode` et retourne le total en `toCode`, taux résolu PAR LIGNE
 * selon l'année de chaque date (fidélité comptable).
 */
export function convertAggregate(items, fromCode, toCode) {
  let total = 0;
  let skipped = 0;
  for (const it of (items || [])) {
    const v = convertOnDate(it.amount, fromCode, toCode, it.date);
    if (v == null) { skipped++; continue; }
    total += v;
  }
  return { total: Math.round(total * 100) / 100, skipped };
}

// Exposé pour les tests
export const _internals = { _rateForYear, _year };
