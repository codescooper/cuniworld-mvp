import { Store } from './store.js';

export const PORTIONS = {
  aucun:  { label: 'Aucune',  icon: '—',  color: '#94a3b8' },
  petit:  { label: 'Petit',   icon: '🟡', color: '#f59e0b' },
  moyen:  { label: 'Moyen',   icon: '🟠', color: '#f97316' },
  full:   { label: 'Full',    icon: '🔴', color: '#22c55e' },
};

const { uid, nowISO } = Store.helpers;

// ── Create / update round ─────────────────────────────────────────────────────

export function saveRound(state, {
  date, water, cleaning, feedings = [], notes = '',
  waterBy = null, cleaningBy = null,
}) {
  const existing = getRoundForDate(state, date);
  const now = nowISO();

  // On ne réécrit waterBy/cleaningBy QUE si le statut booléen passe à true et
  // qu'aucun auteur n'avait été enregistré, ou si un nouvel auteur est fourni.
  // Sinon on conserve l'auteur déjà stocké pour ne pas le perdre lors d'une
  // ré-ouverture/édition par un autre membre qui ne précise rien.
  const computeBy = (nextDone, nextBy, prevDone, prevBy) => {
    if (!nextDone) return null;
    if (nextBy && typeof nextBy === 'object') return { ...nextBy, at: nextBy.at || now };
    if (prevDone && prevBy) return prevBy;
    return null;
  };

  const round = {
    id:        existing?.id || uid('rd'),
    date,
    water:     !!water,
    waterBy:   computeBy(!!water, waterBy, !!existing?.water, existing?.waterBy),
    cleaning:  !!cleaning,
    cleaningBy: computeBy(!!cleaning, cleaningBy, !!existing?.cleaning, existing?.cleaningBy),
    feedings:  feedings.map(f => {
      const portion = PORTIONS[f.portion] ? f.portion : 'aucun';
      const prev = (existing?.feedings || []).find(p => p.rabbitId === f.rabbitId);
      // L'auteur du feeding n'est attaché qu'aux portions non-aucun.
      let by = null;
      if (portion !== 'aucun') {
        if (f.by && typeof f.by === 'object') by = { ...f.by, at: f.by.at || now };
        else if (prev?.by && prev.portion === portion) by = prev.by;
      }
      return { rabbitId: f.rabbitId, portion, by };
    }),
    notes:     notes.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const rounds = existing
    ? (state.rounds || []).map(r => r.id === existing.id ? round : r)
    : [...(state.rounds || []), round];

  return { ...state, rounds };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getRoundForDate(state, date) {
  return (state.rounds || []).find(r => r.date === date) || null;
}

export function getRecentRounds(state, n = 7) {
  return [...(state.rounds || [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n);
}

// How many rabbits were fed (portion !== 'aucun') in the last round
export function getTodayRoundSummary(state) {
  const today = new Date().toISOString().slice(0, 10);
  const round = getRoundForDate(state, today);
  if (!round) return null;

  const fedEntries = (round.feedings || []).filter(f => f.portion !== 'aucun');
  const fedCount = fedEntries.length;
  const total    = (state.rabbits || []).filter(r => r.status === 'actif').length;

  // Auteur "majoritaire" du nourrissage (s'il y a un nom partagé par la
  // plupart des feedings, on l'utilise comme libellé synthétique).
  const labelCounts = new Map();
  for (const f of fedEntries) {
    const lbl = f.by?.label;
    if (!lbl) continue;
    labelCounts.set(lbl, (labelCounts.get(lbl) || 0) + 1);
  }
  let feedBy = null;
  if (labelCounts.size > 0) {
    const [topLabel] = [...labelCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    feedBy = { label: topLabel };
  }

  return {
    round,
    fedCount,
    total,
    water:      round.water,
    cleaning:   round.cleaning,
    waterBy:    round.waterBy || null,
    cleaningBy: round.cleaningBy || null,
    feedBy,
    done:       round.water && round.cleaning && fedCount === total,
  };
}
