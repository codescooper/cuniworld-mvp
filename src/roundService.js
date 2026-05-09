import { Store } from './store.js';

export const PORTIONS = {
  aucun:  { label: 'Aucune',  icon: '—',  color: '#94a3b8' },
  petit:  { label: 'Petit',   icon: '🟡', color: '#f59e0b' },
  moyen:  { label: 'Moyen',   icon: '🟠', color: '#f97316' },
  full:   { label: 'Full',    icon: '🔴', color: '#22c55e' },
};

const { uid, nowISO } = Store.helpers;

// ── Create / update round ─────────────────────────────────────────────────────

export function saveRound(state, { date, water, cleaning, feedings = [], notes = '' }) {
  const existing = getRoundForDate(state, date);
  const round = {
    id:        existing?.id || uid('rd'),
    date,
    water:     !!water,
    cleaning:  !!cleaning,
    feedings:  feedings.map(f => ({
      rabbitId: f.rabbitId,
      portion:  PORTIONS[f.portion] ? f.portion : 'aucun',
    })),
    notes:     notes.trim(),
    createdAt: existing?.createdAt || nowISO(),
    updatedAt: nowISO(),
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

  const fedCount = (round.feedings || []).filter(f => f.portion !== 'aucun').length;
  const total    = (state.rabbits || []).filter(r => r.status === 'actif').length;

  return {
    round,
    fedCount,
    total,
    water:    round.water,
    cleaning: round.cleaning,
    done:     round.water && round.cleaning && fedCount === total,
  };
}
