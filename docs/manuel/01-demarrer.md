# 01 — Démarrer

## Installer CuniWorld

CuniWorld est une **PWA** (Progressive Web App). Ouvrez https://cuniworld.app (ou votre déploiement) dans un navigateur récent (Chrome, Safari, Firefox, Edge), puis :

- **Sur mobile** : menu → « Ajouter à l'écran d'accueil ». L'app s'ouvre alors comme une application native.
- **Sur ordinateur** : icône d'installation dans la barre d'adresse Chrome/Edge.

Une fois installée, CuniWorld **fonctionne hors-ligne** : vos données sont stockées localement et synchronisées dès que vous êtes en ligne (si vous avez créé un compte cloud).

## Premier lancement

Au premier démarrage, un **assistant de bienvenue** s'ouvre :

1. **Bienvenue** : présentation rapide des fonctions.
2. **Créer le premier lapin** : code (CW-F001 par défaut), nom, sexe, cage.
3. **Pour aller plus loin** : pointe vers Paramètres et Documentation.

Vous pouvez « Passer » à tout moment — l'assistant ne réapparaîtra plus.

## Mode local vs cloud

CuniWorld peut tourner en **deux modes** :

| Mode | Données | Multi-appareils | Multi-membres | Idéal pour |
|---|---|---|---|---|
| **Local** | Stockées dans le navigateur uniquement | Non | Non | Tester, élevage solo simple |
| **Cloud** (Supabase) | Synchronisées via un compte | Oui (tablette + téléphone…) | Oui (propriétaire + employés) | Production sérieuse |

Le passage de local à cloud se fait en se connectant : vos données locales sont **proposées à la migration** vers le cloud (pas de perte).

## Créer une ferme cloud

En mode cloud :

1. Compte créé via email + mot de passe.
2. Premier écran après login : **« Choisir une ferme »**.
3. Cliquer **+ Créer une nouvelle ferme** → choisir un nom (ex: « Élevage du Soleil »).
4. C'est tout. Vous pouvez inviter des membres depuis **Actions → Paramètres ferme** (lien d'invitation à partager).

## Régler les paramètres ferme

Dès le départ, allez dans **Actions → Paramètres ferme** pour configurer :

- **Devise** (FCFA, EUR, USD…)
- **Prix vif** et **prix carcasse** par kg (utilisés pour la valorisation du cheptel et le module Budget Client)
- **Rendement carcasse** (typiquement 50-55 % pour le lapin)
- **Cycles de pesée** et **fenêtres de rappel santé**

Ces réglages personnalisent **toutes les estimations** (valeur cheptel, budget client, rappels « à peser »).
