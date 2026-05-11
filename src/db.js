import { supabase } from './supabase.js';
import { hydrateCloudPhoto } from './photoStorage.js';
import { Store } from './store.js';

function _throwIfError(tag, error) {
  if (!error) return;
  console.error(`[DB:${tag}]`, error);
  throw error;
}

// Return data or [] if the table doesn't exist yet (SQL migration not run).
function _safeData(res, tag) {
  if (res.error) {
    console.warn(`[DB:load] ${tag} unavailable:`, res.error.message);
    return null; // null signals "fallback to local"
  }
  return res.data || [];
}

let _channel = null;
let _renderQueued = false;

function _scheduleRender(ctx) {
  if (!ctx || typeof ctx.render !== 'function') return;
  if (_renderQueued) return;
  _renderQueued = true;
  Promise.resolve().then(() => {
    _renderQueued = false;
    try { ctx.render(); } catch (_) {}
  });
}

export const DB = {
  // ── Chargement complet de l'état d'une ferme ─────────────────────
  async loadFarmState(farmId) {
    const [rRes, eRes, pRes, nRes, stRes, smRes, rdRes, bgRes, lgRes, ldRes, leRes, lsRes] = await Promise.all([
      supabase.from('rabbits').select('id, data').eq('farm_id', farmId),
      supabase.from('events').select('id, rabbit_id, data').eq('farm_id', farmId),
      supabase.from('photos').select('id, rabbit_id, data').eq('farm_id', farmId),
      supabase.from('used_names').select('name, rabbit_id').eq('farm_id', farmId),
      supabase.from('stock_items').select('id, data').eq('farm_id', farmId),
      supabase.from('stock_movements').select('id, data').eq('farm_id', farmId),
      supabase.from('rounds').select('id, data').eq('farm_id', farmId),
      supabase.from('buildings').select('id, data').eq('farm_id', farmId),
      supabase.from('lodges').select('id, data').eq('farm_id', farmId),
      supabase.from('lodge_defects').select('id, data').eq('farm_id', farmId),
      supabase.from('lodge_events').select('id, data').eq('farm_id', farmId),
      supabase.from('lot_statuses').select('lot_id, status').eq('farm_id', farmId),
    ]);

    // Core tables: throw on error (always present)
    if (rRes.error) throw rRes.error;
    if (eRes.error) throw eRes.error;
    if (pRes.error) throw pRes.error;
    if (nRes.error) throw nRes.error;

    // New tables: null = not available yet (SQL migration not run), fall back to local
    const stockData    = _safeData(stRes, 'stock_items');
    const smData       = _safeData(smRes, 'stock_movements');
    const rdData       = _safeData(rdRes, 'rounds');
    const bgData       = _safeData(bgRes, 'buildings');
    const lgData       = _safeData(lgRes, 'lodges');
    const ldData       = _safeData(ldRes, 'lodge_defects');
    const leData       = _safeData(leRes, 'lodge_events');
    const lsData       = _safeData(lsRes, 'lot_statuses');

    return {
      version:        Store.helpers.SCHEMA_VERSION,
      meta:           { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      rabbits:        (rRes.data  || []).map(r => ({ id: r.id, ...r.data })),
      events:         (eRes.data  || []).map(e => ({ id: e.id, rabbitId: e.rabbit_id, ...e.data })),
      photos:         (pRes.data  || []).map(p => ({ id: p.id, rabbitId: p.rabbit_id, ...p.data })),
      usedNames:      Object.fromEntries((nRes.data || []).map(n => [n.name, n.rabbit_id])),
      // New tables — null means "table not available yet" (used by _mergeLocalFields fallback)
      stock:          stockData !== null ? stockData.map(r => ({ id: r.id, ...r.data })) : null,
      stockMovements: smData    !== null ? smData.map(r => ({ id: r.id, ...r.data }))    : null,
      rounds:         rdData    !== null ? rdData.map(r => ({ id: r.id, ...r.data }))    : null,
      buildings:      bgData    !== null ? bgData.map(r => ({ id: r.id, ...r.data }))    : null,
      lodges:         lgData    !== null ? lgData.map(r => ({ id: r.id, ...r.data }))    : null,
      lodgeDefects:   ldData    !== null ? ldData.map(r => ({ id: r.id, ...r.data }))    : null,
      lodgeEvents:    leData    !== null ? leData.map(r => ({ id: r.id, ...r.data }))    : null,
      lotStatuses:    lsData    !== null ? Object.fromEntries(lsData.map(r => [r.lot_id, r.status])) : null,
    };
  },

  // ── Lapins ───────────────────────────────────────────────────────
  async upsertRabbit(farmId, rabbit) {
    const { id, ...data } = rabbit;
    const { error } = await supabase.from('rabbits')
      .upsert({ id, farm_id: farmId, data }, { onConflict: 'id' });
    _throwIfError('upsertRabbit', error);
  },

  async deleteRabbit(farmId, rabbitId) {
    const { error } = await supabase.from('rabbits').delete()
      .eq('id', rabbitId).eq('farm_id', farmId);
    _throwIfError('deleteRabbit', error);
  },

  // ── Événements ───────────────────────────────────────────────────
  async upsertEvent(farmId, event) {
    const { id, rabbitId, ...data } = event;
    const { error } = await supabase.from('events')
      .upsert({ id, farm_id: farmId, rabbit_id: rabbitId, data }, { onConflict: 'id' });
    _throwIfError('upsertEvent', error);
  },

  async deleteEvent(farmId, eventId) {
    const { error } = await supabase.from('events').delete()
      .eq('id', eventId).eq('farm_id', farmId);
    _throwIfError('deleteEvent', error);
  },

  // ── Photos ───────────────────────────────────────────────────────
  async upsertPhoto(farmId, photo) {
    const { id, rabbitId, dataUrl: _dataUrl, ...data } = photo;
    const { error } = await supabase.from('photos')
      .upsert({ id, farm_id: farmId, rabbit_id: rabbitId, data }, { onConflict: 'id' });
    _throwIfError('upsertPhoto', error);
  },

  async deletePhoto(farmId, photoId) {
    const { error } = await supabase.from('photos').delete()
      .eq('id', photoId).eq('farm_id', farmId);
    _throwIfError('deletePhoto', error);
  },

  // ── Noms Naruto ──────────────────────────────────────────────────
  async setUsedName(farmId, name, rabbitId) {
    const { error } = await supabase.from('used_names')
      .upsert({ farm_id: farmId, name, rabbit_id: rabbitId }, { onConflict: 'farm_id,name' });
    _throwIfError('setUsedName', error);
  },

  async deleteUsedName(farmId, name) {
    const { error } = await supabase.from('used_names').delete()
      .eq('farm_id', farmId).eq('name', name);
    _throwIfError('deleteUsedName', error);
  },

  // ── Stock articles ────────────────────────────────────────────────
  async upsertStockItem(farmId, item) {
    const { id, ...data } = item;
    const { error } = await supabase.from('stock_items')
      .upsert({ id, farm_id: farmId, data }, { onConflict: 'id' });
    _throwIfError('upsertStockItem', error);
  },

  async deleteStockItem(farmId, itemId) {
    const { error } = await supabase.from('stock_items').delete()
      .eq('id', itemId).eq('farm_id', farmId);
    _throwIfError('deleteStockItem', error);
  },

  // ── Mouvements de stock ───────────────────────────────────────────
  async upsertStockMovement(farmId, movement) {
    const { id, ...data } = movement;
    const { error } = await supabase.from('stock_movements')
      .upsert({ id, farm_id: farmId, data }, { onConflict: 'id' });
    _throwIfError('upsertStockMovement', error);
  },

  async deleteStockMovement(farmId, movementId) {
    const { error } = await supabase.from('stock_movements').delete()
      .eq('id', movementId).eq('farm_id', farmId);
    _throwIfError('deleteStockMovement', error);
  },

  // ── Tournées quotidiennes ─────────────────────────────────────────
  async upsertRound(farmId, round) {
    const { id, ...data } = round;
    const { error } = await supabase.from('rounds')
      .upsert({ id, farm_id: farmId, data }, { onConflict: 'id' });
    _throwIfError('upsertRound', error);
  },

  // ── Bâtiments ─────────────────────────────────────────────────────
  async upsertBuilding(farmId, building) {
    const { id, ...data } = building;
    const { error } = await supabase.from('buildings')
      .upsert({ id, farm_id: farmId, data }, { onConflict: 'id' });
    _throwIfError('upsertBuilding', error);
  },

  async deleteBuilding(farmId, buildingId) {
    const { error } = await supabase.from('buildings').delete()
      .eq('id', buildingId).eq('farm_id', farmId);
    _throwIfError('deleteBuilding', error);
  },

  // ── Loges ─────────────────────────────────────────────────────────
  async upsertLodge(farmId, lodge) {
    const { id, ...data } = lodge;
    const { error } = await supabase.from('lodges')
      .upsert({ id, farm_id: farmId, data }, { onConflict: 'id' });
    _throwIfError('upsertLodge', error);
  },

  async deleteLodge(farmId, lodgeId) {
    const { error } = await supabase.from('lodges').delete()
      .eq('id', lodgeId).eq('farm_id', farmId);
    _throwIfError('deleteLodge', error);
  },

  // ── Défauts loges ─────────────────────────────────────────────────
  async upsertLodgeDefect(farmId, defect) {
    const { id, ...data } = defect;
    const { error } = await supabase.from('lodge_defects')
      .upsert({ id, farm_id: farmId, data }, { onConflict: 'id' });
    _throwIfError('upsertLodgeDefect', error);
  },

  async deleteLodgeDefect(farmId, defectId) {
    const { error } = await supabase.from('lodge_defects').delete()
      .eq('id', defectId).eq('farm_id', farmId);
    _throwIfError('deleteLodgeDefect', error);
  },

  // ── Événements loges ──────────────────────────────────────────────
  async upsertLodgeEvent(farmId, event) {
    const { id, ...data } = event;
    const { error } = await supabase.from('lodge_events')
      .upsert({ id, farm_id: farmId, data }, { onConflict: 'id' });
    _throwIfError('upsertLodgeEvent', error);
  },

  async deleteLodgeEvent(farmId, eventId) {
    const { error } = await supabase.from('lodge_events').delete()
      .eq('id', eventId).eq('farm_id', farmId);
    _throwIfError('deleteLodgeEvent', error);
  },

  // ── Statuts de lots ───────────────────────────────────────────────
  async setLotStatus(farmId, lotId, status) {
    const { error } = await supabase.from('lot_statuses')
      .upsert({ farm_id: farmId, lot_id: lotId, status }, { onConflict: 'farm_id,lot_id' });
    _throwIfError('setLotStatus', error);
  },

  async deleteLotStatus(farmId, lotId) {
    const { error } = await supabase.from('lot_statuses').delete()
      .eq('farm_id', farmId).eq('lot_id', lotId);
    _throwIfError('deleteLotStatus', error);
  },

  // ── Realtime ─────────────────────────────────────────────────────
  subscribeToFarm(farmId, ctx) {
    // Always clean up the previous channel before creating a new one
    // to prevent subscription leaks on farm switch or retry.
    if (_channel) {
      supabase.removeChannel(_channel);
      _channel = null;
    }
    if (!ctx.state.photos) ctx.state.photos = [];
    if (!ctx.state.usedNames || typeof ctx.state.usedNames !== 'object') ctx.state.usedNames = {};
    if (!Array.isArray(ctx.state.buildings))    ctx.state.buildings    = [];
    if (!Array.isArray(ctx.state.lodges))       ctx.state.lodges       = [];
    if (!Array.isArray(ctx.state.lodgeDefects)) ctx.state.lodgeDefects = [];
    if (!Array.isArray(ctx.state.lodgeEvents))  ctx.state.lodgeEvents  = [];
    if (!Array.isArray(ctx.state.stock))        ctx.state.stock        = [];
    if (!Array.isArray(ctx.state.stockMovements)) ctx.state.stockMovements = [];
    if (!Array.isArray(ctx.state.rounds))       ctx.state.rounds       = [];
    if (!ctx.state.lotStatuses || typeof ctx.state.lotStatuses !== 'object') ctx.state.lotStatuses = {};

    _channel = supabase
      .channel(`farm_${farmId}`)
      // ── Core tables ──
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rabbits', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        _applyChange(ctx.state.rabbits, payload, row => ({ id: row.id, ...row.data }));
        _scheduleRender(ctx);
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'events', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        _applyChange(ctx.state.events, payload, row => ({ id: row.id, rabbitId: row.rabbit_id, ...row.data }));
        _scheduleRender(ctx);
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'photos', filter: `farm_id=eq.${farmId}`,
      }, async payload => {
        if (!ctx.state.photos) ctx.state.photos = [];
        _applyChange(ctx.state.photos, payload, row => ({ id: row.id, rabbitId: row.rabbit_id, ...row.data }));
        // Premier rendu immédiat avec l'état brut (l'utilisateur voit qu'une
        // nouvelle photo arrive) puis hydratation asynchrone des bytes.
        _scheduleRender(ctx);
        if (payload.eventType !== 'DELETE' && payload.new?.id) {
          const photo = ctx.state.photos.find(p => p.id === payload.new.id);
          if (photo) {
            await hydrateCloudPhoto(photo);
            _scheduleRender(ctx);
          }
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'used_names', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!ctx.state.usedNames || typeof ctx.state.usedNames !== 'object') ctx.state.usedNames = {};
        _applyUsedNameChange(ctx.state.usedNames, payload);
        _scheduleRender(ctx);
      })
      // ── Bâtiments ──
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'buildings', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!Array.isArray(ctx.state.buildings)) ctx.state.buildings = [];
        _applyChange(ctx.state.buildings, payload, row => ({ id: row.id, ...row.data }));
        _scheduleRender(ctx);
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'lodges', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!Array.isArray(ctx.state.lodges)) ctx.state.lodges = [];
        _applyChange(ctx.state.lodges, payload, row => ({ id: row.id, ...row.data }));
        _scheduleRender(ctx);
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'lodge_defects', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!Array.isArray(ctx.state.lodgeDefects)) ctx.state.lodgeDefects = [];
        _applyChange(ctx.state.lodgeDefects, payload, row => ({ id: row.id, ...row.data }));
        _scheduleRender(ctx);
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'lodge_events', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!Array.isArray(ctx.state.lodgeEvents)) ctx.state.lodgeEvents = [];
        _applyChange(ctx.state.lodgeEvents, payload, row => ({ id: row.id, ...row.data }));
        _scheduleRender(ctx);
      })
      // ── Stock ──
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'stock_items', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!Array.isArray(ctx.state.stock)) ctx.state.stock = [];
        _applyChange(ctx.state.stock, payload, row => ({ id: row.id, ...row.data }));
        _scheduleRender(ctx);
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'stock_movements', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!Array.isArray(ctx.state.stockMovements)) ctx.state.stockMovements = [];
        _applyChange(ctx.state.stockMovements, payload, row => ({ id: row.id, ...row.data }));
        _scheduleRender(ctx);
      })
      // ── Tournées ──
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rounds', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!Array.isArray(ctx.state.rounds)) ctx.state.rounds = [];
        _applyChange(ctx.state.rounds, payload, row => ({ id: row.id, ...row.data }));
        _scheduleRender(ctx);
      })
      // ── Statuts lots ──
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'lot_statuses', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!ctx.state.lotStatuses || typeof ctx.state.lotStatuses !== 'object') ctx.state.lotStatuses = {};
        _applyLotStatusChange(ctx.state.lotStatuses, payload);
        _scheduleRender(ctx);
      })
      .subscribe();
    return _channel;
  },

  unsubscribeAll() {
    if (_channel) {
      supabase.removeChannel(_channel);
      _channel = null;
    }
  },
};

function _applyChange(arr, payload, map) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    const item = map(newRow);
    const idx = arr.findIndex(x => x.id === newRow.id);
    if (idx >= 0) arr[idx] = item;
    else arr.unshift(item);
  } else if (eventType === 'DELETE') {
    const idx = arr.findIndex(x => x.id === (oldRow?.id));
    if (idx >= 0) arr.splice(idx, 1);
  }
}

function _applyUsedNameChange(usedNames, payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    if (newRow?.name) usedNames[newRow.name] = newRow.rabbit_id;
    if (eventType === 'UPDATE' && oldRow?.name && oldRow.name !== newRow?.name) {
      delete usedNames[oldRow.name];
    }
    return;
  }
  if (eventType === 'DELETE' && oldRow?.name) {
    delete usedNames[oldRow.name];
  }
}

function _applyLotStatusChange(lotStatuses, payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    if (newRow?.lot_id) lotStatuses[newRow.lot_id] = newRow.status;
  } else if (eventType === 'DELETE' && oldRow?.lot_id) {
    delete lotStatuses[oldRow.lot_id];
  }
}
