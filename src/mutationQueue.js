import { DB } from './db.js';

const KEY = 'cuniworld_mvp_mutation_queue';
const MAX_RETRIES = 5;

function loadQueue() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function enqueueMutation(type, payload, error = null) {
  const queue = loadQueue();
  queue.push({
    id: `mq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: error ? String(error?.message || error) : null,
  });
  saveQueue(queue);
  return queue.length;
}

export function getPendingMutationCount() {
  return loadQueue().length;
}

async function runMutation(m) {
  const p = m.payload || {};
  switch (m.type) {
    // ── Core ──
    case 'upsertRabbit':       return DB.upsertRabbit(p.farmId, p.rabbit);
    case 'deleteRabbit':       return DB.deleteRabbit(p.farmId, p.rabbitId);
    case 'upsertEvent':        return DB.upsertEvent(p.farmId, p.event);
    case 'deleteEvent':        return DB.deleteEvent(p.farmId, p.eventId);
    case 'upsertPhoto':        return DB.upsertPhoto(p.farmId, p.photo);
    case 'deletePhoto':        return DB.deletePhoto(p.farmId, p.photoId);
    case 'setUsedName':        return DB.setUsedName(p.farmId, p.name, p.rabbitId);
    case 'deleteUsedName':     return DB.deleteUsedName(p.farmId, p.name);
    // ── Bâtiments ──
    case 'upsertBuilding':     return DB.upsertBuilding(p.farmId, p.building);
    case 'deleteBuilding':     return DB.deleteBuilding(p.farmId, p.buildingId);
    case 'upsertLodge':        return DB.upsertLodge(p.farmId, p.lodge);
    case 'deleteLodge':        return DB.deleteLodge(p.farmId, p.lodgeId);
    case 'upsertLodgeDefect':  return DB.upsertLodgeDefect(p.farmId, p.defect);
    case 'deleteLodgeDefect':  return DB.deleteLodgeDefect(p.farmId, p.defectId);
    case 'upsertLodgeEvent':   return DB.upsertLodgeEvent(p.farmId, p.event);
    case 'deleteLodgeEvent':   return DB.deleteLodgeEvent(p.farmId, p.eventId);
    // ── Stock ──
    case 'upsertStockItem':    return DB.upsertStockItem(p.farmId, p.item);
    case 'deleteStockItem':    return DB.deleteStockItem(p.farmId, p.itemId);
    case 'upsertStockMovement':return DB.upsertStockMovement(p.farmId, p.movement);
    case 'deleteStockMovement':return DB.deleteStockMovement(p.farmId, p.movementId);
    // ── Tournées ──
    case 'upsertRound':        return DB.upsertRound(p.farmId, p.round);
    // ── Comptabilité ──
    case 'upsertTransaction':       return DB.upsertTransaction(p.farmId, p.transaction);
    case 'deleteTransaction':       return DB.deleteTransaction(p.farmId, p.transactionId);
    case 'upsertRecurringCharge':   return DB.upsertRecurringCharge(p.farmId, p.charge);
    case 'deleteRecurringCharge':   return DB.deleteRecurringCharge(p.farmId, p.chargeId);
    // ── Statuts lots ──
    case 'setLotStatus':       return DB.setLotStatus(p.farmId, p.lotId, p.status);
    case 'deleteLotStatus':    return DB.deleteLotStatus(p.farmId, p.lotId);
    default: throw new Error(`Type de mutation inconnu: ${m.type}`);
  }
}

export async function replayMutationQueue() {
  const queue = loadQueue();
  if (!queue.length) return { remaining: 0, replayed: 0 };

  const next = [];
  let replayed = 0;

  for (const m of queue) {
    try {
      await runMutation(m);
      replayed += 1;
    } catch (err) {
      const retryCount = (m.retryCount || 0) + 1;
      if (retryCount <= MAX_RETRIES) {
        next.push({ ...m, retryCount, lastError: String(err?.message || err) });
      }
    }
  }

  saveQueue(next);
  return { remaining: next.length, replayed };
}
