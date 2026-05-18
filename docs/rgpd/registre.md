# Registre des traitements — CuniWorld

> **Responsable du traitement** : Code Scooper — codescooper@gmail.com
> **Établissement principal** : Abidjan, Côte d'Ivoire
> **Sous-traitants ultimes** : Supabase Inc. (hébergement BDD + auth, instance UE eu-west) · Vercel Inc. (hébergement front + logs HTTP) · Resend Inc. (emails transactionnels, le cas échéant)
> **Autorité de contrôle compétente** : ARTCI — Autorité de Régulation des Télécommunications/TIC de Côte d'Ivoire (https://www.artci.ci)
> **Dernière mise à jour** : 2026-05-18
> **Version applicative concernée** : ≥ 0.6.0

## Cadre normatif

Ce registre est tenu en application des textes suivants, dont les exigences sont cumulativement appliquées :

| Texte | Portée | Article(s) clé(s) |
|---|---|---|
| **Loi ivoirienne n° 2013-450** du 19 juin 2013 (protection des données personnelles) | Juridiction principale | art. 14 (registre interne), art. 16 (sécurité), art. 19 (droits), art. 21 (notification de violation) |
| **Convention de l'Union Africaine** sur la cybersécurité et la protection des données (Malabo, 2014) | Cadre régional | art. 13 et suivants |
| **Loi n° 2013-451** du 19 juin 2013 (lutte contre la cybercriminalité — CI) | Sécurité des traitements | — |
| **RGPD — Règlement (UE) 2016/679** | Utilisateurs résidant dans l'EEE (applicabilité extraterritoriale art. 3) | art. 5 (principes), art. 6 (bases légales), art. 15-22 (droits), art. 30 (registre), art. 32 (sécurité), art. 33-34 (notif. violation) |
| **Actes uniformes OHADA** sur le droit commercial | Conservation des factures, droit de la vente | livre des comptes (10 ans) |
| **Loi ivoirienne n° 2016-410** du 15 juin 2016 (protection du consommateur) | Mise en relation acheteurs / éleveurs via la boutique | — |

---

## T1 — Création et gestion de compte utilisateur

| Élément | Détail |
|---|---|
| **Finalité** | Permettre à un éleveur de créer un compte et d'accéder à son espace personnel. |
| **Base légale** | Exécution du contrat (CGU) — art. 6.1.b RGPD / art. 13 loi 2013-450. |
| **Personnes concernées** | Éleveurs inscrits. |
| **Données collectées** | Email, mot de passe haché (bcrypt), prénom et nom optionnels, horodatage création / dernière connexion. |
| **Destinataires** | Responsable du traitement, Supabase (sous-traitant hébergement). |
| **Durée de conservation** | Tant que le compte est actif. Suppression effective immédiate en base, jusqu'à 90 j dans les sauvegardes glissantes. |
| **Transferts hors CI** | UE (Supabase eu-west) — niveau de protection adéquat reconnu. |
| **Mesures de sécurité** | TLS 1.2+, Row Level Security PostgreSQL, JWT signé, mot de passe haché (bcrypt). |

## T2 — Données métier de l'élevage

| Élément | Détail |
|---|---|
| **Finalité** | Gestion technique du cheptel : suivi des lapins, événements (saillies, mises-bas, pesées, soins), lots, bâtiments, ventes, paramètres ferme. |
| **Base légale** | Exécution du contrat (CGU). |
| **Personnes concernées** | Utilisateur propriétaire + membres invités (max ~20 par ferme). |
| **Données collectées** | Identifiants techniques des animaux, dates, mesures, photos, prix de vente, notes libres. |
| **Destinataires** | Membres de la ferme selon rôle (owner/admin/member/viewer), responsable du traitement, Supabase. |
| **Durée de conservation** | Tant que l'utilisateur conserve sa ferme. Suppression en cascade lors de la suppression de compte (cf. T7). |
| **Transferts hors CI** | UE (Supabase eu-west). |
| **Mesures de sécurité** | RLS par `farm_id` — audit ligne par ligne (`docs/ops/rls-audit.md`), tests d'isolement cross-ferme automatisés (`tests/rlsAudit.test.js`). |

## T3 — Photos d'animaux

| Élément | Détail |
|---|---|
| **Finalité** | Identification visuelle des lapins (couleur, marquage, état corporel). |
| **Base légale** | Exécution du contrat (CGU). |
| **Personnes concernées** | Utilisateurs (auteurs des photos). |
| **Données collectées** | Fichier image, miniatures, horodatage. Métadonnées EXIF de géolocalisation strippées côté client. |
| **Destinataires** | Membres de la ferme + visiteurs anonymes de la boutique publique (uniquement pour les lapins marqués `forSale=true`). |
| **Durée de conservation** | Idem T2. |
| **Transferts hors CI** | UE (Supabase Storage eu-west). |
| **Mesures de sécurité** | Bucket Supabase Storage privé, accès anon restreint par policy aux objets `forSale=true`. |

## T4 — Journaux techniques (logs)

| Élément | Détail |
|---|---|
| **Finalité** | Détection d'incidents, lutte anti-abus, mesure d'usage. |
| **Base légale** | Intérêt légitime de l'éditeur (sécurité du service). |
| **Personnes concernées** | Tout visiteur du service. |
| **Données collectées** | Adresse IP (partiellement anonymisée par Vercel), user-agent, URL appelée, code retour, durée. |
| **Destinataires** | Vercel Inc., responsable du traitement. |
| **Durée de conservation** | 12 mois maximum (politique standard Vercel). |
| **Transferts hors CI** | USA (Vercel) — encadrés par Clauses Contractuelles Types (CCT) et Data Privacy Framework. |
| **Mesures de sécurité** | Cloisonnement Vercel, accès limité. |

## T5 — Stockage local (PWA)

| Élément | Détail |
|---|---|
| **Finalité** | Fonctionnement hors-ligne : cache des données métier, file de mutations, préférences UI. |
| **Base légale** | Exécution du contrat (CGU). Bandeau d'information visible au premier accès. |
| **Personnes concernées** | Utilisateur du navigateur. |
| **Données collectées** | Copie locale (localStorage + IndexedDB) des données saisies. |
| **Destinataires** | Strictement local à l'appareil — aucune transmission tierce. |
| **Durée de conservation** | Jusqu'au vidage manuel ou suppression de compte (purge automatique). |
| **Transferts hors CI** | Aucun. |
| **Mesures de sécurité** | Périmètre origine HTTPS, pas de cookie tiers, pas de traceur publicitaire. |

## T6 — Commandes boutique publique (acheteurs invités)

| Élément | Détail |
|---|---|
| **Finalité** | Permettre à un acheteur de réserver un lapin sans créer de compte. |
| **Base légale** | Mesures précontractuelles à la demande de la personne (art. 6.1.b RGPD). |
| **Personnes concernées** | Acheteurs de la boutique publique. |
| **Données collectées** | Nom, contact (téléphone et/ou email), lapin réservé, mode de livraison. |
| **Destinataires** | Éleveur propriétaire de la boutique uniquement (cloisonnement RLS). |
| **Durée de conservation** | 12 mois après dernière interaction avec la commande, puis archivage. Conservation 10 ans pour la pièce de facturation (OHADA). |
| **Transferts hors CI** | UE (Supabase). |
| **Mesures de sécurité** | RPC `shop_place_order` SECURITY DEFINER avec validation côté serveur, RLS empêche tout autre éleveur d'accéder à la commande. |

## T7 — Suppression de compte (droit à l'effacement)

| Élément | Détail |
|---|---|
| **Finalité** | Mise en œuvre du droit à l'effacement (RGPD art. 17 / loi 2013-450 art. 19). |
| **Base légale** | Obligation légale. |
| **Mise en œuvre** | Bouton « Supprimer mon compte » → RPC `delete_my_account()` (migration 014) → cascade SQL sur fermes/lapins/événements/photos/orders → suppression de `auth.users` → purge `localStorage` + `IndexedDB` côté client. |
| **Délai effectif** | Immédiat côté base. Disparition complète sous 90 jours (rotation des sauvegardes). Pour les factures : conservation 10 ans après la fin de l'exercice (obligation OHADA), anonymisation possible sur demande. |

## T8 — Sauvegardes

| Élément | Détail |
|---|---|
| **Finalité** | Restauration en cas d'incident technique. |
| **Base légale** | Intérêt légitime (sécurité du service) — art. 32 RGPD / art. 16 loi 2013-450. |
| **Données concernées** | Snapshot quotidien de la base Supabase. |
| **Durée de conservation** | 90 jours glissants. |
| **Transferts hors CI** | UE (Supabase eu-west). |
| **Mesures de sécurité** | Chiffrement au repos, accès limité à l'administrateur. |

---

## Procédure en cas de violation de données

Conformément à l'article 21 de la loi ivoirienne n° 2013-450 et à l'article 33 du RGPD :

1. **Détection** : alerting Sentry / surveillance des logs Supabase (cf. `docs/ops/incident-runbook.md` cas E).
2. **Containment** : isoler l'incident dans un délai inférieur à 24 h.
3. **Notification ARTCI** : sous **72 heures** au plus tard via le formulaire officiel (https://www.artci.ci).
4. **Notification des personnes concernées** : sans délai injustifié, par email, si la violation est susceptible d'engendrer un risque élevé pour leurs droits et libertés.
5. **Post-mortem** : documenté dans `docs/ops/incidents/AAAA-MM-JJ-titre.md`.

## Droits des personnes concernées

Toute personne concernée peut exercer auprès de codescooper@gmail.com :

- **Accès** : un export JSON complet est disponible 24/7 dans l'application.
- **Rectification** : modification directe depuis l'interface, ou demande par email.
- **Effacement** : bouton « Supprimer mon compte » ou demande par email.
- **Portabilité** : le format JSON exporté est interopérable.
- **Opposition** : désinstallation de la PWA + demande de suppression.
- **Limitation** du traitement dans les cas prévus par la loi.
- **Réclamation** auprès de l'ARTCI (CI) ou de l'autorité de contrôle nationale du pays de résidence (pour les résidents de l'EEE).

**Délai de réponse** : 30 jours maximum (prolongeable de 60 jours en cas de complexité justifiée, art. 12.3 RGPD).

## Déclaration à l'ARTCI

À effectuer **avant l'ouverture commerciale du service en Côte d'Ivoire**, conformément à l'article 5 de la loi n° 2013-450 :

- **Type de déclaration** : déclaration ordinaire (le traitement ne relève pas du régime d'autorisation préalable car aucune donnée sensible — santé, biométrie, infractions — n'est traitée par défaut).
- **Procédure** : formulaire en ligne sur https://www.artci.ci → espace « Protection des données personnelles ».
- **Pièces** : présent registre, copie des CGU et de la Politique de confidentialité, justificatif d'identité du responsable, RCCM.
- **Statut** : ⏳ À faire avant le lancement commercial.

## Historique des révisions

| Date | Modification |
|---|---|
| 2026-05-17 | Création initiale (phase 1 roadmap production). |
| 2026-05-18 | Alignement complet sur la juridiction Côte d'Ivoire + standards internationaux (loi 2013-450, Convention de Malabo, RGPD extraterritorial, OHADA pour la facturation). Ajout de la procédure de notification ARTCI sous 72 h et de la procédure de déclaration préalable. |
