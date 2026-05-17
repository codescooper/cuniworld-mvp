# 03 — Suivre la santé

## Vaccins et traitements

Sur la fiche d'un lapin → **+ Ajouter un événement** → choisir **Vaccin** ou **Traitement**. Renseignez :

- **Produit** : nom commercial (ex : « Filavac »).
- **Dose** : volume ou unité (ex : « 0.5 mL »).
- **Prochain rappel** : la date du prochain rappel. **C'est ce qui déclenche les alertes**.

Les rappels apparaissent dans 3 endroits :

1. **Dashboard** : tuile « Rappels (≤7j) » et liste des rappels urgents.
2. **Notifications push** (si autorisées) : déclenchées le matin (cf. Actions → Notifications push).
3. **Aujourd'hui dans la ferme** (dashboard) : section « 🔴 Urgent » liste les rappels en retard.

## Pesées et indice de consommation

Le suivi du poids alimente :

- Le **graphique d'évolution** par lapin (fiche détaillée).
- Le **poids total du cheptel** (dashboard).
- L'**indice de consommation** (Stats) : kg aliment / kg vif produit. Un IC entre 3 et 4 est attendu en cuniculture saine.
- Le **Budget Client** : trouver les lapins dans une fourchette de prix donnée (Dashboard → 🎯 Budget client).

### Prise de poids assistée

Panneau **Actions → Prise de poids assistée** : ouvre un assistant qui liste **tous les lapins à peser** (selon le cycle paramétré) **dans l'ordre des cages**. Vous parcourez les fiches une par une avec balance en main. Très efficace pour les sessions de pesée groupées.

Le **cycle de pesée** (combien de jours entre 2 pesées attendues) se configure dans **Actions → Paramètres ferme**.

## Carnet sanitaire imprimable

Sur la fiche d'un lapin, bouton **🖨️ Carnet** (en haut à droite) :

- Ouvre une fenêtre dédiée avec : identité de l'animal, table des **actes vétérinaires**, table des **pesées**, espace **cachet du vétérinaire**.
- Cliquez **🖨️ Imprimer / Enregistrer en PDF** dans la fenêtre.
- Tous les navigateurs modernes savent **enregistrer en PDF** depuis la boîte de dialogue d'impression — pratique pour archiver ou envoyer au vétérinaire par email.

## Mortalité

- Enregistrer un événement **Décès** passe le lapin en statut « mort » (visible dans les stats).
- Les morts ne sont **plus comptés** dans les tournées, rappels, KPI actifs.
- Mais ils restent **consultables** (filtre statut → mort) pour analyse a posteriori.

Stats Mortalité par race : panneau **Stats** → carte « Cheptel par race ». Permet d'identifier une race à problème.

## Défauts et inspections bâtiments

Panneau **Bâtiments** :

- Cliquer une cage → **⚠️ Signaler un défaut** (mineur ou majeur). Le défaut reste « ouvert » jusqu'à résolution.
- Le badge nav 🏗️ affiche le nombre de défauts ouverts.
- Bouton **🔍 Inspection** sur un bâtiment : enregistre une inspection visuelle, le compteur « jours depuis dernière inspection » se réinitialise.
- Section **« Inspections en retard »** dans le dashboard.
