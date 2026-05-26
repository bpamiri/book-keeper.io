-- ============================================================
-- BookKeeper: Pricing Catalog + Backfill Orders (012)
-- Adds: cluster_book_pricing per-cluster default prices
-- Adds: book_orders.is_backfill flag for documentation-only orders
-- ============================================================

-- ------------------------------------------------------------
-- 1. cluster_book_pricing: per-cluster default prices
-- ------------------------------------------------------------

CREATE TABLE cluster_book_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  ruhi_book_id uuid NOT NULL REFERENCES ruhi_books(id),
  language book_language NOT NULL,
  default_cost numeric(10,2) NOT NULL CHECK (default_cost >= 0),
  default_sale_price numeric(10,2) NOT NULL CHECK (default_sale_price >= 0),
  notes text,
  updated_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cluster_id, ruhi_book_id, language)
);

-- (The UNIQUE constraint covers (cluster_id, ruhi_book_id, language) lookups,
-- so no separate index is needed.)

CREATE TRIGGER trg_cluster_book_pricing_updated_at
  BEFORE UPDATE ON cluster_book_pricing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 2. book_orders.is_backfill: documentation-only flag
-- ------------------------------------------------------------

ALTER TABLE book_orders
  ADD COLUMN is_backfill boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- 3. Enable RLS and define policies for cluster_book_pricing
-- ------------------------------------------------------------

ALTER TABLE cluster_book_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY cluster_book_pricing_select ON cluster_book_pricing
  FOR SELECT USING (is_platform_admin() OR is_cluster_member(cluster_id));

CREATE POLICY cluster_book_pricing_insert ON cluster_book_pricing
  FOR INSERT WITH CHECK (is_platform_admin() OR is_cluster_admin(cluster_id));

CREATE POLICY cluster_book_pricing_update ON cluster_book_pricing
  FOR UPDATE
  USING (is_platform_admin() OR is_cluster_admin(cluster_id))
  WITH CHECK (is_platform_admin() OR is_cluster_admin(cluster_id));

CREATE POLICY cluster_book_pricing_delete ON cluster_book_pricing
  FOR DELETE USING (is_platform_admin() OR is_cluster_admin(cluster_id));
