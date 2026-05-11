# Protocole de test manuel — photos multi-appareils

But : valider que le bug « les photos ajoutées sur l'appareil A ne s'affichent
pas sur l'appareil B » est réellement corrigé, et qu'aucune régression n'est
introduite par la suite. Le bug doit être considéré comme **résolu uniquement
si l'ensemble des 12 étapes ci-dessous passent**.

---

## 0. Pré-requis Supabase (à exécuter UNE FOIS sur le projet cible)

Toutes les migrations du dossier `supabase/migrations/` doivent être appliquées :

| Migration | Rôle |
|---|---|
| `001_initial_schema.sql` | Tables `farms`, `farm_members`, `rabbits`, `events`, `photos`, RLS de base |
| `002_sync_modules.sql` | Tables sync (stock/buildings/…) + realtime |
| `003_storage_photos_policies.sql` | Bucket `photos` privé + policies RLS storage |
| `004_realtime_photos.sql` | **AJOUTE `photos` à la publication realtime** (manquait dans 001) |

Vérifier dans le dashboard Supabase :

1. **Database → Replication** : `supabase_realtime` contient bien `photos`.
2. **Storage → Buckets** : `photos` existe, **Public = false**.
3. **Storage → Policies** : 4 policies sur `storage.objects` pour le bucket `photos`
   (select, insert, update, delete) référençant `is_farm_member_for_storage`.

Sans ces 4 conditions, le test échouera. Aucun nombre de patches frontend ne
remplacera une migration SQL absente.

---

## 1. Activer les logs photo

Sur **chaque appareil** (avant de lancer le test) :

```js
// dans la console DevTools
localStorage.setItem('cuniworld.debug.photos', '1')
// puis recharger la page
```

ou ouvrir l'app avec `?debug=photos` dans l'URL.

Les logs apparaissent dans la console sous la forme `[photo:<event>] {…}`.

---

## 2. Protocole A/B (12 étapes)

| # | Appareil | Action | Vérification |
|---|---|---|---|
| 1 | A | Se connecter à la ferme F1. Aller sur un lapin. Cliquer « + Photo ». | Console A : `[photo:local.saved]` |
| 2 | A | Capturer/sélectionner une image. | Console A : `[photo:upload.success]` puis `[photo:db.upsert.success]`. La photo s'affiche dans la fiche du lapin. |
| 3 | B | Se connecter à la **même** ferme F1 sur un autre appareil/navigateur. | Console B : `[photo:realtime.subscribe.status {status:"SUBSCRIBED"}]` |
| 4 | A | Ajouter une 2ᵉ photo au même lapin (B est ouvert sur la même fiche). | Console B (dans la seconde) : `[photo:realtime.received]` avec `storagePath` non null, puis `[photo:hydrate.storage.success]`. **La photo apparaît sans recharger.** |
| 5 | B | Recharger la page. | Console B : `[photo:loadFarmState.photos {count: N}]` puis `[photo:hydrate.local.hit]` ou `[photo:hydrate.storage.success]` selon le cache IndexedDB. Les photos restent visibles. |
| 6 | A | Couper le réseau (DevTools → Network → Offline). | (rien à vérifier ici) |
| 7 | A | Ajouter une 3ᵉ photo. | Console A : `[photo:local.saved]`, puis `[photo:upload.failed]`. La photo s'affiche tout de même localement (offline-first). Le badge sync affiche « N en attente ». |
| 8 | A | Réactiver le réseau. | Console A : `[photo:upload.success]` puis `[photo:db.upsert.success]`. |
| 9 | B | Sans recharger. | Console B : `[photo:realtime.received]` puis `[photo:hydrate.storage.success]`. La photo apparaît. |
| 10 | A | Supprimer une photo (croix sur la grille). | Console B : `[photo:realtime.received {event:"DELETE"}]`. La photo disparaît immédiatement de la fiche sur B. |
| 11 | A & B | Fermer les deux onglets, attendre 1 minute, rouvrir B. | La photo restante est bien là. Console B : `[photo:loadFarmState.photos {count: …}]` cohérent. |
| 12 | B | Vider l'IndexedDB (`Application → IndexedDB → cuniworld_mvp_photos → Clear`). Recharger. | Console B : `[photo:hydrate.storage.success]` pour chaque photo. Tout s'affiche encore (preuve que Storage est l'authoritative source pour B). |

---

## 3. Échec attendu et diagnostic

| Log absent / inattendu | Cause probable | Correctif |
|---|---|---|
| `realtime.subscribe.status` ne reporte jamais `SUBSCRIBED` | Realtime désactivé sur le projet OU clé API publique invalide | Activer dans le dashboard Supabase ; vérifier `VITE_SUPABASE_ANON_KEY` |
| Étape 4 : `realtime.received` ne survient JAMAIS | **Cause classique** : `photos` non publié en realtime (bug d'origine) | Exécuter `004_realtime_photos.sql` |
| `realtime.received` arrive mais `storagePath` est `null` dans le payload | Le client a poussé une ligne SQL avant l'upload Storage | Vérifier que `addPhoto` n'enqueue pas de mutation SQL séparée en mode offline (voir `_uploadAndSyncPhoto` dans `src/actions.js`) |
| `hydrate.storage.error: {error: "new row violates row-level security…"}` | Policies Storage absentes/incorrectes | Exécuter `003_storage_photos_policies.sql` ; vérifier que `is_farm_member_for_storage(name)` retourne `true` pour l'utilisateur connecté |
| `hydrate.storage.error: {error: "Object not found"}` | L'objet n'existe pas dans le bucket (upload a échoué) | Vérifier dans Storage → bucket `photos` que le chemin `farms/{farmId}/rabbits/{rabbitId}/{photoId}.jpg` est présent |
| `hydrate.failed` répété | Storage joignable mais bucket privé sans signed URL | Vérifier policy SELECT du bucket |

---

## 4. Désactiver les logs après validation

```js
localStorage.removeItem('cuniworld.debug.photos')
```

Quand le test est validé, ouvrir une issue/PR pour retirer le module
`src/photoDebug.js` et tous ses appels.

---

## 5. Critère d'acceptation

Le bug est **résolu** uniquement quand :

- ✅ Étapes 1-12 passent toutes ;
- ✅ Aucun log `[photo:hydrate.failed]` n'est observé pendant le test ;
- ✅ Aucun `[photo:realtime.received]` ne porte un `storagePath: null` ;
- ✅ Deux refresh successifs sur B (étapes 5 et 11) gardent les mêmes photos.

Tant qu'une seule de ces conditions n'est pas remplie, le bug reste ouvert.
