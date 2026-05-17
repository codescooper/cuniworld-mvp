/**
 * accountService.js — opérations sur le compte utilisateur (RGPD).
 *
 * Voir migration `014_delete_my_account.sql` pour la fonction Postgres
 * exécutée côté serveur. Côté client on se contente d'appeler le RPC puis
 * de nettoyer localStorage + IndexedDB pour qu'aucune trace ne subsiste
 * sur l'appareil après suppression.
 */

import { supabase, supabaseConfigured } from './supabase.js';

// Clés/buckets locaux à effacer après suppression du compte distant.
const LOCAL_KEYS_TO_CLEAR = [
  'cuniworld_active_panel',
  'consentChoice',
  'themePref',
  'betaBannerDismissed',
];

export async function deleteMyAccount() {
  if (!supabaseConfigured || !supabase) {
    throw new Error('Mode local — aucun compte cloud à supprimer.');
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;

  // Best-effort : on continue même si une étape échoue (l'utilisateur sera
  // de toute façon déconnecté et son compte distant est déjà supprimé).
  try { await supabase.auth.signOut(); } catch (_) {}
  try {
    // Nettoyage ciblé des préférences (on évite localStorage.clear pour ne
    // pas casser un éventuel `?shop=…` ouvert en parallèle dans un autre
    // onglet partageant le même storage).
    LOCAL_KEYS_TO_CLEAR.forEach(k => localStorage.removeItem(k));
    // Préfixe générique "cuniworld_*" : balaie tout le reste (state local,
    // queues de mutation, caches photos, etc.).
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cuniworld')) localStorage.removeItem(key);
    }
  } catch (_) {}
  try {
    // IndexedDB des photos hors-ligne — on supprime la base entière. Si
    // l'API n'est pas disponible (Safari privé, etc.), tant pis.
    if (typeof indexedDB !== 'undefined' && indexedDB.deleteDatabase) {
      indexedDB.deleteDatabase('cuniworld-photos');
    }
  } catch (_) {}
}
