# 02 — Gérer le cheptel

## Ajouter un lapin

- Bouton **+ Nouveau lapin** dans la barre du haut, ou raccourci clavier `N`.
- Champs obligatoires : **code** (CW-Fxxx pour femelles, CW-Mxxx pour mâles — convention non bloquante), **nom**, **sexe**, **statut** (actif par défaut).
- Champs recommandés : **race**, **cage**, **date de naissance**, **parents**.

Bonne pratique : enregistrez aussi la **première pesée** dès l'arrivée d'un lapin (panneau Actions → Prise de poids assistée, ou directement depuis la fiche → + Événement → pesée).

## Naviguer dans la liste

Panneau **Mes Lapins** (raccourci `2`) :

- **Recherche** : champ en haut (raccourci `/`). Cherche dans code, nom, race, cage.
- **Filtres** : sexe (mâle/femelle), statut (actif/vendu/mort), poids min/max.
- **Tri** : par cage (défaut), nom, code, date d'ajout.
- **Badges** : 🤰 gestation en cours, 🏪 en vente, statut (vendu/mort).

Cliquer sur un lapin ouvre sa **fiche détaillée** à droite (sur mobile : remplit l'écran). Le bouton **« + »** sur chaque ligne ajoute directement un événement sans ouvrir la fiche.

## Fiche lapin

L'écran de détail rassemble :

- **Identité** : photo de profil, code, nom, race, cage, statut, parents.
- **Reproduction** (femelles uniquement) : dernière saillie, gestation en cours, mise-bas estimée.
- **Descendance** : nombre de portées, taux de survie, lapereaux actifs.
- **Généalogie** : mère, père, fratrie (lien cliquable).
- **Poids** : graphique d'évolution + dernier poids.
- **Photos** : grille d'évolution visuelle (avant/après).
- **Événements** : historique complet (panneau du bas).
- **Actions** : 🖨️ Carnet sanitaire imprimable, 🏪 Mise en vente, Modifier, Supprimer.

## Ajouter un événement

Bouton **+ Ajouter un événement** au pied de la fiche. Types disponibles :

| Type | Champs spécifiques |
|---|---|
| ❤️ Saillie | Mâle (sélecteur) |
| 🐣 Mise-bas | Nés / vivants / morts |
| 🐇 Sevrage | Cage destination, lapereaux à sevrer |
| ⚖️ Pesée | Poids en kg |
| 💉 Vaccin | Produit, dose, prochain rappel |
| 💊 Traitement | Produit, dose, prochain rappel |
| 💀 Décès | (passe le lapin en statut « mort ») |
| 💰 Vente | Prix, poids éventuel, acheteur |
| 📝 Autre | Note libre |

Les **stages cycles** (kit → jeune → adulte) sont déduits automatiquement de la date de naissance.

## Cages et bâtiments

Panneau **Bâtiments** (raccourci `5`) :

- Créer un bâtiment (lettre A, B, C…) avec un nombre de loges.
- Visualiser la **grille** des loges (1 carré = 1 cage) avec un badge si une cage contient un lapin actif.
- Signaler un **défaut** (fuite, casse) en cliquant sur la cage.
- Inspection périodique : enregistrée comme événement bâtiment.

## Tournée du jour

Panneau **Actions → Tournée du jour** : un assistant qui affiche tous les lapins actifs (triés par cage) et permet de cocher en un clic :

- 💧 Eau distribuée
- 🌾 Portion nourrie par lapin (aucun / petit / moyen / full)
- 🧹 Nettoyage effectué

Chaque action peut être attribuée à un **membre** de la ferme (utile pour les équipes).
