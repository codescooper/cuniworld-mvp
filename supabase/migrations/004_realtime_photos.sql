-- =====================================================================
-- Realtime publication for public.photos
-- ---------------------------------------------------------------------
-- The initial schema (001) added `rabbits` and `events` to
-- `supabase_realtime` but forgot the `photos` table. Without this, photo
-- INSERT/UPDATE/DELETE events never reach other devices — photos appear
-- only after a full page reload (via DB.loadFarmState).
--
-- `replica identity full` ensures DELETE and UPDATE payloads carry the
-- complete `old` row (needed for the client-side _applyChange logic).
-- =====================================================================

alter table public.photos replica identity full;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Idempotent: silently no-op if the table is already in the publication.
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.photos;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
