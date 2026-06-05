# Design — Module Comptabilité exhaustif (journal de trésorerie)

> Statut : **validé** (brainstorming 2026-06-05). Prochaine étape : plan d'implémentation (writing-plans).

## Objectif

Faire évoluer le module Comptabilité actuel (recettes auto + dépenses manuelles,
P&L mensuel, local-only) vers un **journal de trésorerie exhaustif** qui capture
**toutes** les entrées et sorties d'argent de la ferme, synchronisé entre
appareils, avec rapports (P&L mensuel/annuel, trésorerie, export comptable,
graphiques).

Périmètre confirmé : **uniquement financier** (argent). Pas de mouvements
physiques d'animaux ni de valorisation d'inventaire dans ce module.

## Existant (point de départ)

- `src/accounting.js` : fonctions pures. Recettes dérivées des événements `vente`
  (+ commandes boutique livrées) ; dépenses dans `state.expenses[]` (7
  catégories) ; `computeMonthlyPL` / `computeTotals`.
- `src/renderAccounting.js` : modale unique (tuiles + table P&L + formulaire
  dépense + liste).
- `tests/accounting.test.js` : spec exécutable.
- **Limite majeure** : `state.expenses[]` n'est **pas** synchronisé cloud (absent
  de `DB.upsert*` / `_autoMigrateLocalModules`). La compta est locale uniquement.
- Multi-devises déjà disponible via `src/currency.js`.

## Décisions de conception

1. **Architecture : journal unifié** (« ledger »). Tout mouvement d'argent = une
   ligne `{ direction:'in'|'out' }`. (Écarté : compta en partie double = overkill ;
   écarté : deux compartiments séparés = duplication.)
2. **Flux capturés** : recettes hors-vente, achats de stock = dépenses, achat de
   reproducteurs, charges récurrentes auto. (Les 4.)
3. **Rapports** : P&L mensuel + annuel, trésorerie/solde, export comptable
   (CSV + impression PDF), graphiques. (Les 4.)
4. **Synchronisation cloud** : la compta se synchronise entre appareils comme le
   module Stock (tables SQL + Realtime + réconciliation).

---

## 1. Modèle de données (`state`)

### `state.transactions[]` — mouvements manuels

Recettes hors-vente **et** dépenses ponctuelles, dans une seule collection.

```js
{
  id,                       // uid('tx')
  date: 'YYYY-MM-DD',
  direction: 'in' | 'out',
  category,                 // cf. taxonomie ci-dessous (cohérente avec direction)
  amount,                   // Number > 0
  currency,                 // code ISO ; défaut = devise ferme
  description,              // string (trim)
  createdAt,                // nowISO()
  refType?: 'rabbit',       // lien optionnel (ex. achat saisi manuellement)
  refId?,
}
```

**Migration** : `state.expenses[]` → `state.transactions[]` en mappant chaque
dépense vers `{ ...e, direction:'out' }`. Migration idempotente, exécutée une
fois (au chargement / dans le module ledger), `state.expenses` supprimé ensuite.

### `state.recurringCharges[]` — charges récurrentes

```js
{
  id,                       // uid('rec')
  label,                    // 'Loyer hangar'
  direction: 'out',         // (généralement) ; 'in' autorisé
  category,
  amount,                   // Number > 0
  currency,
  dayOfMonth: 1,            // 1..28
  startMonth: 'YYYY-MM',
  endMonth: null,           // null = ouvert
  skips: [],                // ['YYYY-MM', ...] occurrences annulées
  overrides: {},            // { 'YYYY-MM': montant } occurrences ajustées
  createdAt,
}
```

Dépliées par une fonction pure à la lecture, de `startMonth` à
`min(endMonth, mois courant)`. `skips` retire une occurrence ; `overrides` change
son montant. Aucune génération persistée (pas de cron).

### Taxonomie de catégories

Étend `EXPENSE_CATEGORIES` existant. Deux ensembles selon `direction`.

- **Sorties (`out`)** : `aliment`, `veto`, `eau`, `electricite`, `main_oeuvre`,
  `equipement`, `achat_animal`, `loyer`, `abonnement`, `autre`.
- **Entrées (`in`)** : `vente_lapin` (auto, événements `vente`),
  `vente_boutique` (auto, commandes), `vente_divers`, `subvention`, `saillie`,
  `fumier`, `prestation`, `autre_recette`.

Chaque catégorie : `{ label, icon, direction }`. Les catégories `auto` ne sont pas
proposées à la saisie manuelle.

---

## 2. Module métier `src/ledger.js` (pur, testable)

Absorbe `accounting.js` (qui devient un mince ré-export pour compat, ou est
supprimé après mise à jour des imports). Toutes les fonctions pures
(`state` en entrée → valeur en sortie), modèle `tests/weightSearch.test.js`.

```js
// Journal unifié
listLedger(state, { orders = [] }) → [{
  date, direction, category, amount, currency,
  source: 'event' | 'order' | 'stock' | 'recurring' | 'manual',
  refId, label, editable  // editable=true seulement pour source 'manual'
}]
// Fusionne, normalise, trie date desc :
//   ventes (events 'vente')         → in  / vente_lapin
//   commandes boutique livrées      → in  / vente_boutique   (anti-double-compte existant conservé)
//   achats reproducteurs (events 'achat') → out / achat_animal
//   mouvements stock 'entree' avec totalCost → out / <cat. mappée>
//   charges récurrentes dépliées    → out|in / <cat.>
//   transactions manuelles          → direction / <cat.>

// CRUD manuel
addTransaction(state, { date, direction, category, amount, currency?, description?, refType?, refId? })
deleteTransaction(state, id)

// CRUD récurrentes
addRecurringCharge(state, {...})
updateRecurringCharge(state, id, fields)
deleteRecurringCharge(state, id)
skipRecurringOccurrence(state, id, 'YYYY-MM')
setRecurringOverride(state, id, 'YYYY-MM', amount)

// Agrégations
computeMonthlyPL(state, { orders }) → [{ month, in, out, byCat, net }]  // desc
computeYearlyPL(state, { orders })  → [{ year,  in, out, byCat, net }]  // desc
computeTreasury(state, { orders })  → { balance, series: [{ date, cumulative }] }
computeTotals(state, { orders })    → { in, out, net, byCat }

// Export
listLedgerCSV(state, { orders }) → string   // colonnes : date;sens;catégorie;libellé;montant;devise;source

// Migration (idempotente)
migrateExpensesToTransactions(state) → state
```

Anti-double-comptage ventes/commandes : on conserve la logique actuelle de
`accounting.listRevenues` (une commande dont toutes les lignes sont déjà
reflétées en événement `vente` est ignorée).

---

## 3. UI — refonte `src/renderAccounting.js` en onglets

Modale `📊 Comptabilité` à 4 onglets. HTML par template literals + `escapeHTML`/
`escapeAttr` ; pour tout SVG, `setAttribute('class')` (jamais `.className`).

| Onglet | Contenu |
|---|---|
| **Vue d'ensemble** | 3 tuiles (Recettes / Dépenses / Net) + **solde de trésorerie** ; graphique *recettes vs dépenses dans le temps* (barres) + *répartition des dépenses par catégorie* (barres horizontales). |
| **Journal** | Liste `listLedger` avec **filtres** (période, sens in/out, catégorie, source) ; badge couleur par source (auto/manuel) ; **saisie rapide** d'une ligne manuelle (recette hors-vente ou dépense) ; suppression réservée aux lignes `editable` (manuelles). |
| **P&L** | Tableau **mensuel** + bascule **annuel**, détail par catégorie. |
| **Récurrentes** | CRUD charges récurrentes + aperçu des prochaines occurrences ; actions « ignorer ce mois » / « ajuster ce mois ». |

Barre d'actions : **Export CSV** (`listLedgerCSV` → téléchargement) +
**Imprimer** (`window.print()`, cohérent avec `printable.js`).

Affichage monétaire via `formatCurrency` / `getSettings` (existant). Les lignes en
devise étrangère sont affichées telles quelles ; l'export convertit via
`currency.js`.

---

## 4. Points d'intégration

- **Stock** (`stockService.js` + `renderStock.js`) : champ `Coût total`
  (optionnel) sur le formulaire d'entrée → `addStockMovement` accepte
  `totalCost`/`unitCost` sur `type==='entree'`. Mapping catégorie stock →
  catégorie dépense (`aliment`→`aliment`, `medicament/veto`→`veto`,
  `materiel`→`equipement`, défaut→`autre`).
- **Lapin — événement `achat`** : nouveau type `achat` (miroir de `vente`,
  `data.price`). Exposé dans le formulaire d'événement ; option « acheté pour X »
  à la création d'un lapin (crée l'événement `achat`).
- **Charges récurrentes** : dépliage pur à la lecture (pas de cron).
- **Devises** : chaque ligne porte sa `currency` (défaut = devise ferme).

### Synchronisation cloud (parité avec le module Stock)

`transactions[]` et `recurringCharges[]` suivent le chemin de sync complet :

1. **Tables SQL** : migration `supabase/migrations/015_accounting.sql` créant
   `transactions` et `recurring_charges` (colonnes + `farm_id`, RLS membres de la
   ferme, `replica identity full`, ajout à la publication `supabase_realtime`).
   Pattern repris des tables `stock_items` / `stock_movements`.
2. **DB layer** : `DB.upsertTransaction`, `DB.deleteTransaction`,
   `DB.upsertRecurringCharge`, `DB.deleteRecurringCharge` + fetch dans le
   chargement de ferme.
3. **Realtime** : mapping table→state dans `_applyChange` (syncManager).
4. **Chargement / réconciliation** : inclure les deux collections dans
   `_loadFarm`, `_autoMigrateLocalModules` (via `needsArr`), `reconcileLocalToCloud`
   (scopé par ferme) et `_remapStateIds` (régénération d'id à l'import).

---

## 5. Tests

- `tests/ledger.test.js` (nouveau) :
  - dépliage des récurrentes (bornes, skips, overrides, mois courant) ;
  - anti-double-comptage ventes/commandes (régression de l'existant) ;
  - stock `entree` avec `totalCost` → dépense dérivée, mapping catégorie ;
  - événement `achat` → dépense `achat_animal` ;
  - trésorerie cumulée (série + solde) ;
  - migration `expenses[]`→`transactions[]` (idempotente) ;
  - `listLedgerCSV` (format, échappement). 
- `tests/accounting.test.js` : mis à jour (compat ré-export ou suppression).
- Build + lint verts.

## Hors périmètre (YAGNI)

- Compta en partie double / plan comptable.
- Valorisation d'inventaire, amortissements.
- Mouvements physiques d'animaux dans ce module (déjà couverts par lapins/lots).
- TVA / déclarations fiscales automatisées.

## Risques / points d'attention

- La sync ajoute deux tables : nécessite l'application des migrations en prod
  (même classe de problème que la sync photos en cours). À documenter.
- Mapping catégorie stock→dépense : garder simple, défaut `autre`.
- Migration `expenses`→`transactions` : doit être idempotente et tourner avant
  tout calcul, sans perdre de données locales non synchronisées.
