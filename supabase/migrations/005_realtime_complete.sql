-- =====================================================================
-- Migration 005 — Realtime publication & replica identity complets
-- ---------------------------------------------------------------------
-- Cette migration répare un gap accumulé dans 001 → 004 :
--
--   1. `used_names` n'a JAMAIS été ajoutée à `supabase_realtime` alors
--      que le client db.js l'écoute déjà (subscribeToFarm, table:
--      'used_names'). Conséquence : les noms réservés ne se propagent
--      pas entre appareils.
--
--   2. Migration 002 ajoutait 8 tables sync (buildings, lodges, stock_items,
--      …) en un seul `ALTER PUBLICATION … ADD TABLE …` SANS gestion
--      d'exception. Si une seule de ces 8 tables était déjà présente
--      (tentative antérieure, ré-exécution partielle), tout le batch
--      échoue par `duplicate_object` et plusieurs tables se retrouvent
--      OUT du realtime sans avertir l'utilisateur.
--
--   3. Migration 002 ne posait pas `replica identity full` sur ces 8
--      tables. Sans ça, les payloads UPDATE/DELETE realtime ne
--      transportent pas la ligne complète (`old`), ce qui peut casser
--      la logique `_applyChange` côté client (DELETE notamment).
--
-- Cette migration est entièrement idempotente : on peut la rejouer.
-- =====================================================================

-- ── 1. replica identity full sur toutes les tables sync ─────────────
-- Indispensable pour que DELETE/UPDATE portent la ligne complète.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'used_names',
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

-- ── 2. Ajout idempotent de chaque table à la publication ────────────
-- On boucle table par table avec gestion `duplicate_object` pour qu'un
-- doublon ne fasse pas planter les ajouts suivants.
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
        -- Déjà publiée, on continue.
        NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- ── 3. Diagnostic : afficher l'état final ───────────────────────────
-- À regarder dans l'onglet "Results" du SQL Editor pour confirmer.
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
ORDER BY tablename;
