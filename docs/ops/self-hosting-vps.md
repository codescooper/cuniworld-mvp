# CuniWorld sur KVM4 — 15 novembre 2026

Décision du propriétaire : application et backend sur le VPS, origine https://cuniworld.awema.cloud . Aucune sauvegarde ancienne connue ; cette installation est neuve, aucune restauration d’anciens comptes ou de données n’est revendiquée.

## Architecture

- Front statique nginx non-root, lecture seule, sans port hôte publié ; réseaux coolify et cuniworld-backend.
- Backend indépendant : PostgreSQL, GoTrue, PostgREST, Realtime, Storage et imgproxy. Pas de Studio public ni de port PostgreSQL publié.
- /backend/auth/v1, /rest/v1, /storage/v1 et /realtime/v1 sont relayés sur la même origine ; /backend/auth/v1/admin est refusé par le frontal.
- Backend : /opt/awema-cuniworld/backend/compose.yaml ; clés propres à CuniWorld dans .env (root, 0600). Seule la clé anon est destinée au client. Aucun service d’un autre business n’est réutilisé.
- Source officielle Docker fixée au commit indiqué par deploy/UPSTREAM_COMMIT. Images versionnées dans deploy/compose.yaml ; fichiers volumes/db issus de ce même commit. Ne jamais écraser un volume existant pour mettre à jour.
- Les configurations deploy/ sont des références sans secrets. Les montages relatifs de compose.yaml sont résolus depuis le dossier backend du VPS.

## Initialisation et protection

Les migrations 001 à 015 et la migration datée de durcissement sont appliquées dans l’ordre, chacune dans une transaction. La migration 007 recrée la fonction dont les colonnes de retour changent (PostgreSQL refuse CREATE OR REPLACE dans ce cas).

L’inscription par ID d’invitation de ferme existante reste compatible, mais ne peut attribuer que le rôle member ; les promotions restent réservées au propriétaire. Les RPC de gestion ne sont plus implicitement exécutables par le rôle PUBLIC/anon. Les accès de boutique publique volontairement prévus par le produit restent distincts des données privées.

L’envoi email n’est pas encore configuré : DISABLE_SIGNUP=true et ENABLE_EMAIL_AUTOCONFIRM=false. Ne pas activer les inscriptions sans SMTP fonctionnel. Les essais créent leurs propres comptes confirmés côté serveur puis les suppriment. Aucun vrai compte client n’a été utilisé.

## Build et publication

- npm ci (déjà autorisé), npm test, npx playwright test avec serveur de recette isolé, npm run lint.
- Build VPS : npx vite build --mode vps avec .env.vps.local ignoré par Git, VITE_SUPABASE_URL=https://cuniworld.awema.cloud/backend et clé publique anon propre au VPS. Ne jamais copier la clé service_role dans une variable VITE_.
- CI main valide et conserve un artefact ; elle ne publie plus automatiquement sur GitHub Pages. La release VPS doit être construite avec sa configuration de backend ; un artefact CI sans environnement cloud ne constitue pas une release de production.
- Activer le routeur Traefik exact-host et HTTPS après présence du DNS A cuniworld → 187.124.167.106. Les autres domaines et services restent indépendants.
- Présentation indexable : /decouvrir.html ; sitemap limité à cette page ; canonical et liens sur cuniworld.awema.cloud. Gestion : meta et en-tête HTTP noindex. Aucun fichier .env ni répertoire de travail dans le dist.

## Vérifications réalisées

- 280 tests unitaires et 16 scénarios navigateur passent après adaptation des URL ; 12 tests ciblés passent après correction des informations d’hébergement.
- Build et lint : validation consignée dans le rapport opérateur (10 avertissements historiques, aucune erreur).
- scripts/verify-selfhost.py exécuté sur les API réelles : deux comptes jetables, connexion par mot de passe, création ferme, lecture/écriture propriétaire, refus des lectures anonymes et intercomptes, refus d’insertion/modification étrangère, refus de promotion propriétaire, refus de RPC membres anonymes, photos privées et liens signés, invitation membre compatible. Les seuls comptes supprimés sont ceux créés par le test.
- WebSocket réel via passerelle nginx : connexion et réponse de canal ok. La réception d’une mutation entre deux navigateurs reste à vérifier après activation du domaine.
- 20 tables public, aucune sans RLS. Auth, REST, Realtime, Storage et PostgreSQL sains.

## Sauvegarde et retour arrière

/opt/awema-cuniworld/backend/backup.sh crée un dump PostgreSQL, une archive Storage et la configuration root-only dans /var/backups/cuniworld/<dateUTC>. Premier snapshot effectué ; aucune sauvegarde hors serveur ni planification automatique n’est encore revendiquée. Vérifier la restauration dans une base isolée avant usage de production et organiser la copie hors VPS.

Les données du backend restent dans backend/volumes et le volume db-config. Pour un retour de frontend, remonter une release antérieure sans toucher à ces volumes. Ne jamais exécuter compose down -v, reset ou une suppression de volume pour un rollback. Ne pas remettre l’ancien backend introuvable comme cible de production.

## Restant avant recette publique complète

DNS/HTTPS, SMTP et compte propriétaire à initialiser, validation de la connexion depuis le domaine, recette de synchronisation entre deux navigateurs. Les champs légaux incomplets restent affichés comme tels ; la localisation contractuelle du VPS est à confirmer. Aucun classement SEO ni citation IA garantis.
