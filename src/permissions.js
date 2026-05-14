// Rôles et permissions côté UI. La sécurité réelle est imposée par les
// politiques RLS Supabase ; ce module sert à masquer/désactiver les boutons
// que le rôle courant n'a pas le droit d'utiliser pour offrir un UX cohérent.

export const ROLES = ['viewer', 'member', 'admin', 'owner'];
export const ROLE_LABELS = {
  owner:  'Propriétaire',
  admin:  'Administrateur',
  member: 'Membre',
  viewer: 'Lecture seule',
};
const ROLE_RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };

// Action → rôle minimum requis. Tout rôle de rang égal ou supérieur peut agir.
const ACTION_MIN_ROLE = {
  view:             'viewer',
  add_event:        'member',
  edit_rabbit:      'member',
  delete_event:     'admin',
  sell_rabbit:      'member',
  kill_rabbit:      'member',
  edit_round:       'member',
  manage_settings:  'admin',
  manage_members:   'owner',
};

export function currentRole(ctx) {
  // Mode local (pas de farmId) : on est seul, on a tous les droits.
  if (!ctx?.farmId) return 'owner';
  return ctx?.myRole || 'member';
}

export function can(ctx, action) {
  const role = currentRole(ctx);
  const min  = ACTION_MIN_ROLE[action] || 'admin';
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[min] ?? 99);
}

export function isOwner(ctx)  { return currentRole(ctx) === 'owner'; }
export function isAdminOrUp(ctx) { return ROLE_RANK[currentRole(ctx)] >= ROLE_RANK.admin; }
