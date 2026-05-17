# Mode démo — CuniWorld

> **Référence** : roadmap item 5.3.

## URL d'accès

```
https://cuniworld.app/?demo=1
```

L'app détecte le paramètre `?demo=1` au démarrage et, **si le state local est vide ou déjà une simulation**, lance `generateSimulation()` avec des paramètres compacts (2 bâtiments, 4 femelles, 2 mâles, 6 mois d'historique). Le bandeau « 🧪 Mode Simulation » apparaît, et la tile « 🚪 Quitter la simulation » permet de revenir à un état vierge.

Si l'utilisateur a déjà des **vraies données locales**, on respecte sa data : un toast l'invite à les vider d'abord (Actions → ⚠️ Réinitialiser).

## Mode démo « server-side » (compte démo public)

Pour offrir un **compte démo cloud public**, par exemple `demo@cuniworld.app` / mot de passe `demo`, avec une réinitialisation nocturne automatique :

### Setup

1. **Créer le compte démo manuellement** dans le dashboard Supabase :
   - Authentication → Users → Add user → email + mot de passe.
   - Noter l'`auth.users.id` (UUID).

2. **Créer une ferme démo** sous ce compte (via l'app, login démo) avec des données représentatives. Noter le `farms.id`.

3. **Ajouter une migration** `015_demo_reset.sql` :
   ```sql
   create or replace function public.reset_demo_farm()
   returns void
   language plpgsql
   security definer
   set search_path = public
   as $$
   declare
     v_farm_id uuid := '<UUID de la ferme démo>';
   begin
     -- Nettoie toutes les tables liées à la ferme démo.
     delete from public.orders     where farm_id = v_farm_id;
     delete from public.rabbits    where farm_id = v_farm_id;
     delete from public.events     where farm_id = v_farm_id;
     delete from public.photos     where farm_id = v_farm_id;
     delete from public.used_names where farm_id = v_farm_id;
     -- Réinjecter ici les rabbits/events/photos de référence
     -- (idéalement chargés depuis un fichier SQL annexe).
   end;
   $$;
   revoke all on function public.reset_demo_farm() from public;
   grant execute on function public.reset_demo_farm() to service_role;
   ```

4. **Cron pg_cron** (extension Supabase) :
   ```sql
   select cron.schedule(
     'demo-reset',
     '0 3 * * *',                   -- tous les jours à 03:00 UTC
     $$ select public.reset_demo_farm(); $$
   );
   ```

### Limites

- Le compte démo cloud expose l'**email/mot de passe partagés** : ne **jamais** y stocker de données sensibles, et désactiver l'écriture aux tables critiques pour ce compte si nécessaire (RLS spécifique).
- Le pré-chargement de données réalistes peut être fait via `INSERT INTO` dans la fonction `reset_demo_farm()`, ou via un export JSON re-importé manuellement.

## État actuel

- ✅ `?demo=1` local : opérationnel (commit phase 5).
- ⏳ Compte démo cloud public : à activer en prod selon besoin (procédure ci-dessus). Considéré comme **post-MVP** (l'expérience locale démo est suffisante pour les premiers visiteurs).
