# Registre des traitements — CuniWorld

> **Responsable du traitement** : Code Scooper — codescooper@gmail.com
> **Sous-traitants** : Supabase Inc. (hébergement BDD + auth, UE eu-west) · Vercel Inc. (hébergement front + logs HTTP)
> **Dernière mise à jour** : 2026-05-17
> **Version applicative concernée** : ≥ 0.6.0

Ce registre est tenu en application de l'article 30 du RGPD. Il décrit l'ensemble des traitements de données à caractère personnel effectués par l'application CuniWorld.

---

## T1 — Création et gestion de compte utilisateur

| Élément | Détail |
|---|---|
| **Finalité** | Permettre à un éleveur de créer un compte et d'accéder à son espace personnel. |
| **Base légale** | Exécution du contrat (CGU). |
| **Personnes concernées** | Éleveurs / utilisateurs inscrits. |
| **Données collectées** | Email, mot de passe haché (bcrypt côté Supabase Auth), prénom et nom optionnels, horodatage création/dernière connexion. |
| **Destinataires** | Responsable du traitement, Supabase (hébergement). |
| **Durée de conservation** | Tant que le compte est actif. Suppression effective sous 30 jours après demande de l'utilisateur. |
| **Transferts hors UE** | Non — instance Supabase en région eu-west. |
| **Mesures de sécurité** | TLS 1.2+, Row Level Security (RLS) Postgres, JWT signé, mot de passe haché. |

## T2 — Données métier de l'élevage

| Élément | Détail |
|---|---|
| **Finalité** | Gestion technique du cheptel : suivi des lapins, événements (saillies, mises-bas, pesées, soins), lots, bâtiments, ventes, paramètres ferme. |
| **Base légale** | Exécution du contrat (CGU) — l'utilisateur saisit ses propres données métier. |
| **Personnes concernées** | Utilisateur propriétaire + membres invités d'une même ferme (max ~20). |
| **Données collectées** | Identifiants techniques des animaux, dates, mesures, photos, prix de vente, notes libres. Aucune donnée nominative de tiers requise par défaut (les ventes invité collectent toutefois nom/contact acheteur — voir T6). |
| **Destinataires** | Membres de la ferme (selon rôle owner/admin/member/viewer), responsable du traitement, Supabase. |
| **Durée de conservation** | Tant que l'utilisateur conserve sa ferme. Suppression par cascade lors de la suppression du compte (cf. T7). |
| **Transferts hors UE** | Non. |
| **Mesures de sécurité** | RLS par `farm_id`, audit RLS prévu phase 2 de la roadmap, isolement cross-ferme testé en e2e. |

## T3 — Photos d'animaux

| Élément | Détail |
|---|---|
| **Finalité** | Identification visuelle des lapins (couleur, marquage, état corporel). |
| **Base légale** | Exécution du contrat (CGU). |
| **Personnes concernées** | Utilisateurs (en tant qu'auteurs des photos). |
| **Données collectées** | Fichier image, miniatures, horodatage. Pas de métadonnées EXIF de géolocalisation (strippées côté client). |
| **Destinataires** | Membres de la ferme + visiteurs anonymes de la boutique publique (uniquement pour les lapins explicitement mis en vente). |
| **Durée de conservation** | Idem T2. |
| **Transferts hors UE** | Non. |
| **Mesures de sécurité** | Bucket Supabase Storage privé, accès anon limité par policy aux objets `forSale=true`. |

## T4 — Journaux techniques (logs)

| Élément | Détail |
|---|---|
| **Finalité** | Détection d'incidents, lutte anti-abus, mesure d'usage. |
| **Base légale** | Intérêt légitime de l'éditeur (sécurité du service). |
| **Personnes concernées** | Tout visiteur du service. |
| **Données collectées** | Adresse IP (anonymisée par Vercel), user-agent, URL appelée, code retour, durée. |
| **Destinataires** | Vercel Inc. (sous-traitant), responsable du traitement. |
| **Durée de conservation** | 12 mois maximum (politique standard Vercel). |
| **Transferts hors UE** | Possible (Vercel = USA), encadré par les Clauses Contractuelles Types (CCT) et le Data Privacy Framework. |
| **Mesures de sécurité** | Pas d'accès direct à la base par les logs ; cloisonnement Vercel. |

## T5 — Stockage local (PWA)

| Élément | Détail |
|---|---|
| **Finalité** | Fonctionnement hors-ligne : cache des données métier, file de mutations en attente, préférences UI (thème, panneau actif, choix consentement). |
| **Base légale** | Exécution du contrat (CGU). Le bandeau d'information explique le stockage local. |
| **Personnes concernées** | Utilisateur du navigateur. |
| **Données collectées** | Copie locale chiffrée par le navigateur (localStorage + IndexedDB) des données saisies. |
| **Destinataires** | Personne d'autre que l'utilisateur — données strictement locales à l'appareil. |
| **Durée de conservation** | Jusqu'au vidage manuel par l'utilisateur ou suppression du compte (le bouton « Supprimer mon compte » purge aussi le stockage local). |
| **Transferts hors UE** | Non (jamais transmis hors de l'appareil). |
| **Mesures de sécurité** | Périmètre origine HTTPS, pas de cookie tiers, pas de traceur publicitaire. |

## T6 — Commandes boutique publique (acheteurs invités)

| Élément | Détail |
|---|---|
| **Finalité** | Permettre à un acheteur de réserver un lapin sans créer de compte. |
| **Base légale** | Mesures précontractuelles à la demande de la personne concernée. |
| **Personnes concernées** | Acheteurs de la boutique publique. |
| **Données collectées** | Nom, contact (téléphone/email selon ce que l'acheteur fournit), lapin réservé, mode de livraison souhaité. |
| **Destinataires** | Éleveur propriétaire de la boutique uniquement (RLS). |
| **Durée de conservation** | 12 mois après dernière interaction avec la commande, puis archivage / suppression à la demande. |
| **Transferts hors UE** | Non. |
| **Mesures de sécurité** | RPC `shop_place_order` SECURITY DEFINER avec validation côté serveur, RLS empêche tout autre éleveur d'accéder à la commande. |

## T7 — Suppression de compte (droit à l'effacement)

| Élément | Détail |
|---|---|
| **Finalité** | Mise en œuvre du droit à l'effacement (RGPD art. 17). |
| **Base légale** | Obligation légale. |
| **Mise en œuvre** | Bouton « Supprimer mon compte » dans le panneau Actions → appelle le RPC `delete_my_account()` (migration 014) → cascade SQL sur fermes/lapins/événements/photos/orders → suppression du `auth.users` → purge du `localStorage` + `IndexedDB` côté client. |
| **Délai effectif** | Immédiat côté base. Backups journaliers Supabase (voir T8) purgés au bout de 90 jours glissants — au-delà desquels la donnée a définitivement disparu. |

## T8 — Sauvegardes (à mettre en place — phase 2 roadmap)

| Élément | Détail |
|---|---|
| **Finalité** | Restauration en cas d'incident technique. |
| **Base légale** | Intérêt légitime (sécurité du service). |
| **Données concernées** | Snapshot quotidien de la base Supabase. |
| **Durée de conservation** | 90 jours glissants. |
| **Transferts hors UE** | Non (snapshot conservé dans la même région que la BDD). |
| **Mesures de sécurité** | Chiffrement au repos, accès limité à l'administrateur. |

---

## Droits des personnes concernées

Toute personne concernée peut exercer auprès de codescooper@gmail.com :

- **Accès** : un export JSON complet est disponible à tout moment dans le panneau Actions.
- **Rectification** : modification directe depuis l'interface, ou demande par email.
- **Effacement** : bouton « Supprimer mon compte » ou demande par email.
- **Portabilité** : le format JSON exporté est lisible par toute application tierce.
- **Opposition** : désinstallation de la PWA + demande de suppression.

Délai de réponse : 30 jours maximum.

## Historique des révisions

| Date | Modification |
|---|---|
| 2026-05-17 | Création initiale (phase 1 roadmap production). |
