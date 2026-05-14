// Gestion centralisée des membres de la ferme et de l'auteur par défaut
// d'une action. En cloud, la liste vient de Supabase via FarmService ;
// en local, on n'a qu'un seul "membre" virtuel (marqué `local`).

import { supabase } from './supabase.js';
import { formatMemberName } from './profileService.js';

const CACHE_KEY_PREFIX = 'cuniworld_farm_members_';

// ── Récupération distante ─────────────────────────────────────────────────────

export async function fetchFarmMembers(farmId, currentUserId) {
  if (!farmId) return _localFallback();

  // 1. Essayer le RPC dédié (expose les emails via SECURITY DEFINER, et
  //    depuis la migration 007 aussi les prénom/nom du profil).
  try {
    const { data, error } = await supabase.rpc('get_farm_members', { p_farm_id: farmId });
    if (!error && Array.isArray(data) && data.length > 0) {
      const members = data.map(r => {
        const firstName = r.first_name || '';
        const lastName  = r.last_name  || '';
        const email     = r.email || '';
        const label = formatMemberName({ firstName, lastName, email })
          || r.user_id || 'Membre';
        return {
          userId: r.user_id,
          email,
          firstName,
          lastName,
          role:   r.role || 'member',
          label,
          isMe:   r.user_id === currentUserId,
        };
      });
      _persistCache(farmId, members);
      return members;
    }
  } catch (_) { /* RPC indisponible — on continue */ }

  // 2. Fallback : lire farm_members directement (pas d'email accessible)
  try {
    const { data, error } = await supabase
      .from('farm_members')
      .select('user_id, role, joined_at')
      .eq('farm_id', farmId)
      .order('joined_at', { ascending: true });
    if (!error && Array.isArray(data)) {
      const members = data.map(r => ({
        userId: r.user_id,
        email:  '',
        role:   r.role || 'member',
        label:  r.user_id === currentUserId ? 'Moi' : `Membre ${String(r.user_id).slice(0, 6)}`,
        isMe:   r.user_id === currentUserId,
      }));
      _persistCache(farmId, members);
      return members;
    }
  } catch (_) { /* ignore */ }

  // 3. Dernier fallback : cache local précédemment téléchargé
  const cached = _readCache(farmId);
  if (cached?.length) return cached;

  // 4. Vraiment offline : on ne connaît que l'utilisateur courant
  return currentUserId
    ? [{ userId: currentUserId, email: '', role: 'member', label: 'Moi', isMe: true }]
    : _localFallback();
}

function _localFallback() {
  return [{ userId: null, email: '', role: 'local', label: 'Moi (local)', isMe: true }];
}

function _persistCache(farmId, members) {
  try { localStorage.setItem(CACHE_KEY_PREFIX + farmId, JSON.stringify(members)); } catch (_) {}
}

function _readCache(farmId) {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + farmId);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// ── Utilitaires côté UI ───────────────────────────────────────────────────────

// Renvoie l'auteur par défaut pour une action effectuée maintenant par le
// membre connecté. `null` retourné quand on n'a aucune identité (offline pur).
export function defaultActor(ctx) {
  if (ctx.farmId && ctx.currentUser) {
    // Si on a chargé la liste des membres avec leurs profils, on utilise le
    // libellé "Prénom Nom (email)" — sinon fallback sur l'email seul.
    const me = Array.isArray(ctx.farmMembers)
      ? ctx.farmMembers.find(m => m.userId === ctx.currentUser.id)
      : null;
    const label = me?.label
      || formatMemberName({
        firstName: ctx.myProfile?.firstName || '',
        lastName:  ctx.myProfile?.lastName  || '',
        email:     ctx.currentUser.email || '',
      })
      || ctx.currentUser.email
      || 'Moi';
    return {
      userId: ctx.currentUser.id,
      label,
    };
  }
  return { userId: null, label: 'local' };
}

// Renvoie la liste à afficher dans un <select> d'auteur. Si la liste cloud
// n'est pas encore chargée, on retombe sur le membre connecté + libellé local.
export function membersForSelect(ctx) {
  if (ctx.farmId) {
    if (Array.isArray(ctx.farmMembers) && ctx.farmMembers.length > 0) {
      return ctx.farmMembers;
    }
    if (ctx.currentUser) {
      const label = formatMemberName({
        firstName: ctx.myProfile?.firstName || '',
        lastName:  ctx.myProfile?.lastName  || '',
        email:     ctx.currentUser.email || '',
      }) || ctx.currentUser.email || 'Moi';
      return [{
        userId:    ctx.currentUser.id,
        email:     ctx.currentUser.email || '',
        firstName: ctx.myProfile?.firstName || '',
        lastName:  ctx.myProfile?.lastName  || '',
        role:      'member',
        label,
        isMe:      true,
      }];
    }
  }
  return _localFallback();
}

// HTML d'un <select> d'auteur (utilisé dans les formulaires d'action).
// `currentValue` est l'auteur déjà affecté à l'action en cours d'édition,
// `defaultUserId` correspond au membre connecté (sélectionné par défaut).
export function actorSelectHTML(ctx, currentUserId, fieldName = 'performedByUserId') {
  const members = membersForSelect(ctx);
  const def = defaultActor(ctx);
  const selectedId = currentUserId ?? def.userId ?? '';
  const options = members.map(m => {
    const val = m.userId || '';
    const sel = val === (selectedId || '') ? ' selected' : '';
    const label = m.isMe ? `Moi (${m.label})` : m.label;
    return `<option value="${val}"${sel}>${_escape(label)}</option>`;
  }).join('');
  return `
    <select class="input" name="${fieldName}">
      ${options}
    </select>`;
}

function _escape(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Construit un objet `performedBy` cohérent à stocker sur un événement ou
// un sous-élément de tournée à partir de la valeur du <select>.
export function resolvePerformedBy(ctx, selectedUserId) {
  const members = membersForSelect(ctx);
  const match = selectedUserId
    ? members.find(m => m.userId === selectedUserId)
    : null;
  if (match) {
    return { userId: match.userId, label: match.email || match.label || 'Membre' };
  }
  return defaultActor(ctx);
}

// Affiche un libellé court "par X" à partir d'un performedBy enregistré.
export function formatPerformedBy(performedBy) {
  if (!performedBy || typeof performedBy !== 'object') return '';
  const label = performedBy.label || performedBy.email;
  return label ? `par ${label}` : '';
}
