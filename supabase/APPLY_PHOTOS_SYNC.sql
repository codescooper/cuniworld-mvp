-- =====================================================================
-- APPLY_PHOTOS_SYNC.sql — Socle complet de synchronisation des photos
-- entre appareils (Storage + RLS + Realtime).
-- ---------------------------------------------------------------------
-- À COLLER d'un seul bloc dans : Supabase Dashboard → SQL Editor → Run.
--
-- Consolide et rejoue, de façon ENTIÈREMENT IDEMPOTENTE :
--   003_storage_photos_policies  — bucket `photos` + policies storage.objects
--   013_photos_bucket_access     — policy de lecture sur storage.buckets
--   004 / 005_realtime_*         — publication realtime + replica identity
--
-- Pourquoi c'est nécessaire pour le multi-appareils :
--   • Sans la policy storage.buckets (013) → download()/createSignedUrl()
--     échouent avec « Bucket not found » → photos invisibles partout.
--   • Sans les policies storage.objects (003) → upload/download refusés (RLS).
--   • Sans la publication realtime (004/005) → les photos n'arrivent sur les
--     autres appareils qu'après un rechargement complet.
--
-- Le bloc final (section 4) affiche l'état pour confirmer que tout est posé.
-- =====================================================================


-- =====================================================================
-- 1. BUCKET `photos` + POLICIES sur storage.objects   (ex-migration 003)
-- =====================================================================

-- Bucket privé (idempotent).
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Helper : l'utilisateur courant est-il membre de la ferme déduite du chemin ?
-- Convention de chemin (src/photoCloudStorage.js) :
--   farms/{farmId}/rabbits/{rabbitId}/{photoId}.jpg
create or replace function public.is_farm_member_for_storage(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.farm_members fm
    where fm.user_id = auth.uid()
      and fm.farm_id::text = split_part(object_name, '/', 2)
  );
$$;

drop policy if exists "photos_select_member" on storage.objects;
drop policy if exists "photos_insert_member" on storage.objects;
drop policy if exists "photos_update_member" on storage.objects;
drop policy if exists "photos_delete_member" on storage.objects;

-- READ : seuls les membres de la ferme accèdent aux signed URL / download.
create policy "photos_select_member" on storage.objects
  for select
  using (
    bucket_id = 'photos'
    and public.is_farm_member_for_storage(name)
  );

-- WRITE (upload / upsert).
create policy "photos_insert_member" on storage.objects
  for insert
  with check (
    bucket_id = 'photos'
    and public.is_farm_member_for_storage(name)
    and split_part(name, '/', 1) = 'farms'
  );

-- UPDATE (storage.upload avec upsert:true émet un UPDATE).
create policy "photos_update_member" on storage.objects
  for update
  using (
    bucket_id = 'photos'
    and public.is_farm_member_for_storage(name)
  )
  with check (
    bucket_id = 'photos'
    and public.is_farm_member_for_storage(name)
  );

-- DELETE : membres uniquement.
create policy "photos_delete_member" on storage.objects
  for delete
  using (
    bucket_id = 'photos'
    and public.is_farm_member_for_storage(name)
  );


-- =====================================================================
-- 2. POLICY DE LECTURE sur storage.buckets            (ex-migration 013)
-- ---------------------------------------------------------------------
-- Maillon manquant : sans une policy SELECT sur la LIGNE du bucket, l'API
-- Storage répond « Bucket not found » même si les objets sont autorisés.
-- Ouvrir la ligne bucket n'expose aucune photo de plus (les objets restent
-- protégés par les policies de la section 1).
-- =====================================================================

drop policy if exists "photos_bucket_read" on storage.buckets;
create policy "photos_bucket_read" on storage.buckets
  for select
  to anon, authenticated
  using (id = 'photos');


-- =====================================================================
-- 3. REALTIME : publication + replica identity        (ex-migrations 004/005)
-- ---------------------------------------------------------------------
-- Sans ça, les INSERT/UPDATE/DELETE de la table `photos` (et des autres
-- tables sync) n'arrivent pas en direct sur les autres appareils.
-- `replica identity full` est requis pour que les payloads UPDATE/DELETE
-- transportent la ligne complète (logique _applyChange côté client).
-- =====================================================================

-- 3a. replica identity full sur photos + toutes les tables sync.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'rabbits', 'events', 'photos', 'used_names',
      'stock_items', 'stock_movements', 'rounds',
      'buildings', 'lodges', 'lodge_defects', 'lodge_events',
      'lot_statuses'
    ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;

-- 3b. Ajout idempotent de chaque table à la publication supabase_realtime.
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publication supabase_realtime absente — Realtime non activé sur ce projet ?';
    RETURN;
  END IF;

  FOR t IN
    SELECT unnest(ARRAY[
      'rabbits', 'events', 'photos', 'used_names',
      'buildings', 'lodges', 'lodge_defects', 'lodge_events',
      'stock_items', 'stock_movements', 'rounds',
      'lot_statuses'
    ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN duplicate_object THEN
        NULL; -- déjà publiée, on continue
      END;
    END IF;
  END LOOP;
END $$;


-- =====================================================================
-- 4. DIAGNOSTIC — à regarder dans l'onglet « Results » après exécution
-- =====================================================================

-- 4a. Le bucket `photos` existe-t-il ? (doit renvoyer 1 ligne, public = false)
select 'bucket' as check, id, public::text as detail
from storage.buckets
where id = 'photos';

-- 4b. Policies Storage posées ? (attendu : 4 sur objects + 1 sur buckets)
select 'storage_policy' as check, policyname as id, tablename as detail
from pg_policies
where schemaname = 'storage'
  and policyname in (
    'photos_select_member','photos_insert_member','photos_update_member',
    'photos_delete_member','photos_bucket_read'
  )
order by policyname;

-- 4c. Tables présentes dans la publication realtime
--     (doit contenir au moins : rabbits, events, photos, used_names).
select 'realtime_table' as check, tablename as id, '' as detail
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
