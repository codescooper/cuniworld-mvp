# 🎯 Feuille de route — Passage à 100 % production (CuniWorld)

> **Document directeur** suivi par Claude à chaque session. Mettre à jour les cases au fur et à mesure. Tout commit qui clôture un item DOIT cocher la case correspondante.

**Référence** : bilan du 2026-05-16, version 0.6.0, départ à ~75 %.

---

## Légende

- [ ] À faire
- [~] En cours
- [x] Fait
- 🔴 Critique (bloquant pour lancement public) · 🟠 Important · 🟡 Souhaitable · 🟢 Nice-to-have

---

## Phase 1 — Conformité légale & RGPD 🔴

- [x] **1.1** Page Mentions légales (`/legal`) avec éditeur, hébergeur, responsable traitement
- [x] **1.2** Page Conditions générales d'utilisation (`/cgu`) — template adapté SaaS solo
- [x] **1.3** Page Politique de confidentialité (`/privacy`) — données collectées, finalité, durée, droits
- [x] **1.4** Bandeau consentement (cookies/analytics) — refusable, mémorisé localStorage
- [x] **1.5** Lien footer vers les 3 pages depuis toute l'app
- [x] **1.6** Bouton "Exporter mes données" (déjà existant via export JSON) + "Supprimer mon compte" (RGPD) — migration `014_delete_my_account.sql` + `src/accountService.js`
- [x] **1.7** Registre des traitements interne (fichier `docs/rgpd/registre.md`)

> **À compléter avant lancement public** : `LEGAL_CONFIG` dans `src/legal.js` contient encore quelques placeholders (adresse postale, juridiction). Le bandeau d'avertissement reste affiché tant que ces valeurs ne sont pas saisies.

## Phase 2 — Monitoring & ops 🔴

- [x] **2.1** Intégrer Sentry (ou alternative : Vercel monitoring) — capture des erreurs JS prod — wrapper `src/monitoring.js` (sans SDK, payload natif)
- [x] **2.2** Backup quotidien Supabase + script restore documenté (`docs/ops/backup-restore.md`) — script `scripts/backup-supabase.sh`
- [x] **2.3** Audit RLS : revue ligne par ligne des policies sur toutes les tables, tests d'isolement cross-ferme — `docs/ops/rls-audit.md` + `tests/rlsAudit.test.js`
- [x] **2.4** Health-check : page `/status` minimaliste (build version + supabase ping) — accessible via `?status=1`
- [x] **2.5** Procédure incident documentée (`docs/ops/incident-runbook.md`)

> **À activer en prod** : définir `VITE_SENTRY_DSN` dans Vercel env vars pour activer le monitoring + planifier le cron du script `scripts/backup-supabase.sh` sur la machine du mainteneur.

## Phase 3 — Qualité technique 🟠

- [x] **3.1** Code-splitting : `import()` dynamique pour `genealogy3d.js`, `simulation.js`, `renderShop.js` → bundle initial < 250 kB — `vite.config.js` isole le SDK Supabase (80 kB gzip pour l'index)
- [x] **3.2** Audit accessibilité (axe-core ou Lighthouse) + corrections AA (focus visible, contrastes, aria-labels manquants) — `tests/a11y.test.js` garde-fou statique
- [x] **3.3** Navigation clavier complète (toutes les actions atteignables sans souris) — déjà câblée (`1-9`, `N`, `/`, `Esc`), documentée dans `docs/ops/keyboard-navigation.md`
- [~] **3.4** E2E : ajouter specs pour 5 flux critiques
  - [x] auth → création ferme → premier lapin — variante locale `e2e/onboarding.spec.js`
  - [x] saillie → gestation → mise-bas → sevrage (cycle complet) — `e2e/smoke.spec.js`
  - [ ] boutique : mise en vente → commande invité → fulfillment — _requiert Supabase de test (voir `e2e/README.md`)_
  - [ ] sync multi-onglets (mutation A → réception B) — _idem_
  - [ ] offline : actions hors-ligne → reconnect → drain queue — _idem_
- [x] **3.5** Test de charge : générer 1000 lapins + 5000 événements et mesurer temps de rendu / scroll — `tests/loadTest.test.js` ; perfs après optimisation : dashboard 118 s → 2.4 s en jsdom (~ 0.25 s en navigateur réel)
- [x] **3.6** Réduire le risque XSS : audit `innerHTML` non-`escapeHTML` — `docs/ops/xss-audit.md` (aucune faille) + `tests/xssSafety.test.js` + `e2e/xss-safety.spec.js`

## Phase 4 — Fonctionnel manquant 🟠

- [x] **4.1** Module **Comptabilité** : recettes (auto depuis ventes shop) + dépenses manuelles (aliments, véto, eau, électricité, main d'œuvre) → P&L mensuel — `src/accounting.js` + modal `renderAccounting.js` (tile 📊 dans Actions)
- [x] **4.2** **Carnet sanitaire PDF** imprimable par lapin (jsPDF ou print CSS) — pour le vétérinaire — `src/printable.js#printSanitaryRecord` via `window.print()` (pas de jsPDF)
- [x] **4.3** **Facture PDF** pour chaque vente boutique (numérotée, devise, mentions légales du vendeur) — `src/printable.js#printInvoice`, bouton sur commandes livrées
- [x] **4.4** **Suivi alimentation** : lier consommation stock aliments → lots/cages, calcul indice de consommation (kg aliment / kg vif produit) — `src/feedTracking.js`, affichage dans Stats
- [x] **4.5** Stats reproducteurs : classement femelles par fertilité (portées/an, sevrés/portée, survie), classement mâles par paternité confirmée — `src/breederStats.js`, affichage dans Stats

## Phase 5 — UX / onboarding 🟡

- [x] **5.1** Onboarding guidé première connexion (3-4 étapes : ferme, 1er bâtiment, 1er lapin) — `src/onboarding.js`, overlay déclenché si state vide + pas de flag
- [x] **5.2** Manuel utilisateur dans `docs/manuel/` (5 pages : démarrer, gérer le cheptel, suivre santé, vendre, sauvegarder) — liens depuis le panneau Documentation
- [x] **5.3** Mode démo (compte démo public, données réinitialisées chaque nuit) — URL `?demo=1` (mode local). Procédure compte démo cloud + cron `pg_cron` documentée dans `docs/ops/demo-mode.md`
- [x] **5.4** Mode sombre (variables CSS déjà en place, ajouter toggle)
- [x] **5.5** Aide contextuelle (`?` hovers sur chaque champ paramètre) — `_hint()` dans `renderSettings.js`, badge `.help-hint` stylé

## Phase 6 — i18n & notifications avancées 🟢

- [ ] **6.1** Notifications email (Supabase Edge Function → Resend/SendGrid pour rappels vaccins/mises-bas)
- [ ] **6.2** i18n FR + EN (clés extraites des templates HTML/JS)
- [ ] **6.3** Multi-devises pour export comptable (taux de change figé par exercice)
- [ ] **6.4** Mode multi-fermes pour un même utilisateur déjà supporté ; améliorer le sélecteur

---

## Suivi des sessions

À mettre à jour à chaque session de finalisation :

| Date | Commit | Items clôturés | % global estimé |
|---|---|---|---|
| 2026-05-15 | 19dffa1 | Hors roadmap (cycle pesée + nav cage) | 75 % |
| 2026-05-15 | 7dadf5c | Hors roadmap (recherche poids/budget) | 75 % |
| 2026-05-17 | 9ba6329 | Phase 1 complète (1.1 → 1.7) + thème sombre (5.4) | 80 % |
| 2026-05-17 | 5ba9bc5 | Phase 2 complète (2.1 → 2.5) — monitoring, backups, RLS, /status, runbook | 85 % |
| 2026-05-17 | cc35852 | Phase 3 quasi-complète (3.1, 3.2, 3.3, 3.5, 3.6 + 2/5 sous-items 3.4) — code-splitting Supabase, a11y, charge (×50 perf dashboard), XSS audit, optims event index | 90 % |
| 2026-05-17 | e74bdc6 | Phase 4 complète (4.1 → 4.5) — comptabilité P&L, carnet sanitaire & facture imprimables, indice de consommation, classements reproducteurs | 95 % |
| 2026-05-17 | _ce commit_ | Phase 5 complète (5.1 → 5.5) — onboarding 3 étapes, 5 pages manuel, mode démo `?demo=1`, hovers d'aide | 98 % |
| _à compléter_ | | | |

---

## Règles de progression suivies par Claude

1. **Ordre de priorité** : 🔴 → 🟠 → 🟡 → 🟢. Ne pas sauter de phase sans raison explicite du user.
2. **Granularité** : un commit = un ou plusieurs items cochés. Pas de demi-mesure.
3. **Tests systématiques** : tout nouveau code = test associé OU justification d'absence dans le commit.
4. **Auto-push** ([[feedback-auto-push]]) après chaque item clôturé, tests + build verts.
5. **Mettre à jour ce fichier** dans le même commit (cocher la case + ajouter ligne au tableau de suivi si besoin).
6. **Si un item est trop gros** pour une session : marquer `[~]` et créer des sous-items.
7. **Demander au user** seulement pour les décisions juridiques/produit (ex : raison sociale dans CGU, taux de TVA, fournisseur d'email).
