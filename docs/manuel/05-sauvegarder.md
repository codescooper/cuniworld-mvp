# 05 — Sauvegarder & RGPD

## Sauvegardes automatiques (cloud)

Si vous êtes en mode cloud, vos données sont **sauvegardées par Supabase** :

- **Backup quotidien** + rétention 30 jours (procédure `docs/ops/backup-restore.md`).
- **Synchronisation temps réel** entre vos appareils (mobile, tablette, ordinateur).
- En cas d'incident, restauration documentée dans le runbook (`docs/ops/incident-runbook.md`).

Vous n'avez **rien à faire** : le système tourne tout seul.

## Sauvegardes locales (PWA)

Quoi qu'il arrive, CuniWorld conserve aussi des **snapshots locaux automatiques** :

- À chaque grosse modification (création de lapin, sevrage, import…), un snapshot est posé dans le navigateur.
- **5 sauvegardes glissantes** maximum (rotation FIFO).
- Visibles dans **Actions → Sauvegardes locales**.
- Cliquer **Restaurer** ramène l'app à l'état du snapshot. Cliquer **Exporter ce backup** télécharge un fichier JSON.

## Export complet (JSON)

Bouton **⬇ Exporter les données** dans le panneau Actions :

- Télécharge un fichier `cuniworld_backup_AAAA-MM-JJ.json` contenant **tout** votre élevage : lapins, événements, photos (URLs), paramètres, comptabilité.
- Format **lisible et standard** : vous pouvez l'archiver, l'envoyer par email, ou l'importer dans un tableur après transformation.

## Export CSV

Pour utilisation dans Excel / Google Sheets :

- **Lapins CSV** : un lapin par ligne, colonnes code/nom/sexe/race/cage/poids/statut.
- **Événements CSV** : un événement par ligne, colonnes date/type/lapin/détails.

Idéal pour partager avec votre comptable ou faire des analyses externes.

## Import

Bouton **⬆ Importer des données** : sélectionne un fichier JSON (exporté précédemment ou venant d'une autre ferme). Vos données existantes sont **remplacées** — faites un export juste avant si vous voulez les conserver.

## Suppression de compte (RGPD article 17)

Bouton **🗑️ Supprimer mon compte** dans le panneau Actions :

1. Double confirmation : saisir « SUPPRIMER » dans le champ.
2. Suppression irréversible :
   - Vos fermes dont vous êtes l'**unique propriétaire** sont supprimées (cascade sur lapins, événements, photos, commandes).
   - Vous êtes **retiré des fermes partagées** (les autres membres conservent les données).
   - Votre compte Supabase est définitivement supprimé.
   - Toutes vos données locales (`localStorage`, IndexedDB) sont purgées.
3. Délai effectif : immédiat côté base, jusqu'à 90 jours dans les sauvegardes glissantes Supabase (cf. politique de confidentialité).

Pour exporter vos données **avant** la suppression : utilisez le bouton **⬇ Exporter les données** d'abord.

## Vos droits RGPD complets

- **Accès** : export JSON disponible 24/7.
- **Rectification** : tout est modifiable directement dans l'app, ou par email à codescooper@gmail.com.
- **Effacement** : bouton « Supprimer mon compte » ou demande email.
- **Portabilité** : le JSON exporté est lisible par toute autre application.
- **Opposition** : désinstallation de la PWA + demande email.

Délai de réponse : **30 jours maximum**.

Voir aussi `docs/rgpd/registre.md` pour le détail des traitements documentés.
