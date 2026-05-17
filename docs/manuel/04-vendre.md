# 04 — Vendre & boutique

## Mise en vente

Deux chemins :

- **Depuis la fiche lapin** : bouton **🏪 Mettre en vente**. Ouvre un modal court : prix de vente (la valeur est pré-remplie à partir du dernier poids × prix vif au kg paramétré), description courte.
- **Mise en vente groupée** : panneau **Boutique** → bouton « + Mettre des lapins en vente » (à venir).

Une fois en vente, le lapin :

- Affiche le badge 🏪 partout dans l'app.
- Devient **visible publiquement** sur votre boutique à l'URL `https://cuniworld.app/?shop=<farmId>` (le lien se partage depuis **Actions → Partager ma boutique** : WhatsApp, copie de lien, QR code).
- Apparaît dans le **module Budget Client** (Dashboard → 🎯 Budget client) avec son prix calculé.

## Boutique publique (vue client)

Les visiteurs anonymes voient :

- Le nom de votre ferme, sa description et vos contacts (téléphone, WhatsApp).
- La grille des lapins en vente avec **photo principale**, **prix**, **race**, **âge**, **poids**.
- Un formulaire de **réservation invité** (pas de compte requis) : nom, téléphone, email, adresse, message libre.

Aucune donnée privée ne fuit : seuls les lapins **explicitement** marqués « en vente » sont exposés, plus leur photo et leur historique de poids (pour le prix au kg). Vos notes, événements santé, autres lapins restent **invisibles**.

## Gérer les commandes

Panneau **Commandes** (raccourci `8`, badge sur la nav avec le nombre de commandes en attente).

Cycle de vie d'une commande :

```
🔒 Réservé  →  💰 Payé  →  🚚 En route  →  ✅ Livré
                                            ↘
                                              ❌ Annulé (possible à toute étape)
```

Pour chaque commande, vous pouvez :

- **📞 Appeler** ou **💬 WhatsApp** directement (le contact client est cliquable).
- **✎ Modifier le prix** d'un article (si négocié).
- **→ Passer au statut suivant** (mise à jour cloud + notif au client si vous lui avez communiqué le lien de suivi).
- **❌ Annuler** : le lapin redevient disponible dans la boutique.

À la livraison (passage en ✅), CuniWorld propose automatiquement :

- De créer un **événement vente** sur chaque lapin (passage en statut « vendu » + prix capté → alimente la comptabilité).
- D'**imprimer la facture** (bouton 🧾 Facture PDF) avec numéro `FACT-YYYYMM-XXXXXXXX`, vendeur (depuis vos mentions légales), client, total.

## Comptabilité

Panneau **Actions → 📊 Comptabilité** :

- **Recettes totales** : calculées automatiquement depuis les événements vente + commandes livrées (pas de double comptage).
- **Dépenses** : à saisir manuellement, 7 catégories (aliments, vétérinaire, eau, électricité, main d'œuvre, équipement, autre).
- **P&L mensuel** : tableau Mois / Recettes / Dépenses / Net.
- **Détail recettes** : déroulant avec chaque vente individuelle.

Saisir une dépense : formulaire en bas du modal (date, catégorie, montant, description). Les dépenses sont synchronisées si vous êtes en mode cloud.

## Lien d'invitation

Panneau **Actions → Paramètres ferme → Inviter un membre** : génère un lien à partager. Au clic, le membre s'inscrit (ou se connecte) et rejoint la ferme avec le rôle « Membre » (lecture+écriture, sauf gestion des membres).

Les rôles disponibles :

| Rôle | Lapins | Membres | Paramètres |
|---|---|---|---|
| Propriétaire (`owner`) | Tout | Tout | Tout |
| Admin | Tout | Tout sauf owner | Tout |
| Membre | Lire/écrire | Voir | Lire |
| Viewer | Lire | Voir | Lire |

Le rôle se change depuis **Paramètres ferme → Membres**.
