-- Migration 010 : Accès anonyme aux images des lapins en vente (boutique)
--
-- PROBLÈME corrigé :
--   Migration 003 a créé le bucket `photos` en PRIVÉ avec une policy de
--   lecture réservée aux membres de la ferme (photos_select_member).
--   La boutique publique (Phase 2 / migration 009) est consultée par des
--   visiteurs ANONYMES : la migration 009 a bien ouvert la table `photos`
--   (les métadonnées) à anon, mais PAS `storage.objects` (les octets de
--   l'image). Conséquence : aucune photo ne s'affiche dans la boutique.
--
-- SOLUTION :
--   Ajouter une policy SELECT sur storage.objects autorisant anon (et
--   authenticated) à lire les images du bucket `photos` UNIQUEMENT pour
--   les lapins explicitement marqués forSale=true.
--
--   Convention de chemin (src/photoCloudStorage.js) :
--     farms/{farmId}/rabbits/{rabbitId}/{photoId}.jpg
--   → split_part(name, '/', 4) = rabbitId
--
-- Idempotente : peut être rejouée sans risque.

drop policy if exists "photos_select_public_shop" on storage.objects;
create policy "photos_select_public_shop" on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'photos'
    and split_part(name, '/', 1) = 'farms'
    and split_part(name, '/', 3) = 'rabbits'
    and exists (
      select 1 from public.rabbits r
      where r.id = split_part(name, '/', 4)
        and (r.data->>'forSale')::boolean is true
    )
  );

-- Note : la policy "photos_select_member" (migration 003) reste en place.
-- Les deux policies SELECT sont en OR — un membre garde l'accès complet à
-- toutes les photos de sa ferme, un visiteur anonyme n'accède qu'aux photos
-- des lapins en vente. Aucune fuite des photos non mises en vente.
