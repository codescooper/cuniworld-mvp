# Instructions Claude — CuniWorld

## Projet

CuniWorld est une **PWA offline-first** de gestion d'élevage de lapins, écrite en **JavaScript vanilla** (modules ES), sans framework UI. Backend : **Supabase** (auth, storage, realtime). Build : **Vite**. Tests : **Vitest** + **Playwright**.

## Feuille de route active

📍 **Consulter `ROADMAP_PRODUCTION.md` à chaque session** — c'est le document directeur pour l'avancement vers la v1.0 production.

À chaque modif :
- Identifier à quel item de la roadmap ça correspond (ou marquer "hors roadmap" dans le commit).
- Cocher la case `[x]` dans `ROADMAP_PRODUCTION.md` quand un item est clôturé, dans le même commit.
- Mettre à jour le tableau "Suivi des sessions" en bas si la session a fait progresser le % global.

## Conventions code

- **Vanilla JS, ES modules** — pas de framework. Garder cette contrainte.
- **HTML par template literals** dans les fichiers `render*.js` / `wire*.js`. Toujours `escapeHTML` / `escapeAttr` pour le contenu user.
- **State global** dans `ctx` (passé partout). `Store.save()` persiste sur localStorage + déclenche la sync cloud.
- **Pas de PR ni branches** : commits directs sur `main`, push systématique après chaque grosse modif ([[feedback-git-workflow]], [[feedback-auto-push]]).
- **Tests obligatoires** pour tout nouveau module métier (cf `tests/weightSearch.test.js` comme modèle).

## Garde-fous

- Ne **jamais** introduire de framework (React, Vue, etc.) — décision produit ferme.
- Ne **jamais** mocker la base dans les tests d'intégration : utiliser le `state` en mémoire.
- Pour SVG : utiliser `setAttribute('class')` jamais `.className` ([[feedback-svg-classname]]).
- Toute action destructive (delete, reset, force-push) demande confirmation user.

## Workflow type

1. Lire `ROADMAP_PRODUCTION.md` en début de session
2. Identifier le prochain item prioritaire (🔴 puis 🟠 puis 🟡 puis 🟢)
3. Implémenter + tests + lint + build
4. Cocher la case + commit + push
5. Passer au suivant ou attendre input user
