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
    const { data: farm, error: farmErr } = await supabase
      .from('farms')
      .select('id, name')
      .eq('id', farmId.trim())
      .single();
    if (farmErr) throw new Error("Ferme introuvable. Vérifiez l'identifiant.");

    const { data: { user } } = await supabase.auth.getUser();

    const { error: memberErr } = await supabase
      .from('farm_members')
      .upsert(
        { farm_id: farm.id, user_id: user.id, role: 'member' },
        { onConflict: 'farm_id,user_id', ignoreDuplicates: true }
      );
    if (memberErr) throw memberErr;

    return farm;
  },
};
