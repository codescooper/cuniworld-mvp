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

- [ ] **2.1** Intégrer Sentry (ou alternative : Vercel monitoring) — capture des erreurs JS prod
- [ ] **2.2** Backup quotidien Supabase + script restore documenté (`docs/ops/backup-restore.md`)
- [ ] **2.3** Audit RLS : revue ligne par ligne des policies sur toutes les tables, tests d'isolement cross-ferme
- [ ] **2.4** Health-check : page `/status` minimaliste (build version + supabase ping)
- [ ] **2.5** Procédure incident documentée (`docs/ops/incident-runbook.md`)

## Phase 3 — Qualité technique 🟠

- [ ] **3.1** Code-splitting : `import()` dynamique pour `genealogy3d.js`, `simulation.js`, `renderShop.js` → bundle initial < 250 kB
- [ ] **3.2** Audit accessibilité (axe-core ou Lighthouse) + corrections AA (focus visible, contrastes, aria-labels manquants)
- [ ] **3.3** Navigation clavier complète (toutes les actions atteignables sans souris)
- [ ] **3.4** E2E : ajouter specs pour 5 flux critiques
  - [ ] auth → création ferme → premier lapin
  - [ ] saillie → gestation → mise-bas → sevrage (cycle complet)
  - [ ] boutique : mise en vente → commande invité → fulfillment
  - [ ] sync multi-onglets (mutation A → réception B)
  - [ ] offline : actions hors-ligne → reconnect → drain queue
- [ ] **3.5** Test de charge : générer 1000 lapins + 5000 événements et mesurer temps de rendu / scroll
- [ ] **3.6** Réduire le risque XSS : audit `innerHTML` non-`escapeHTML`

## Phase 4 — Fonctionnel manquant 🟠

- [ ] **4.1** Module **Comptabilité** : recettes (auto depuis ventes shop) + dépenses manuelles (aliments, véto, eau, électricité, main d'œuvre) → P&L mensuel
- [ ] **4.2** **Carnet sanitaire PDF** imprimable par lapin (jsPDF ou print CSS) — pour le vétérinaire
- [ ] **4.3** **Facture PDF** pour chaque vente boutique (numérotée, devise, mentions légales du vendeur)
- [ ] **4.4** **Suivi alimentation** : lier consommation stock aliments → lots/cages, calcul indice de consommation (kg aliment / kg vif produit)
- [ ] **4.5** Stats reproducteurs : classement femelles par fertilité (portées/an, sevrés/portée, survie), classement mâles par paternité confirmée

## Phase 5 — UX / onboarding 🟡

- [ ] **5.1** Onboarding guidé première connexion (3-4 étapes : ferme, 1er bâtiment, 1er lapin)
- [ ] **5.2** Manuel utilisateur dans `docs/manuel/` (5 pages : démarrer, gérer le cheptel, suivre santé, vendre, sauvegarder)
- [ ] **5.3** Mode démo (compte démo public, données réinitialisées chaque nuit)
- [x] **5.4** Mode sombre (variables CSS déjà en place, ajouter toggle)
- [ ] **5.5** Aide contextuelle (`?` hovers sur chaque champ paramètre)

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
| 2026-05-17 | _ce commit_ | Phase 1 complète (1.1 → 1.7) + thème sombre (5.4) | 80 % |
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
