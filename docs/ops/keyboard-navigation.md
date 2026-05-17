# Navigation clavier — CuniWorld

> **Référence** : roadmap item 3.3.
> **Dernière mise à jour** : 2026-05-17.

## Raccourcis globaux (en dehors d'un champ ou d'une modale)

| Touche | Action |
|---|---|
| `1` – `9` | Naviguer vers un panneau (1=Dashboard, 2=Mes Lapins, …, 9=Actions) |
| `N` | Créer un nouveau lapin |
| `/` | Focus la barre de recherche du panneau actif |
| `Esc` | Fermer la modale ouverte |

Implémentation : `app.js:wireNav()` — listener `keydown` qui ignore les events si un input/textarea/select a le focus ou si une modale est ouverte.

## Navigation tabulation

- Tous les boutons et inputs visibles sont accessibles par `Tab` (le focus visible respecte la cascade CSS native).
- Les boutons "proxy" cachés (`#btnExport`, `#btnReset`, `#guideToggle`) ont `tabindex="-1"` + `aria-hidden="true"` pour qu'ils ne pollueent ni le tab order ni les lecteurs d'écran.

## Lecteur d'écran

- `<html lang="fr">` : prononciation française par défaut.
- Tous les boutons icône-seule (`✕`, `🗑️`, …) ont un `aria-label` explicite.
- Les inputs sont accessibles via `<label for>` ou `placeholder`.
- Le badge de sync (`#syncBadge`) a `role="button"` + `tabindex="0"` + handler `Enter`/`Space`.
- Les zones live (toasts, badges) ont `aria-live`.

## Garde-fou automatisé

`tests/a11y.test.js` vérifie statiquement :
1. La langue HTML est `fr`.
2. Tous les `<button>` focusable ont un nom accessible.
3. Tous les `<input>` focusable ont un label ou placeholder.
4. La zone toast a `aria-live`.
5. Le bandeau consentement a `role="region"` + `aria-label`.

Cet audit est statique. Pour les renderers dynamiques (cards de lapin, modales générées à la volée), une revue manuelle via Lighthouse ou axe-core est recommandée à chaque ajout de composant.

## Limites connues / à améliorer

- Pas encore d'`aria-current="page"` sur le nav-item actif (impact minime, le bouton `.active` est déjà visuellement distinct).
- Le drag-and-drop des photos n'a pas d'alternative clavier (à ajouter si retours utilisateurs).
- Le viewer 3D de généalogie est navigable à la souris uniquement (panneau lourd, peu utilisé).
