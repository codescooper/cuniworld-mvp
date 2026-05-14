// Service boutique publique : interagit avec Supabase pour récupérer les
// lapins à vendre et créer/lire les commandes guest.
//
// Toutes les méthodes fonctionnent avec un client anon (sans connexion).

import { supabase } from './supabase.js';
import { downloadPhotoAsDataUrl, getPhotoSignedUrl } from './photoCloudStorage.js';

// ── Liste des lapins à vendre ────────────────────────────────────────────────
// `farmId = null` → toutes les fermes (vue cross-farm /?shop=all).
// Renvoie un tableau d'objets normalisés (rabbit + farm + photo + last weight).
export async function listShopRabbits(farmId = null) {
  let q = supabase
    .from('rabbits')
    .select('id, farm_id, data')
    .filter('data->>forSale', 'eq', 'true');
  if (farmId) q = q.eq('farm_id', farmId);

  const { data: rabbits, error } = await q;
  if (error) throw error;
  if (!rabbits || rabbits.length === 0) return [];

  // Récupère les commandes actives pour exclure les lapins déjà engagés.
  const rabbitIds = rabbits.map(r => r.id);
  const { data: lockedItems } = await supabase
    .from('order_items')
    .select('rabbit_id, orders!inner(status)')
    .in('rabbit_id', rabbitIds)
    .in('orders.status', ['reserve', 'paye', 'en_route']);
  const lockedSet = new Set((lockedItems || []).map(x => x.rabbit_id));

  // Fermes
  const farmIds = [...new Set(rabbits.map(r => r.farm_id))];
  const { data: farms } = await supabase
    .from('farms')
    .select('id, name')
    .in('id', farmIds);
  const farmMap = new Map((farms || []).map(f => [f.id, f]));

  // Settings (devise, description, WhatsApp)
  const { data: settings } = await supabase
    .from('farm_settings')
    .select('farm_id, data')
    .in('farm_id', farmIds);
  const settingsMap = new Map((settings || []).map(s => [s.farm_id, s.data || {}]));

  // Photos : on prend la plus récente par lapin
  const { data: photos } = await supabase
    .from('photos')
    .select('id, rabbit_id, data')
    .in('rabbit_id', rabbitIds);
  const photoByRabbit = new Map();
  for (const p of (photos || [])) {
    const existing = photoByRabbit.get(p.rabbit_id);
    const pDate = p.data?.date || '';
    if (!existing || pDate > (existing.data?.date || '')) {
      photoByRabbit.set(p.rabbit_id, p);
    }
  }

  // Dernière pesée par lapin
  const { data: weighEvents } = await supabase
    .from('events')
    .select('rabbit_id, data')
    .in('rabbit_id', rabbitIds)
    .filter('data->>type', 'eq', 'pesée');
  const lastWeightByRabbit = new Map();
  for (const e of (weighEvents || [])) {
    const w = Number(e.data?.data?.weight);
    if (!Number.isFinite(w) || w <= 0) continue;
    const d = e.data?.date || '';
    const cur = lastWeightByRabbit.get(e.rabbit_id);
    if (!cur || d > cur.date) lastWeightByRabbit.set(e.rabbit_id, { weight: w, date: d });
  }

  return rabbits
    .filter(r => !lockedSet.has(r.id))
    .map(r => {
      const farm     = farmMap.get(r.farm_id) || { name: '—' };
      const settings = settingsMap.get(r.farm_id) || {};
      const photo    = photoByRabbit.get(r.id);
      const weight   = lastWeightByRabbit.get(r.id)?.weight ?? null;
      const salePrice = parseFloat(r.data?.salePrice);
      // Si pas de prix demandé, on calcule sur la base du dernier poids + prix vif.
      const priceLive = parseFloat(settings.priceLivePerKg) || 0;
      const computedPrice = (weight && priceLive)
        ? Math.round(weight * priceLive)
        : null;
      return {
        id:        r.id,
        farmId:    r.farm_id,
        farmName:  farm.name,
        farmPhone: settings.phone || '',
        farmWhatsApp: settings.whatsapp || '',
        farmDescription: settings.description || '',
        name:      r.data?.name  || '—',
        code:      r.data?.code  || '',
        breed:     r.data?.breed || '',
        sex:       r.data?.sex   || 'U',
        birthDate: r.data?.birthDate || '',
        stage:     r.data?.stage || '',
        currencySymbol: settings.currencySymbol || 'FCFA',
        salePrice: Number.isFinite(salePrice) && salePrice > 0 ? salePrice : null,
        suggestedPrice: computedPrice,
        weightKg:  weight,
        photo:     photo ? { storagePath: photo.data?.storagePath } : null,
        description: r.data?.shopDescription || '',
      };
    })
    .sort((a, b) => {
      // Tri : par ferme puis par nom
      if (a.farmName !== b.farmName) return a.farmName.localeCompare(b.farmName);
      return (a.code || a.name).localeCompare(b.code || b.name);
    });
}

// ── Récupère un dataUrl visualisable pour un lapin du shop ───────────────────
// Essaye d'abord une URL signée (1 h), fallback sur download si la signature
// n'est pas autorisée pour anon.
export async function loadShopRabbitPhoto(storagePath) {
  if (!storagePath) return null;
  try {
    const signed = await getPhotoSignedUrl(storagePath, 3600);
    if (signed) return signed;
  } catch (_) { /* fallback */ }
  try {
    return await downloadPhotoAsDataUrl(storagePath);
  } catch (_) { return null; }
}

// ── Passer une commande ─────────────────────────────────────────────────────
export async function placeOrder({ farmId, rabbitIds, customer }) {
  const { data, error } = await supabase.rpc('shop_place_order', {
    p_farm_id:         farmId,
    p_rabbit_ids:      rabbitIds,
    p_customer_name:   (customer.name    || '').trim(),
    p_customer_phone:  (customer.phone   || '').trim(),
    p_customer_email:  (customer.email   || '').trim(),
    p_customer_address: (customer.address || '').trim(),
    p_customer_notes:  (customer.notes   || '').trim(),
  });
  if (error) throw error;
  // RPC returns scalar uuid → data is the uuid string directly
  return data;
}

// ── Récupérer une commande pour suivi client ────────────────────────────────
export async function getOrderById(orderId) {
  const { data, error } = await supabase.rpc('shop_get_order', { p_order_id: orderId });
  if (error) throw error;
  // RPC returns table → array
  if (!data || data.length === 0) return null;
  return data[0];
}

// ── Côté éleveur : changer le statut d'une commande ─────────────────────────
export async function setOrderStatus(orderId, status) {
  const { error } = await supabase.rpc('shop_set_order_status', {
    p_order_id: orderId, p_status: status,
  });
  if (error) throw error;
}

// ── Compte des commandes en attente (réservées + payées + en route) ─────────
// Léger : compte uniquement, pour le badge nav. Polled à intervalle régulier.
export async function countPendingOrders(farmId) {
  if (!farmId) return 0;
  try {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('farm_id', farmId)
      .in('status', ['reserve', 'paye', 'en_route']);
    if (error) throw error;
    return count || 0;
  } catch (_) {
    return 0;
  }
}

// ── Côté éleveur : récupérer toutes les commandes de la ferme ───────────────
export async function listFarmOrders(farmId) {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, farm_id, status, data, created_at, updated_at')
    .eq('farm_id', farmId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map(o => o.id);
  const { data: items } = await supabase
    .from('order_items')
    .select('id, order_id, rabbit_id, unit_price, rabbit_snapshot')
    .in('order_id', orderIds);

  const itemsByOrder = new Map();
  for (const it of (items || [])) {
    if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
    itemsByOrder.get(it.order_id).push(it);
  }
  return orders.map(o => ({ ...o, items: itemsByOrder.get(o.id) || [] }));
}

// ── Statuts ─────────────────────────────────────────────────────────────────
export const ORDER_STATUSES = [
  { code: 'reserve',  label: 'Réservé',  icon: '🔒', next: 'paye' },
  { code: 'paye',     label: 'Payé',     icon: '💰', next: 'en_route' },
  { code: 'en_route', label: 'En route', icon: '🚚', next: 'livre' },
  { code: 'livre',    label: 'Livré',    icon: '✅', next: null },
  { code: 'annule',   label: 'Annulé',   icon: '❌', next: null },
];

export function getStatusLabel(code) {
  return ORDER_STATUSES.find(s => s.code === code) || { code, label: code, icon: '❓' };
}
