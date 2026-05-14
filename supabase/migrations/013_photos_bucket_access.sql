-- Migration 013 : Accès au bucket `photos` au niveau storage.buckets
--
-- PROBLÈME (rapport QA bug #2) :
--   Le bucket `photos` est privé. La migration 003 a posé des policies sur
--   `storage.objects` (lecture/écriture pour les membres), et la 010 a ouvert
--   `storage.objects` en lecture aux anonymes pour les lapins en vente.
--   MAIS aucune policy n'a jamais été posée sur `storage.buckets` lui-même :
--   ni les membres ni les visiteurs anonymes ne peuvent "voir" la ligne du
--   bucket. Conséquence : `download()` / `createSignedUrl()` échouent avec
--   "Bucket not found", les photos ne se chargent pas (ni en cloud, ni dans
--   la boutique publique).
--
-- SOLUTION :
--   Autoriser la LECTURE de la ligne du bucket `photos` à `anon` et
--   `authenticated`. Les objets eux-mêmes restent protégés par les policies
--   existantes sur `storage.objects` (003 = membres, 010 = anon pour les
--   lapins forSale uniquement). Ouvrir la ligne bucket n'expose donc aucune
--   photo supplémentaire — c'est juste le maillon manquant pour que l'API
--   Storage accepte de servir les objets déjà autorisés.
--
-- Idempotente.

drop policy if exists "photos_bucket_read" on storage.buckets;
create policy "photos_bucket_read" on storage.buckets
  for select
  to anon, authenticated
  using (id = 'photos');
