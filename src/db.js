import { supabase } from './supabase.js';

const _err = (tag, error) => { if (error) console.error(`[DB:${tag}]`, error); };

let _channel = null;

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
      version: 3,
      meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      rabbits, events, photos, usedNames,
    };
  },

  // ── Lapins ───────────────────────────────────────────────────────
  upsertRabbit(farmId, rabbit) {
    const { id, ...data } = rabbit;
    supabase.from('rabbits')
      .upsert({ id, farm_id: farmId, data }, { onConflict: 'id' })
      .then(({ error }) => _err('upsertRabbit', error));
  },

  deleteRabbit(farmId, rabbitId) {
    supabase.from('rabbits').delete()
      .eq('id', rabbitId).eq('farm_id', farmId)
      .then(({ error }) => _err('deleteRabbit', error));
  },

  // ── Événements ───────────────────────────────────────────────────
  upsertEvent(farmId, event) {
    const { id, rabbitId, ...data } = event;
    supabase.from('events')
      .upsert({ id, farm_id: farmId, rabbit_id: rabbitId, data }, { onConflict: 'id' })
      .then(({ error }) => _err('upsertEvent', error));
  },

  deleteEvent(farmId, eventId) {
    supabase.from('events').delete()
      .eq('id', eventId).eq('farm_id', farmId)
      .then(({ error }) => _err('deleteEvent', error));
  },

  // ── Photos ───────────────────────────────────────────────────────
  upsertPhoto(farmId, photo) {
    const { id, rabbitId, ...data } = photo;
    supabase.from('photos')
      .upsert({ id, farm_id: farmId, rabbit_id: rabbitId, data }, { onConflict: 'id' })
      .then(({ error }) => _err('upsertPhoto', error));
  },

  deletePhoto(farmId, photoId) {
    supabase.from('photos').delete()
      .eq('id', photoId).eq('farm_id', farmId)
      .then(({ error }) => _err('deletePhoto', error));
  },

  // ── Noms Naruto ──────────────────────────────────────────────────
  setUsedName(farmId, name, rabbitId) {
    supabase.from('used_names')
      .upsert({ farm_id: farmId, name, rabbit_id: rabbitId }, { onConflict: 'farm_id,name' })
      .then(({ error }) => _err('setUsedName', error));
  },

  deleteUsedName(farmId, name) {
    supabase.from('used_names').delete()
      .eq('farm_id', farmId).eq('name', name)
      .then(({ error }) => _err('deleteUsedName', error));
  },

  // ── Realtime ─────────────────────────────────────────────────────
  subscribeToFarm(farmId, ctx) {
    _channel = supabase
      .channel(`farm_${farmId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rabbits', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        _applyChange(ctx.state.rabbits, payload, row => ({ id: row.id, ...row.data }));
        ctx.render();
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'events', filter: `farm_id=eq.${farmId}`,
      }, payload => {
        _applyChange(ctx.state.events, payload, row => ({ id: row.id, rabbitId: row.rabbit_id, ...row.data }));
        ctx.render();
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
