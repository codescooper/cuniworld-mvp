# Audit XSS — CuniWorld

> **Référence** : roadmap item 3.6.
> **Dernière revue** : 2026-05-17 — version 0.6.0.
> **Verdict** : ✅ Aucune faille trouvée.

## Méthodologie

Revue exhaustive de toutes les occurrences d'`innerHTML =` dans le code source :

```bash
grep -rn "innerHTML" src/*.js app.js
```

Pour chaque site, vérification que **toute donnée d'origine utilisateur** est échappée via `escapeHTML(…)` (pour le texte intercalaire) ou `escapeAttr(…)` (pour les attributs HTML). Pour les composants qui rendent via `textContent` (modales, toasts), aucun échappement n'est requis — le navigateur traite la chaîne comme du texte brut.

## Sources de données considérées comme "user-controlled"

Toute valeur qui peut être :
- saisie par l'utilisateur dans un formulaire ou un import JSON,
- reçue d'une autre ferme via Supabase realtime,
- reçue d'un acheteur invité via le formulaire boutique,
- présente dans `rabbit.name|code|notes|cage|breed|description`, `event.notes|data.destCage`, `lodge.note`, `defect.description`, `farm.name|description`, `profile.firstName|lastName`, etc.

## Résultats par fichier

| Fichier | Sites `innerHTML` | Cas user-data | Verdict |
|---|---|---|---|
| `src/render.js` | 23 | tous escapeHTML/escapeAttr (lapins, événements, lots, généalogie, dashboard) | ✅ |
| `src/renderShop.js` | 12 | boutique publique : nom/race/photo/prix tous escapés ; URLs photo via `escapeAttr` | ✅ |
| `src/wireAuth.js` | 11 | overlay auth, sélecteur ferme, dropdown user : noms/emails/messages d'erreur escapés | ✅ |
| `src/wire.js` | 8 | budget search, event extra : utilisent `escapeHTML(r.name/code/cage)` | ✅ |
| `src/genealogy3d.js` | 7 | helper local `esc()` qui échappe `&`, `<`, `>` | ✅ |
| `src/renderOrders.js` | 5 | détails commande : `escapeHTML` sur snapshots, contacts, notes acheteur | ✅ |
| `src/renderStock.js` | 2 | modale via `openModal` (title → textContent), body via escapeHTML | ✅ |
| `src/renderTournee.js` | 2 | noms lapins/cages tous escapés | ✅ |
| `src/renderBuildings.js` | 2 | letters/IDs escapés ; counts numériques | ✅ |
| `src/renderSettings.js` | 2 | values numériques + role select escapé | ✅ |
| `src/renderPhotoDiagnostic.js` | 1 | logs internes, pas de user-data | ✅ |
| `src/photoCheck.js` | 2 | noms lapins escapés | ✅ |
| `src/weightCheck.js` | 2 | idem | ✅ |
| `src/statusPage.js` | 2 | constantes (version, commit, build) — pas de user-data | ✅ |
| `src/stats.js` | 2 | données agrégées, pas de chaînes user | ✅ |
| `src/modal.js` | 2 | `modalTitle.textContent = title` ✅ ; `modalBody.innerHTML = html` (l'appelant est responsable, voir ci-dessous) | ⚠️ |
| `src/notifications.js` | 1 | `.confirm-msg.textContent = message` ✅ | ✅ |

### Cas particulier : `openModal(el, title, html)`

`modal.js:14` fait `modalBody.innerHTML = html ?? ""`. Le HTML est **construit par l'appelant**, et c'est à l'appelant d'échapper les valeurs user. Tous les appelants audités le font correctement :
- `accountService` (formulaire suppression compte) : HTML statique.
- `renderStock` : `escapeHTML(item.unit)` partout.
- `renderTournee` : `escapeHTML(r.cage|name|code|breed|notes)`.
- `weightCheck` / `photoCheck` : `escapeHTML(rabbit.name)`.
- `legal.js` : `escapeHTML(LEGAL_CONFIG.*)`.
- `wireAuth` : profils via `escapeHTML(firstName|lastName)`.

## Convention codée

Les helpers d'échappement sont dans `src/utils.js` :
- `escapeHTML(s)` — pour intercalaire texte/HTML.
- `escapeAttr(s)` — pour valeurs d'attributs (incluant `href`, `src`, `title`, `data-*`).

**Règle d'or** : toute interpolation `${…}` dans un template `innerHTML` doit être l'un de :
1. Une valeur numérique (`Number`).
2. Un littéral connu (`'on' | 'off'`, badge, label hardcodé).
3. Un résultat de `escapeHTML(…)` ou `escapeAttr(…)`.
4. Un fragment HTML déjà construit en suivant la même règle.

## Garde-fous automatisés

- `tests/xssSafety.test.js` — exécute la suite de rendu avec un payload `<script>alert(1)</script>` dans les champs name/code/notes et vérifie qu'aucun nœud `<script>` n'est créé.
- E2E `e2e/xss-safety.spec.js` — bout-en-bout : crée un lapin avec un nom XSS et vérifie qu'aucune alerte ne se déclenche.

## Procédure de revue (à refaire à chaque nouveau renderer)

1. Grep `innerHTML` dans le nouveau fichier.
2. Pour chaque site, identifier les `${…}`.
3. S'assurer qu'aucun ne contient de donnée user non-escape.
4. Ajouter un cas dans `tests/xssSafety.test.js` si pertinent.
