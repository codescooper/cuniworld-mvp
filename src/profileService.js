// Profil de l'utilisateur courant (prénom + nom) — utilisé pour afficher
// un libellé lisible dans les sélecteurs "Effectué par".

import { supabase } from './supabase.js';

const LOCAL_KEY = 'cuniworld_my_profile';

export async function getMyProfile(userId) {
  if (!userId) return _readLocal();
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data) {
      const profile = {
        firstName: data.first_name || '',
        lastName:  data.last_name  || '',
      };
      _writeLocal(profile);
      return profile;
    }
  } catch (_) { /* fallback below */ }
  return _readLocal();
}

export async function saveMyProfile(userId, { firstName, lastName }) {
  const profile = {
    firstName: (firstName || '').trim(),
    lastName:  (lastName  || '').trim(),
  };
  _writeLocal(profile);
  if (!userId) return profile;
  try {
    await supabase
      .from('profiles')
      .upsert({
        user_id:    userId,
        first_name: profile.firstName,
        last_name:  profile.lastName,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
  } catch (_) { /* écrit localement de toute façon */ }
  return profile;
}

function _readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : { firstName: '', lastName: '' };
  } catch (_) { return { firstName: '', lastName: '' }; }
}

function _writeLocal(profile) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(profile)); } catch (_) {}
}

// Formate un libellé lisible à partir de prénom/nom/email. Renvoie toujours
// quelque chose d'affichable.
export function formatMemberName({ firstName, lastName, email } = {}) {
  const full = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (full && email) return `${full} (${email})`;
  if (full) return full;
  return email || '';
}
