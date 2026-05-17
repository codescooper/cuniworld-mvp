# Audit RLS — CuniWorld

> **Référence** : roadmap item 2.3.
> **Dernière revue** : 2026-05-17 — version 0.6.0.
> **Méthodologie** : revue ligne par ligne des migrations `supabase/migrations/*.sql` + tests d'isolement automatisés (`tests/rlsAudit.test.js`).

## Principe général

Toutes les tables métier sont isolées par `farm_id`. Le helper SQL `public.is_farm_member(fid)` (migration 001) est la seule autorité : il retourne `true` si `auth.uid()` apparaît dans `farm_members` pour cette ferme. Aucune policy ne contourne ce helper sauf les exceptions « boutique publique » documentées plus bas.

```sql
create function public.is_farm_member(fid uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from public.farm_members
    where farm_id = fid and user_id = auth.uid()
  );
$$;
```

## Inventaire des tables et policies

| Table | RLS | SELECT | INSERT | UPDATE | DELETE | Anon ? |
|---|---|---|---|---|---|---|
| `farms` | ✅ | `is_farm_member(id)` | `created_by = auth.uid()` | role = owner | (cascade depuis `auth.users`) | ⚠ `farms_public_shop` si ≥ 1 lapin en vente |
| `farm_members` | ✅ | self OR membre | self uniquement | RPC `set_farm_member_role` | RPC `remove_farm_member` | non |
| `rabbits` | ✅ | `is_farm_member(farm_id)` | idem | idem | idem | ⚠ `rabbits_public_shop` (forSale=true) |
| `events` | ✅ | `is_farm_member(farm_id)` | idem | idem | idem | ⚠ pesées des lapins forSale |
| `photos` | ✅ | `is_farm_member(farm_id)` | idem | idem | idem | ⚠ photos des lapins forSale |
| `used_names` | ✅ | `is_farm_member(farm_id)` | idem | idem | idem | non |
| `profiles` | ✅ | `user_id = auth.uid()` | self uniquement | self uniquement | (cascade) | non |
| `farm_settings` | ✅ | `is_farm_member(farm_id)` | role IN (owner, admin) | idem | (cascade) | ⚠ `farm_settings_public_shop` (ferme avec lapins forSale) |
| `orders` | ✅ | `is_farm_member(farm_id)` | RPC `shop_place_order` | `is_farm_member(farm_id)` | RPC | (insert via RPC SECURITY DEFINER) |
| `order_items` | ✅ | `is_farm_member(farm_id)` (via join) | RPC `shop_place_order` | non | (cascade) | (insert via RPC) |
| `storage.objects` (bucket `photos`) | (storage) | `photos_select_member` (membre) OR `photos_select_public_shop` (forSale) | membre | membre | membre | ⚠ photos des lapins forSale |
| `storage.buckets` | (storage) | row `id='photos'` visible anon+auth (mig. 013) | — | — | — | id='photos' uniquement |

## Vérifications systématiques

Pour chaque table, on s'assure que :

1. ✅ **RLS activée** (`alter table … enable row level security`).
2. ✅ **Aucune policy `for all using (true)`** ouverte sans condition.
3. ✅ **Toute écriture vérifie `is_farm_member` côté `with check`** (sinon un membre pourrait insérer dans une autre ferme).
4. ✅ **Les RPC qui s'exécutent en SECURITY DEFINER vérifient `auth.uid()`** ou un secret partagé en début de fonction.
5. ✅ **Les FK cascadent depuis `auth.users` et `farms`** pour que `delete_my_account()` (mig. 014) ne laisse aucun orphelin.

## Cas particuliers / risques résiduels

### Boutique publique (migration 009)
Les policies `*_public_shop` exposent **volontairement** à `anon` :
- Les `rabbits` où `data->>'forSale' = 'true'`.
- Les `photos` rattachées à ces lapins.
- Les `events` de type `pesée` (pour le prix au kg).
- Le `name` de la ferme et les `data` publiques de `farm_settings`.

🟢 **Sécurité acceptée** : seules les données explicitement marquées en vente sortent, l'éleveur les met en vente sciemment.

🟡 **Risque résiduel** : un éleveur qui met en vente avec des notes sensibles dans `rabbit.data.notes` les expose publiquement. **Action** : prévoir un audit côté UI (item future à ajouter à la roadmap) pour avertir l'éleveur de cette exposition.

### RPC `delete_my_account` (migration 014)
- Exécuté en `security definer`, recherche `auth.uid()` en début de fonction → impossible de supprimer le compte d'un autre.
- Seules les fermes dont le user est **unique owner** sont supprimées (préserve les fermes partagées).
- Granted `to authenticated` uniquement, jamais à `anon`.

### `farm_members.insert`
Policy : `with check (user_id = auth.uid())`. C'est volontairement permissif (n'importe qui peut s'auto-ajouter dans n'importe quelle ferme), **MAIS** :
- L'UI passe par `FarmService.joinFarm()` qui appelle un RPC nécessitant le code d'invitation.
- Sans RPC, un attaquant pourrait théoriquement s'auto-insérer. **Action recommandée** : durcir via RPC SECURITY DEFINER `join_farm(invitation_code)` — ajouté à la roadmap (hors phase 2 immédiate).

## Tests d'isolement automatisés

Voir `tests/rlsAudit.test.js` — vérifie statiquement la présence des policies critiques dans les migrations. Pour les vrais tests d'isolement cross-ferme (deux utilisateurs réels qui tentent de se voir), un environnement Supabase de test est requis ; à ajouter dans la prochaine itération CI.

## Procédure de revue (à refaire à chaque nouvelle migration)

1. La migration `*.sql` ajoute-t-elle une nouvelle table ?
   → `enable row level security` + au moins une policy `is_farm_member`.
2. La migration ajoute-t-elle un RPC ?
   → `security definer` + vérification de `auth.uid()` en première ligne.
3. La migration touche-t-elle aux policies existantes ?
   → Mettre à jour ce document + ajouter un cas dans `tests/rlsAudit.test.js`.
4. Cocher dans le PR/commit que la revue RLS a été faite.
