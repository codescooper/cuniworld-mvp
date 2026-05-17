# Tests e2e — CuniWorld

Lance les tests : `npm run test:e2e` (build + preview server + Playwright).

## Specs actuelles (mode local, `?e2e=1`)

| Spec | Couverture | Item roadmap |
|---|---|---|
| `smoke.spec.js` | Reproduction complète (saillie → mise-bas → sevrage → lot) | 3.4-2 ✅ |
| `onboarding.spec.js` | Premier lapin sur état vierge | 3.4-1 (variante locale) ✅ |
| `xss-safety.spec.js` | Payload XSS dans nom/code reste inerte | 3.6 ✅ |
| `export-import.spec.js` | Export JSON → import → restauration | (utilitaire) |
| `genealogy3d.spec.js` | Rendu graphe généalogique | (utilitaire) |
| `health-overdue.spec.js`, `health-reminders.spec.js` | Rappels santé | (utilitaire) |
| `status-blocking.spec.js` | Blocage modal d'erreur | (utilitaire) |

## Specs en attente d'une instance Supabase de test

Ces specs ne peuvent pas tourner avec `?e2e=1` (mode local, pas d'auth cloud) :

| Spec | Pré-requis | Item roadmap |
|---|---|---|
| Auth complet (signup → création ferme cloud → premier lapin) | Projet Supabase de test + utilisateur jetable créé par hook beforeEach | 3.4-1 complet |
| Boutique : mise en vente → commande invité → fulfillment | Supabase test + RLS appliquée | 3.4-3 |
| Sync multi-onglets (mutation tab A → réception tab B) | Supabase test + realtime activé | 3.4-4 |
| Offline → reconnect → drain queue | Supabase test + interception réseau via `page.context().setOffline(true)` | 3.4-5 |

### Pour les activer

1. Créer un projet Supabase staging (`cuniworld-e2e`), appliquer toutes les migrations.
2. Créer un utilisateur jetable et stocker ses credentials dans des secrets de CI.
3. Ajouter dans `playwright.config.js` un `webServer.env` qui injecte `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` pointant vers cette instance.
4. Écrire les specs avec un `beforeEach` qui :
   - se connecte via l'UI (ou directement par `supabase.auth.signInWithPassword`),
   - nettoie les données de la ferme test (truncate via RPC dédié `e2e_reset_farm`).
5. Ajouter ces specs au pipeline CI sur PRs (pas sur tous les commits — trop lent).

Item roadmap à créer pour le faire : **3.4-bis « E2E Supabase »**.
