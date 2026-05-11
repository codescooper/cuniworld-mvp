-- Migration 002 : synchronisation cloud des modules stock, bâtiments, tournées, lots
-- À exécuter dans le SQL Editor de Supabase (projet → SQL Editor → New query).
--
-- Prérequis : les tables `farms` et `farm_members` doivent exister.
-- Politique RLS supposée : "peut accéder si farm_id ∈ (farm_members WHERE user_id = auth.uid())".
-- Adapter si votre schéma de permission est différent.

-- ── stock_items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_items (
  id         TEXT        PRIMARY KEY,
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_items_farm_member ON stock_items;
CREATE POLICY stock_items_farm_member ON stock_items
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── stock_movements ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id         TEXT        PRIMARY KEY,
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_movements_farm_member ON stock_movements;
CREATE POLICY stock_movements_farm_member ON stock_movements
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── rounds ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rounds (
  id         TEXT        PRIMARY KEY,
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rounds_farm_member ON rounds;
CREATE POLICY rounds_farm_member ON rounds
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── buildings ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buildings (
  id         TEXT        PRIMARY KEY,
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buildings_farm_member ON buildings;
CREATE POLICY buildings_farm_member ON buildings
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── lodges ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lodges (
  id         TEXT        PRIMARY KEY,
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE lodges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lodges_farm_member ON lodges;
CREATE POLICY lodges_farm_member ON lodges
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── lodge_defects ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lodge_defects (
  id         TEXT        PRIMARY KEY,
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE lodge_defects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lodge_defects_farm_member ON lodge_defects;
CREATE POLICY lodge_defects_farm_member ON lodge_defects
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── lodge_events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lodge_events (
  id         TEXT        PRIMARY KEY,
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE lodge_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lodge_events_farm_member ON lodge_events;
CREATE POLICY lodge_events_farm_member ON lodge_events
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── lot_statuses ──────────────────────────────────────────────────────────────
-- Clé composée (farm_id, lot_id) : un statut par lot par ferme.
CREATE TABLE IF NOT EXISTS lot_statuses (
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  lot_id     TEXT        NOT NULL,
  status     TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (farm_id, lot_id)
);
ALTER TABLE lot_statuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lot_statuses_farm_member ON lot_statuses;
CREATE POLICY lot_statuses_farm_member ON lot_statuses
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Ajouter les 8 nouvelles tables à la publication realtime.
-- Si votre publication utilise FOR ALL TABLES, ces lignes ne sont pas nécessaires.
-- Si elle n'existe pas encore : CREATE PUBLICATION supabase_realtime;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE
      stock_items, stock_movements, rounds,
      buildings, lodges, lodge_defects, lodge_events,
      lot_statuses;
  END IF;
END $$;
