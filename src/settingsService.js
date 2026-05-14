// Paramètres personnalisables par ferme — devise, prix de référence, seuils
// d'alerte, durées de reproduction. Source de vérité : table `farm_settings`
// (JSONB) en cloud, fusionnée avec DEFAULT_SETTINGS côté client.

import { supabase } from './supabase.js';

export const DEFAULT_SETTINGS = {
  // ── Économie ──
  currencyCode:        'XOF',     // ISO 4217 (XOF = FCFA, EUR, USD…)
  currencySymbol:      'FCFA',    // affiché à l'écran
  priceLivePerKg:      6000,
  priceCarcassPerKg:   5000,
  carcassYield:        0.55,      // 50–60 % pour le lapin

  // ── Reproduction (jours) ──
  gestationDays:       28,
  minWeanDays:         28,
  recommendedWeanDays: 30,
  overdueWeanDays:     35,
  maturityDays:        120,

  // ── Soins / seuils d'alerte (jours) ──
  weightCheckOverdueDays:  7,
  photoCheckOverdueDays:   7,
  healthReminderWindowDays: 7,
  inspectionDefaultDays:  14,

  // ── Identité publique ──
  description:         '',
  phone:               '',
  whatsapp:            '',
};

// Quelques devises courantes pour le sélecteur. L'utilisateur peut aussi
// taper un symbole libre si la sienne n'y est pas.
export const COMMON_CURRENCIES = [
  { code: 'XOF', symbol: 'FCFA',  label: 'Franc CFA (XOF)' },
  { code: 'XAF', symbol: 'FCFA',  label: 'Franc CFA (XAF, Afrique centrale)' },
  { code: 'EUR', symbol: '€',     label: 'Euro' },
  { code: 'USD', symbol: '$',     label: 'Dollar US' },
  { code: 'MAD', symbol: 'DH',    label: 'Dirham marocain' },
  { code: 'GBP', symbol: '£',     label: 'Livre sterling' },
];

// ── Chargement / sauvegarde ──────────────────────────────────────────────────

export async function loadFarmSettings(farmId) {
  if (!farmId) return { ...DEFAULT_SETTINGS };
  try {
    const { data, error } = await supabase
      .from('farm_settings')
      .select('data')
      .eq('farm_id', farmId)
      .maybeSingle();
    if (error) throw error;
    return { ...DEFAULT_SETTINGS, ...(data?.data || {}) };
  } catch (err) {
    console.warn('[settings] load failed, using defaults:', err?.message || err);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveFarmSettings(farmId, settings) {
  if (!farmId) return settings;
  const { error } = await supabase
    .from('farm_settings')
    .upsert(
      { farm_id: farmId, data: settings, updated_at: new Date().toISOString() },
      { onConflict: 'farm_id' }
    );
  if (error) throw error;
  return settings;
}

// ── Utilitaires d'affichage / calcul ─────────────────────────────────────────

export function getSettings(ctx) {
  return { ...DEFAULT_SETTINGS, ...(ctx?.farmSettings || {}) };
}

export function formatCurrency(amount, settings) {
  const n = Math.round(Number(amount) || 0);
  const sym = (settings && settings.currencySymbol) || 'FCFA';
  return `${n.toLocaleString('fr-FR').replace(/,/g, ' ')} ${sym}`;
}

export function estimateRabbitValue(weightKg, settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const w = Number(weightKg);
  if (!Number.isFinite(w) || w <= 0) return { live: 0, carcass: 0, carcassWeightKg: 0 };
  const live = Math.round(w * s.priceLivePerKg);
  const carcassWeightKg = w * s.carcassYield;
  const carcass = Math.round(carcassWeightKg * s.priceCarcassPerKg);
  return { live, carcass, carcassWeightKg };
}
