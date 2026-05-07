import { supabase } from './supabase.js';

export const FarmService = {
  async getUserFarms() {
    const { data, error } = await supabase
      .from('farm_members')
      .select('role, joined_at, farms(id, name, created_at)')
      .order('joined_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(m => ({ ...m.farms, role: m.role }));
  },

  async createFarm(name) {
    const { data: farm, error } = await supabase
      .rpc('create_farm_with_owner', { farm_name: name.trim() });
    if (error) throw error;
    return farm;
  },

  async joinFarm(farmId) {
    const trimmedId = farmId.trim();
    const { data: { user } } = await supabase.auth.getUser();

    // Insert membership first — if the farm doesn't exist the FK constraint
    // (or a missing-rows error) will bubble up as a clear error. Doing the
    // SELECT first would fail for new users who aren't members yet (RLS).
    const { error: memberErr } = await supabase
      .from('farm_members')
      .upsert(
        { farm_id: trimmedId, user_id: user.id, role: 'member' },
        { onConflict: 'farm_id,user_id', ignoreDuplicates: true }
      );
    if (memberErr) {
      // FK violation → farm doesn't exist
      if (memberErr.code === '23503') throw new Error("Ferme introuvable. Vérifiez l'identifiant.");
      throw memberErr;
    }

    // Now the user is a member, RLS allows reading the farm
    const { data: farm, error: farmErr } = await supabase
      .from('farms')
      .select('id, name')
      .eq('id', trimmedId)
      .single();
    if (farmErr || !farm) throw new Error("Ferme introuvable. Vérifiez l'identifiant.");

    return farm;
  },
};
