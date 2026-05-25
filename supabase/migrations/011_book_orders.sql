-- ============================================================
-- BookKeeper: Book Orders Migration (011)
-- Adds: payer_institutions, book_orders, book_order_items
-- Adds: change_type='ordered', inventory_log.related_order_item_id
-- ============================================================

-- ------------------------------------------------------------
-- 1. New enums
-- ------------------------------------------------------------

CREATE TYPE payer_kind AS ENUM ('individual', 'institution');
CREATE TYPE reimbursement_status AS ENUM ('not_required', 'owed', 'partial', 'reimbursed');

-- Extend existing change_type enum.
-- Note: ALTER TYPE ADD VALUE works in a transaction but the new value
-- can't be USED until commit. We never insert change_type='ordered'
-- inside this migration, so this is safe.
ALTER TYPE change_type ADD VALUE 'ordered';

-- ------------------------------------------------------------
-- 2. payer_institutions: per-cluster list of institutional payers
-- ------------------------------------------------------------

CREATE TABLE payer_institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cluster_id, name)
);

CREATE TRIGGER trg_payer_institutions_updated_at
  BEFORE UPDATE ON payer_institutions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 3. book_orders: header (financial + payer info)
-- ------------------------------------------------------------

CREATE TABLE book_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier text,
  notes text,
  payer_kind payer_kind NOT NULL,
  paid_by_user_id uuid REFERENCES profiles(id),
  paid_by_institution_id uuid REFERENCES payer_institutions(id),
  reimbursement_status reimbursement_status NOT NULL,
  reimbursed_amount numeric(10,2) NOT NULL DEFAULT 0,
  reimbursed_at timestamptz,
  reimbursed_by uuid REFERENCES profiles(id),
  reimbursement_notes text,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (payer_kind = 'individual' AND paid_by_user_id IS NOT NULL AND paid_by_institution_id IS NULL)
    OR
    (payer_kind = 'institution' AND paid_by_institution_id IS NOT NULL AND paid_by_user_id IS NULL)
  )
);

CREATE INDEX idx_book_orders_cluster_id ON book_orders(cluster_id);
CREATE INDEX idx_book_orders_paid_by_user_id ON book_orders(paid_by_user_id)
  WHERE paid_by_user_id IS NOT NULL;
CREATE INDEX idx_book_orders_paid_by_institution_id ON book_orders(paid_by_institution_id)
  WHERE paid_by_institution_id IS NOT NULL;
CREATE INDEX idx_book_orders_reimbursement_status ON book_orders(reimbursement_status);
CREATE INDEX idx_book_orders_order_date ON book_orders(order_date);

CREATE TRIGGER trg_book_orders_updated_at
  BEFORE UPDATE ON book_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 4. book_order_items: line items
-- ------------------------------------------------------------

CREATE TABLE book_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES book_orders(id) ON DELETE CASCADE,
  ruhi_book_id uuid NOT NULL REFERENCES ruhi_books(id),
  language book_language NOT NULL,
  publication_status publication_status NOT NULL,
  storage_location_id uuid NOT NULL REFERENCES storage_locations(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(10,2) NOT NULL CHECK (unit_cost >= 0),
  unit_sale_price numeric(10,2) NOT NULL CHECK (unit_sale_price >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_book_order_items_order_id ON book_order_items(order_id);
CREATE INDEX idx_book_order_items_ruhi_book_id ON book_order_items(ruhi_book_id);
CREATE INDEX idx_book_order_items_storage_location_id ON book_order_items(storage_location_id);

-- ------------------------------------------------------------
-- 5. inventory_log: provenance link back to the order
-- ------------------------------------------------------------

ALTER TABLE inventory_log
  ADD COLUMN related_order_item_id uuid REFERENCES book_order_items(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 6. Trigger: seed default payer institutions for new clusters
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION seed_default_payer_institutions()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO payer_institutions (cluster_id, name, sort_order, created_by) VALUES
    (NEW.id, 'Area Teaching Committee', 1, NEW.created_by),
    (NEW.id, 'Local Spiritual Assembly', 2, NEW.created_by),
    (NEW.id, 'Regional Council', 3, NEW.created_by),
    (NEW.id, 'National Fund', 4, NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_seed_payer_institutions
  AFTER INSERT ON clusters
  FOR EACH ROW EXECUTE FUNCTION seed_default_payer_institutions();

-- ------------------------------------------------------------
-- 7. Backfill: defaults for all existing clusters
-- ------------------------------------------------------------

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT id, created_by FROM clusters LOOP
    INSERT INTO payer_institutions (cluster_id, name, sort_order, created_by) VALUES
      (c.id, 'Area Teaching Committee', 1, c.created_by),
      (c.id, 'Local Spiritual Assembly', 2, c.created_by),
      (c.id, 'Regional Council', 3, c.created_by),
      (c.id, 'National Fund', 4, c.created_by)
    ON CONFLICT (cluster_id, name) DO NOTHING;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 8. Enable RLS
-- ------------------------------------------------------------

ALTER TABLE payer_institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_order_items ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 9. RLS Policies
-- ------------------------------------------------------------

-- payer_institutions
CREATE POLICY payer_institutions_select ON payer_institutions
  FOR SELECT USING (is_platform_admin() OR is_cluster_member(cluster_id));

CREATE POLICY payer_institutions_insert ON payer_institutions
  FOR INSERT WITH CHECK (is_platform_admin() OR is_cluster_admin(cluster_id));

CREATE POLICY payer_institutions_update ON payer_institutions
  FOR UPDATE
  USING (is_platform_admin() OR is_cluster_admin(cluster_id))
  WITH CHECK (is_platform_admin() OR is_cluster_admin(cluster_id));

CREATE POLICY payer_institutions_delete ON payer_institutions
  FOR DELETE USING (is_platform_admin() OR is_cluster_admin(cluster_id));

-- book_orders
CREATE POLICY book_orders_select ON book_orders
  FOR SELECT USING (is_platform_admin() OR is_cluster_member(cluster_id));

CREATE POLICY book_orders_insert ON book_orders
  FOR INSERT WITH CHECK (is_platform_admin() OR is_cluster_admin(cluster_id));

CREATE POLICY book_orders_update ON book_orders
  FOR UPDATE
  USING (is_platform_admin() OR is_cluster_admin(cluster_id))
  WITH CHECK (is_platform_admin() OR is_cluster_admin(cluster_id));

CREATE POLICY book_orders_delete ON book_orders
  FOR DELETE USING (is_platform_admin());

-- book_order_items (join through book_orders)
CREATE POLICY book_order_items_select ON book_order_items
  FOR SELECT USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM book_orders bo
      WHERE bo.id = book_order_items.order_id
        AND is_cluster_member(bo.cluster_id)
    )
  );

CREATE POLICY book_order_items_insert ON book_order_items
  FOR INSERT WITH CHECK (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM book_orders bo
      WHERE bo.id = book_order_items.order_id
        AND is_cluster_admin(bo.cluster_id)
    )
  );

CREATE POLICY book_order_items_update ON book_order_items
  FOR UPDATE
  USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM book_orders bo
      WHERE bo.id = book_order_items.order_id
        AND is_cluster_admin(bo.cluster_id)
    )
  )
  WITH CHECK (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM book_orders bo
      WHERE bo.id = book_order_items.order_id
        AND is_cluster_admin(bo.cluster_id)
    )
  );

CREATE POLICY book_order_items_delete ON book_order_items
  FOR DELETE USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM book_orders bo
      WHERE bo.id = book_order_items.order_id
        AND is_cluster_admin(bo.cluster_id)
    )
  );
