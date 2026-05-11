import { supabase } from './supabase.js';
import { getPhotoData } from './photoStorage.js';
import { Store } from './store.js';

function _throwIfError(tag, error) {
  if (!error) return;
  console.error(`[DB:${tag}]`, error);
  throw error;
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
    const [rRes, eRes, pRes, nRes] = await Promise.all([
      supabase.from('rabbits').select('id, data').eq('farm_id', farmId),
      supabase.from('events').select('id, rabbit_id, data').eq('farm_id', farmId),
      supabase.from('photos').select('id, rabbit_id, data').eq('farm_id', farmId),
      supabase.from('used_names').select('name, rabbit_id').eq('farm_id', farmId),
    ]);
    if (rRes.error) throw rRes.error;
    if (eRes.error) throw eRes.error;
    if (pRes.error) throw pRes.error;
    if (nRes.error) throw nRes.error;

    const rabbits   = (rRes.data || []).map(r => ({ id: r.id, ...r.data }));
    const events    = (eRes.data || []).map(e => ({ id: e.id, rabbitId: e.rabbit_id, ...e.data }));
    const photos    = (pRes.data || []).map(p => ({ id: p.id, rabbitId: p.rabbit_id, ...p.data }));
    const usedNames = Object.fromEntries((nRes.data || []).map(n => [n.name, n.rabbit_id]));

    return {
      version: Store.helpers.SCHEMA_VERSION,
      meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      rabbits, events, photos, usedNames,
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
    _channel = supabase
      .channel(`farm_${farmId}`)
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
        // Hydrate dataUrl from IndexedDB for newly received/updated photos
        if (payload.eventType !== 'DELETE' && payload.new?.id) {
          const photo = ctx.state.photos.find(p => p.id === payload.new.id);
          if (photo && !photo.dataUrl) {
            photo.dataUrl = await getPhotoData(photo.localPhotoKey || photo.id).catch(() => null);
          }
        }
        _scheduleRender(ctx);
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'used_names', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        if (!ctx.state.usedNames || typeof ctx.state.usedNames !== 'object') ctx.state.usedNames = {};
        _applyUsedNameChange(ctx.state.usedNames, payload);
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
