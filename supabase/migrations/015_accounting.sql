-- Migration 015 : synchronisation cloud du module Comptabilité (journal de trésorerie)
-- À exécuter dans le SQL Editor de Supabase (projet → SQL Editor → New query).
--
-- Prérequis : tables `farms` et `farm_members` (cf. 001) + politique RLS membre
-- de ferme (cf. 012). Pattern repris à l'identique des tables `stock_*`.

-- ── transactions (recettes/dépenses manuelles unifiées) ─────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id         TEXT        PRIMARY KEY,
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transactions_farm_member ON transactions;
CREATE POLICY transactions_farm_member ON transactions
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── recurring_charges (charges/recettes récurrentes) ────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_charges (
  id         TEXT        PRIMARY KEY,
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE recurring_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recurring_charges_farm_member ON recurring_charges;
CREATE POLICY recurring_charges_farm_member ON recurring_charges
  FOR ALL USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid()));

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Ajout idempotent table par table à la publication realtime (cf. 012).
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOR t IN
      SELECT unnest(ARRAY['transactions', 'recurring_charges'])
    LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN duplicate_object THEN
        NULL;  -- déjà publiée
      END;
    END LOOP;
  END IF;
END $$;
