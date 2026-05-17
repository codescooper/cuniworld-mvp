# Runbook incidents — CuniWorld

> **Référence** : roadmap item 2.5.
> **Dernière mise à jour** : 2026-05-17.
> **Audience** : opérateur de garde (actuellement = mainteneur unique).

## 0. Avant tout : check rapide

1. **App debout ?** → ouvrir `https://cuniworld.app/?status=1`
   - Si la page de status répond et `Supabase: ok` → c'est probablement local au user ou un bug applicatif → cas C.
   - Si la page ne répond pas → cas A.
   - Si la page répond mais `Supabase: erreur` → cas B.
2. **Quand ça a commencé ?** → comparer avec :
   - Vercel → Deployments (un déploiement récent ?).
   - Supabase → Logs (un pic d'erreurs ?).
   - Sentry → Issues (une nouvelle exception ?).

## A. App down (front)

### Symptômes
- Page blanche / 404 / 500 sur cuniworld.app.
- `?status=1` ne répond pas.

### Diagnostic
1. Vercel dashboard → onglet **Deployments** : le dernier deploy est-il en `Ready` ou en `Error` ?
2. Si dernier deploy en **Error** → lire les build logs Vercel.

### Actions
- **Rollback immédiat** : Vercel → Deployments → trouver le dernier déploiement vert → `…` → **Promote to Production**.
- Communiquer dans le bandeau beta (modif `index.html` `#betaBanner` puis push) — pré-rédigé :
  > « Maintenance en cours, vos données locales sont en sécurité. Retour prévu sous X minutes. »
- Une fois debout, post-mortem dans `docs/ops/incidents/AAAA-MM-JJ-titre.md`.

## B. Supabase KO

### Symptômes
- `?status=1` affiche `Supabase: HTTP 500` ou `erreur — Failed to fetch`.
- Bandeau « Erreur sync » persistant dans l'app, file de mutations qui grossit.

### Diagnostic
1. https://status.supabase.com → panne globale ?
2. Dashboard Supabase → Project → **Logs** → filtrer sur les 15 dernières minutes.
3. Une migration vient d'être appliquée ? Vérifier `supabase/migrations/` git log.

### Actions
- **Panne provider Supabase** : aucune action côté nous. Rassurer les utilisateurs via le bandeau beta : leur PWA continue de fonctionner en mode local, leurs mutations seront rejouées automatiquement à la reprise (queue `mutationQueue`).
- **Migration cassée** :
  1. `psql` direct vers la BDD → vérifier `select * from supabase_migrations.schema_migrations order by version desc limit 5;`.
  2. Rollback ciblé via une nouvelle migration `XYZ_revert_*.sql` (Supabase ne supporte pas le rollback descendant officiellement, mais une migration inverse fonctionne).
  3. Si totalement bloqué → restore PITR (cf. `backup-restore.md` cas 1).
- **Quota dépassé** (plan free, 500 MB) : alerter dans le bandeau, planifier upgrade Pro.

## C. Bug applicatif (front)

### Symptômes
- Un user signale un bug reproductible.
- Sentry affiche une nouvelle issue avec > 5 occurrences.

### Diagnostic
1. Sentry → ouvrir l'issue → stack trace + user-agent.
2. Reproduire en local avec `npm run dev` + le même profil navigateur.
3. Si la photo, l'événement ou le lapin concerné est partagé par le user, demander un **export JSON** (bouton Actions → Exporter) — c'est suffisant pour rejouer le bug.

### Actions
- **Hotfix** : commit + push sur `main`. Vercel auto-déploie sous ~2 min.
- Vérifier le redéploiement avec `?status=1` qui doit afficher le nouveau commit.
- Demander au user de **rafraîchir** (Cmd/Ctrl+Shift+R) car le service worker peut servir l'ancien bundle.
- Si bug majeur → afficher un message dans le bandeau beta + ajouter une entrée au CHANGELOG (à créer item 6.x).

## D. Perte de données utilisateur

### Symptômes
- Un user signale que des lapins/événements ont disparu.

### Diagnostic
1. Demander au user : a-t-il cliqué « Réinitialiser les données » ou « Supprimer mon compte » ?
2. Vérifier dans Supabase logs → `delete from rabbits` récent sur son `farm_id` ?
3. Le user a-t-il un **backup local** ? Panneau Actions → « Sauvegardes locales » (jusqu'à 5 snapshots).

### Actions
- **Backup local disponible** : guider le user pour cliquer « Restaurer » sur le bon snapshot.
- **Pas de backup local** : restore PITR sur le `farm_id` ciblé.
  ```sql
  -- Sur instance temporaire restaurée :
  copy (
    select * from rabbits where farm_id = '<FARM_UUID>'
  ) to '/tmp/rabbits.csv' with csv;
  -- Puis ré-injecter via INSERT … ON CONFLICT DO NOTHING dans la prod.
  ```
- Documenter dans un post-mortem.

## E. Incident sécurité (suspicion)

### Symptômes
- Un user voit les données d'une autre ferme.
- Un appel API échoue avec « permission denied » alors qu'il devrait passer (ou l'inverse).

### Actions IMMÉDIATES
1. **Activer Attack Mode** sur Vercel Firewall (passer en challenge interstitiel).
2. **Couper la clé anon** : Settings → API → Generate new anon key → MAJ Vercel env var → redéploiement.
3. **Audit RLS** : relancer `npx vitest run tests/rlsAudit.test.js` + revue manuelle `docs/ops/rls-audit.md`.
4. Notifier les utilisateurs concernés dans les **72 h** (RGPD art. 33) si données personnelles affectées.
5. Post-mortem obligatoire + CNIL si applicable.

## F. Notifications push KO

### Symptômes
- User dit « je ne reçois plus les rappels vaccins/mises-bas ».

### Diagnostic
- Notification permission revoked dans le navigateur ?
- Service Worker actif (`?status=1` → ligne « Service Worker » doit dire `actif`) ?

### Actions
- Guider le user pour ré-accorder la permission via les paramètres du navigateur.
- Si SW inactif : Cmd/Ctrl+Shift+R pour forcer le réenregistrement.

---

## Annexe — Numéros et contacts

| Service | Lien | Contact |
|---|---|---|
| Vercel | https://vercel.com/dashboard | support@vercel.com (plan Pro+) |
| Supabase | https://supabase.com/dashboard | support@supabase.com (plan Pro+) |
| Statut Supabase | https://status.supabase.com | — |
| Statut Vercel | https://www.vercel-status.com | — |
| CNIL (notification fuite) | https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles | 72 h max |

## Annexe — Template post-mortem

Créer `docs/ops/incidents/AAAA-MM-JJ-titre.md` avec :

```
# Incident YYYY-MM-DD — <titre court>

**Sévérité** : SEV1 / SEV2 / SEV3
**Durée** : HH:MM → HH:MM (X minutes d'indisponibilité)
**Utilisateurs impactés** : (~ N)

## Timeline
- HH:MM — détection (qui, comment)
- HH:MM — diagnostic posé
- HH:MM — mitigation appliquée
- HH:MM — résolution confirmée

## Cause racine
…

## Ce qui a bien fonctionné
…

## Ce qui doit être amélioré
…

## Action items
- [ ] (créer ticket / item roadmap)
```
