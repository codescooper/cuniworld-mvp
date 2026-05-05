import { daysBetween } from './utils.js';
import { getRabbitWeightHistory } from './weightService.js';
import { getPhotoHistory } from './photos.js';
import { getReproInfo } from './repro.js';
import { getBreedingStatus } from './breeding.js';

const DISMISSED_KEY = 'dismissedTodayActions';

// ── Dismissal ─────────────────────────────────────────────────────────────────

export function dismissActionForToday(actionId) {
  const today = new Date().toISOString().slice(0, 10);
  const list = _getDismissed().filter(d => d.date === today);
  list.push({ id: actionId, date: today });
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(list)); } catch (_) {}
}

export function isActionDismissedToday(actionId, currentDate) {
  const today = currentDate || new Date().toISOString().slice(0, 10);
  return _getDismissed().some(d => d.id === actionId && d.date === today);
}

function _getDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); } catch (_) { return []; }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function getTodayFarmActions(state, currentDate) {
  const today = currentDate || new Date().toISOString().slice(0, 10);

  const all = [
    ...getHealthActions(state, today),
    ...getWeaningActions(state, today),
    ...getBreedingActions(state, today),
    ...getWeightActions(state, today),
    ...getPhotoActions(state, today),
  ].filter(a => !isActionDismissedToday(a.id, today));

  const urgent       = all.filter(a => a.priority === 'urgent');
  const todayActions = all.filter(a => a.priority === 'today');
  const opportunities = all.filter(a => a.priority === 'opportunity');

  const u = urgent.length;
  const t = todayActions.length;
  const o = opportunities.length;

  return {
    urgent,
    today: todayActions,
    opportunities,
    total: all.length,
    summary: `${u} urgence${u !== 1 ? 's' : ''} · ${t} action${t !== 1 ? 's' : ''} · ${o} opportunité${o !== 1 ? 's' : ''}`,
  };
}

// ── Weight ────────────────────────────────────────────────────────────────────

export function getWeightActions(state, currentDate) {
  const today = currentDate || new Date().toISOString().slice(0, 10);
  const actions = [];

  for (const r of (state.rabbits || [])) {
    if (r.status !== 'actif') continue;
    const history  = getRabbitWeightHistory(state, r.id);
    const last     = history.length > 0 ? history[history.length - 1] : null;
    const daysSince = last ? daysBetween(last.date, today) : null;

    if (!last) {
      actions.push({
        id: `weight_${r.id}`,
        type: 'weight',
        priority: 'urgent',
        icon: '⚖️',
        label: `Peser ${r.name}`,
        meta: `${r.code} · Jamais pesé`,
        rabbitId: r.id,
        action: 'weightCheck',
      });
    } else if (daysSince >= 7) {
      actions.push({
        id: `weight_${r.id}`,
        type: 'weight',
        priority: 'urgent',
        icon: '⚖️',
        label: `Peser ${r.name}`,
        meta: `${r.code} · Dernière pesée il y a ${daysSince} j`,
        rabbitId: r.id,
        action: 'weightCheck',
      });
    } else if (daysSince >= 2) {
      actions.push({
        id: `weight_${r.id}`,
        type: 'weight',
        priority: 'today',
        icon: '⚖️',
        label: `Peser ${r.name}`,
        meta: `${r.code} · Dernière pesée il y a ${daysSince} j`,
        rabbitId: r.id,
        action: 'weightCheck',
      });
    }
  }

  return actions;
}

// ── Photo ─────────────────────────────────────────────────────────────────────

export function getPhotoActions(state, currentDate) {
  const today = currentDate || new Date().toISOString().slice(0, 10);
  const actions = [];

  for (const r of (state.rabbits || [])) {
    if (r.status !== 'actif') continue;
    const history   = getPhotoHistory(state, r.id);
    const last      = history[0] || null;
    const daysSince = last ? daysBetween(last.date, today) : null;
    const rabbitAge = r.birthDate ? daysBetween(r.birthDate, today) : 999;

    if (!last && rabbitAge >= 14) {
      actions.push({
        id: `photo_${r.id}`,
        type: 'photo',
        priority: 'opportunity',
        icon: '📷',
        label: `Photographier ${r.name}`,
        meta: `${r.code} · Aucune photo`,
        rabbitId: r.id,
        action: 'photoCheck',
      });
    } else if (last && daysSince >= 30) {
      actions.push({
        id: `photo_${r.id}`,
        type: 'photo',
        priority: 'opportunity',
        icon: '📷',
        label: `Photographier ${r.name}`,
        meta: `${r.code} · Dernière photo il y a ${daysSince} j`,
        rabbitId: r.id,
        action: 'photoCheck',
      });
    }
  }

  return actions;
}

// ── Breeding ──────────────────────────────────────────────────────────────────

export function getBreedingActions(state, currentDate) {
  const today = currentDate || new Date().toISOString().slice(0, 10);
  const actions = [];

  for (const r of (state.rabbits || [])) {
    if (r.status !== 'actif') continue;
    const repro = getReproInfo(state, r);
    if (!repro) continue;

    if (repro.isPregnant && repro.dueDate) {
      const daysLeft = daysBetween(today, repro.dueDate);
      if (daysLeft < 0) {
        actions.push({
          id: `birth_${r.id}`,
          type: 'breeding',
          priority: 'urgent',
          icon: '🤰',
          label: `Mise-bas en retard : ${r.name}`,
          meta: `${r.code} · Terme prévu le ${repro.dueDate} (J${daysLeft})`,
          rabbitId: r.id,
          action: 'openRabbit',
        });
      } else if (daysLeft <= 2) {
        actions.push({
          id: `birth_${r.id}`,
          type: 'breeding',
          priority: 'urgent',
          icon: '🤰',
          label: `Mise-bas imminente : ${r.name}`,
          meta: `${r.code} · Terme dans ${daysLeft} j (${repro.dueDate})`,
          rabbitId: r.id,
          action: 'openRabbit',
        });
      } else if (daysLeft <= 5) {
        actions.push({
          id: `birth_${r.id}`,
          type: 'breeding',
          priority: 'today',
          icon: '🤰',
          label: `Préparer la mise-bas : ${r.name}`,
          meta: `${r.code} · Terme dans ${daysLeft} j (${repro.dueDate})`,
          rabbitId: r.id,
          action: 'openRabbit',
        });
      }
    } else if (!repro.isPregnant) {
      const breedingInfo = getBreedingStatus(r, state, today);
      if (breedingInfo?.status === 'disponible') {
        actions.push({
          id: `breed_${r.id}`,
          type: 'breeding',
          priority: 'opportunity',
          icon: '🐇',
          label: `Saillie possible : ${r.name}`,
          meta: `${r.code} · ${breedingInfo.reason}`,
          rabbitId: r.id,
          action: 'openRabbit',
        });
      }
    }
  }

  return actions;
}

// ── Weaning ───────────────────────────────────────────────────────────────────

export function getWeaningActions(state, currentDate) {
  const today = currentDate || new Date().toISOString().slice(0, 10);
  const actions = [];

  for (const r of (state.rabbits || [])) {
    if (r.status !== 'actif' || r.sex !== 'F') continue;

    const births = (state.events || [])
      .filter(e => e.rabbitId === r.id && e.type === 'mise_bas')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (!births.length) continue;
    const lastBirth = births[0];

    const hasWeaning = (state.events || []).some(
      e => e.rabbitId === r.id && e.type === 'sevrage' && (e.date || '') >= (lastBirth.date || '')
    );
    if (hasWeaning) continue;

    const daysSinceBirth = daysBetween(lastBirth.date, today);
    if (daysSinceBirth < 0) continue;

    if (daysSinceBirth >= 35) {
      actions.push({
        id: `wean_${r.id}`,
        type: 'weaning',
        priority: 'urgent',
        icon: '🐣',
        label: `Sevrage en retard : ${r.name}`,
        meta: `${r.code} · Mise-bas il y a ${daysSinceBirth} j`,
        rabbitId: r.id,
        action: 'openRabbit',
      });
    } else if (daysSinceBirth >= 28) {
      actions.push({
        id: `wean_${r.id}`,
        type: 'weaning',
        priority: 'today',
        icon: '🐣',
        label: `Sevrage à prévoir : ${r.name}`,
        meta: `${r.code} · Mise-bas il y a ${daysSinceBirth} j`,
        rabbitId: r.id,
        action: 'openRabbit',
      });
    }
  }

  return actions;
}

// ── Health ────────────────────────────────────────────────────────────────────

export function getHealthActions(state, currentDate) {
  const today = currentDate || new Date().toISOString().slice(0, 10);
  const actions = [];
  const rabbitsById = new Map((state.rabbits || []).map(r => [r.id, r]));

  for (const e of (state.events || [])) {
    if (e.type !== 'vaccin' && e.type !== 'traitement') continue;
    const nextDate = (e.data?.nextDate || '').slice(0, 10);
    if (!nextDate) continue;

    const rabbit = rabbitsById.get(e.rabbitId);
    if (!rabbit || rabbit.status !== 'actif') continue;

    const daysLeft  = daysBetween(today, nextDate);
    const typeLabel = e.type === 'vaccin' ? 'Vaccin' : 'Traitement';
    const product   = e.data?.product ? ` (${e.data.product})` : '';

    if (daysLeft < 0) {
      actions.push({
        id: `health_${e.id}`,
        type: 'health',
        priority: 'urgent',
        icon: '💊',
        label: `${typeLabel} en retard : ${rabbit.name}`,
        meta: `${rabbit.code}${product} · Prévu le ${nextDate} (J${daysLeft})`,
        rabbitId: rabbit.id,
        action: 'openRabbit',
      });
    } else if (daysLeft <= 3) {
      actions.push({
        id: `health_${e.id}`,
        type: 'health',
        priority: 'today',
        icon: '💊',
        label: `${typeLabel} à venir : ${rabbit.name}`,
        meta: `${rabbit.code}${product} · Prévu le ${nextDate} (dans ${daysLeft} j)`,
        rabbitId: rabbit.id,
        action: 'openRabbit',
      });
    } else if (daysLeft <= 7) {
      actions.push({
        id: `health_${e.id}`,
        type: 'health',
        priority: 'opportunity',
        icon: '💊',
        label: `${typeLabel} à planifier : ${rabbit.name}`,
        meta: `${rabbit.code}${product} · Prévu le ${nextDate} (dans ${daysLeft} j)`,
        rabbitId: rabbit.id,
        action: 'openRabbit',
      });
    }
  }

  return actions;
}
