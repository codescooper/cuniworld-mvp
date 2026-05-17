# Backups & restauration Supabase — CuniWorld

> **Référence** : roadmap item 2.2.
> **Dernière mise à jour** : 2026-05-17.

## 1. Stratégie de sauvegarde

Trois lignes de défense :

| Niveau | Outil | Fréquence | Rétention | Suffit pour… |
|---|---|---|---|---|
| **A. Supabase PITR** (plan Pro+) | natif Supabase | continu (WAL) | 7 jours glissants | rollback fin (oups DELETE) |
| **B. Dump quotidien** | `scripts/backup-supabase.sh` (cron local) | 1×/jour | 30 jours | restauration totale en cas de perte d'instance |
| **C. Export utilisateur** | bouton « Exporter les données » in-app | à la demande | propre à chaque user | continuité côté éleveur même sans nous |

> **Plan gratuit (sans PITR)** : seuls B + C protègent. Mettre en place B est donc obligatoire avant le lancement public.

## 2. Mise en place du dump quotidien (niveau B)

### Prérequis
- Supabase CLI ≥ 2.0 (`npm i -g supabase` ou `scoop install supabase`).
- Variables d'environnement (à mettre dans un `.env` non-versionné) :
  - `SUPABASE_PROJECT_REF` — ref du projet (visible dans l'URL du dashboard).
  - `SUPABASE_DB_PASSWORD` — mot de passe BDD (Settings → Database).
- Dossier de destination : `~/cuniworld-backups/` (ou un disque externe / cloud).

### Script `scripts/backup-supabase.sh`
Fourni dans le repo. Effectue :
1. `supabase db dump --db-url …` (schéma + données).
2. Compression `gzip`.
3. Nommage `cuniworld_YYYY-MM-DD.sql.gz`.
4. Rotation : supprime les dumps > 30 jours.

### Cron (Linux/macOS)
```cron
# tous les jours à 03:15 locales
15 3 * * * cd /chemin/vers/cuniworld-mvp && /bin/bash scripts/backup-supabase.sh >> ~/cuniworld-backups/backup.log 2>&1
```

### Planificateur de tâches (Windows)
```powershell
schtasks /Create /SC DAILY /ST 03:15 /TN "CuniWorld backup" /TR "bash C:\Users\USER\cuniworld-mvp\scripts\backup-supabase.sh"
```

### Vérification mensuelle
- Le 1er de chaque mois, lancer `bash scripts/backup-restore-test.sh` (à venir) sur une instance Supabase de staging pour vérifier qu'un dump est restaurable. Sans test régulier, un backup ≠ une sauvegarde fiable.

## 3. Restauration

### Cas 1 — Rollback fin (PITR, plan Pro+)
1. Dashboard Supabase → **Backups** → **Point-in-time recovery**.
2. Choisir le timestamp (à la seconde près) juste avant l'incident.
3. Cliquer **Restore** → Supabase crée une nouvelle BDD ; basculer le projet sur cette BDD ou repointer l'application.

### Cas 2 — Perte totale d'instance (dump quotidien)
1. Créer un nouveau projet Supabase (région **eu-west** pour rester conforme RGPD).
2. Récupérer la connection string (`Settings → Database → Connection string → URI`).
3. Restaurer le dernier dump :
   ```bash
   gunzip -c ~/cuniworld-backups/cuniworld_YYYY-MM-DD.sql.gz \
     | psql 'postgresql://postgres:PASSWORD@db.NEWREF.supabase.co:5432/postgres'
   ```
4. Réappliquer les migrations postérieures au dump si nécessaire :
   ```bash
   supabase db push --db-url 'postgresql://…'
   ```
5. Recréer les buckets Storage manuellement (les dumps Postgres n'incluent pas les objets binaires) — voir Cas 3.
6. Mettre à jour `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans Vercel (`vercel env`) et redéployer.

### Cas 3 — Restauration des photos (Storage)
Supabase Storage n'est pas inclus dans le dump SQL. Deux options :
- **Option simple (recommandée à court terme)** : configurer la réplication automatique côté Supabase (Settings → Storage → Replicate to S3-compatible). En cas de perte, le bucket S3 sert de source.
- **Option self-hosted** : utiliser `supabase storage download photos` régulièrement et stocker dans le même dossier que les dumps SQL.

> **Action prio post-MVP** : automatiser un mirror S3 hebdomadaire (item à ajouter à la roadmap phase 6).

## 4. Politique de rétention RGPD

Conformément au registre des traitements (`docs/rgpd/registre.md` T8) :
- Backups SQL : **90 jours glissants** maximum (cron de rotation à ajuster).
- Backups Storage : idem.
- Après une demande RGPD de suppression (`delete_my_account`) : les données peuvent subsister dans les backups jusqu'à 90 jours, puis disparaissent par rotation. Documenté dans la politique de confidentialité.

## 5. Checklist mensuelle

- [ ] Vérifier que le dernier dump a moins de 24 h (`ls -lt ~/cuniworld-backups | head`).
- [ ] Tester un restore complet sur une instance de staging.
- [ ] Vérifier la rotation (aucun dump > 30 j ne traîne).
- [ ] Confirmer que le backup Storage est à jour.
- [ ] Consigner la vérification dans un journal (date + initiales).
