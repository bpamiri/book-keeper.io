-- ============================================================
-- BookKeeper: Initial Database Schema Migration
-- ============================================================

-- ------------------------------------------------------------
-- 1. Custom Enum Types
-- ------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('platform_admin', 'user');
CREATE TYPE cluster_role AS ENUM ('admin', 'collaborator');
CREATE TYPE member_status AS ENUM ('pending', 'active');
CREATE TYPE book_category AS ENUM ('main_sequence', 'branch_book3', 'branch_book5');
CREATE TYPE publication_status AS ENUM ('published', 'pre_publication', 'in_development');
CREATE TYPE change_type AS ENUM ('added', 'removed', 'transferred', 'adjustment', 'fulfilled');
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'fulfilled', 'denied');

-- ------------------------------------------------------------
-- 2. Tables
-- ------------------------------------------------------------

-- profiles: extends auth.users with app-specific data
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name text,
  email text,
  role user_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- clusters: geographic Baha'i clusters
CREATE TABLE clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  region text,
  description text,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- cluster_members: maps users to clusters with roles
CREATE TABLE cluster_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  email text NOT NULL,
  cluster_role cluster_role NOT NULL,
  status member_status NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL REFERENCES profiles(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz
);

-- storage_locations: physical locations where books are stored
CREATE TABLE storage_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ruhi_books: master catalog of Ruhi Institute books
CREATE TABLE ruhi_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  book_number integer,
  category book_category NOT NULL,
  publication_status publication_status NOT NULL,
  unit text,
  language text NOT NULL DEFAULT 'English',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- inventory: book quantities at storage locations
CREATE TABLE inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  storage_location_id uuid NOT NULL REFERENCES storage_locations(id) ON DELETE CASCADE,
  ruhi_book_id uuid NOT NULL REFERENCES ruhi_books(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  notes text,
  updated_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_location_id, ruhi_book_id)
);

-- book_requests: tutors/collaborators request books
CREATE TABLE book_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  ruhi_book_id uuid NOT NULL REFERENCES ruhi_books(id) ON DELETE CASCADE,
  quantity_requested integer NOT NULL CHECK (quantity_requested > 0),
  requested_by uuid NOT NULL REFERENCES profiles(id),
  purpose text,
  status request_status NOT NULL DEFAULT 'pending',
  fulfilled_by uuid REFERENCES profiles(id),
  fulfilled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- request_fulfillments: tracks which locations contributed to fulfilling a request
CREATE TABLE request_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES book_requests(id) ON DELETE CASCADE,
  storage_location_id uuid NOT NULL REFERENCES storage_locations(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  fulfilled_by uuid NOT NULL REFERENCES profiles(id),
  fulfilled_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

-- inventory_log: audit trail for inventory changes
CREATE TABLE inventory_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  storage_location_id uuid NOT NULL REFERENCES storage_locations(id) ON DELETE CASCADE,
  ruhi_book_id uuid NOT NULL REFERENCES ruhi_books(id) ON DELETE CASCADE,
  change_type change_type NOT NULL,
  quantity_change integer NOT NULL,
  previous_quantity integer NOT NULL,
  new_quantity integer NOT NULL,
  related_request_id uuid REFERENCES book_requests(id) ON DELETE SET NULL,
  related_fulfillment_id uuid REFERENCES request_fulfillments(id) ON DELETE SET NULL,
  notes text,
  performed_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. Indexes
-- ------------------------------------------------------------

CREATE INDEX idx_clusters_created_by ON clusters(created_by);
CREATE INDEX idx_cluster_members_cluster_id ON cluster_members(cluster_id);
CREATE INDEX idx_cluster_members_user_id ON cluster_members(user_id);
CREATE INDEX idx_cluster_members_email ON cluster_members(email);
CREATE INDEX idx_storage_locations_cluster_id ON storage_locations(cluster_id);
CREATE INDEX idx_inventory_cluster_book_location ON inventory(cluster_id, ruhi_book_id, storage_location_id);
CREATE INDEX idx_inventory_storage_location ON inventory(storage_location_id);
CREATE INDEX idx_inventory_ruhi_book ON inventory(ruhi_book_id);
CREATE INDEX idx_book_requests_cluster_id ON book_requests(cluster_id);
CREATE INDEX idx_book_requests_status ON book_requests(status);
CREATE INDEX idx_request_fulfillments_request_id ON request_fulfillments(request_id);
CREATE INDEX idx_inventory_log_cluster_id ON inventory_log(cluster_id);
CREATE INDEX idx_inventory_log_created_at ON inventory_log(created_at);
CREATE INDEX idx_ruhi_books_category ON ruhi_books(category);
CREATE INDEX idx_ruhi_books_sort_order ON ruhi_books(sort_order);

-- ------------------------------------------------------------
-- 4. Triggers: auto-update updated_at
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_clusters_updated_at
  BEFORE UPDATE ON clusters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_storage_locations_updated_at
  BEFORE UPDATE ON storage_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ruhi_books_updated_at
  BEFORE UPDATE ON ruhi_books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_book_requests_updated_at
  BEFORE UPDATE ON book_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 5. Trigger: auto-create profile on auth.users insert
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ------------------------------------------------------------
-- 6. Trigger: inventory_log on inventory changes
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_inventory_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO inventory_log (
      cluster_id, storage_location_id, ruhi_book_id,
      change_type, quantity_change, previous_quantity, new_quantity,
      performed_by, notes
    ) VALUES (
      NEW.cluster_id, NEW.storage_location_id, NEW.ruhi_book_id,
      'added', NEW.quantity, 0, NEW.quantity,
      NEW.updated_by, 'Initial inventory entry'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.quantity IS DISTINCT FROM NEW.quantity THEN
    INSERT INTO inventory_log (
      cluster_id, storage_location_id, ruhi_book_id,
      change_type, quantity_change, previous_quantity, new_quantity,
      performed_by, notes
    ) VALUES (
      NEW.cluster_id, NEW.storage_location_id, NEW.ruhi_book_id,
      'adjustment', NEW.quantity - OLD.quantity, OLD.quantity, NEW.quantity,
      NEW.updated_by, NEW.notes
    );
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_inventory_log
  AFTER INSERT OR UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION log_inventory_change();

-- ------------------------------------------------------------
-- 7. Trigger: auto-fulfill request when fulfillments sum matches
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_request_fulfillment()
RETURNS TRIGGER AS $$
DECLARE
  total_fulfilled integer;
  req_quantity integer;
BEGIN
  SELECT COALESCE(SUM(rf.quantity), 0) INTO total_fulfilled
  FROM request_fulfillments rf
  WHERE rf.request_id = NEW.request_id;

  SELECT br.quantity_requested INTO req_quantity
  FROM book_requests br
  WHERE br.id = NEW.request_id;

  IF total_fulfilled >= req_quantity THEN
    UPDATE book_requests
    SET status = 'fulfilled',
        fulfilled_by = NEW.fulfilled_by,
        fulfilled_at = now()
    WHERE id = NEW.request_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_request_fulfillment
  AFTER INSERT ON request_fulfillments
  FOR EACH ROW EXECUTE FUNCTION check_request_fulfillment();

-- ------------------------------------------------------------
-- 8. RLS Helper Functions
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'platform_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_cluster_member(p_cluster_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM cluster_members
    WHERE cluster_id = p_cluster_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_cluster_admin(p_cluster_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM cluster_members
    WHERE cluster_id = p_cluster_id
      AND user_id = auth.uid()
      AND cluster_role = 'admin'
      AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 9. Enable RLS on All Tables
-- ------------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ruhi_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_log ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 10. RLS Policies
-- ------------------------------------------------------------

-- profiles
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT USING (id = auth.uid() OR is_platform_admin());

CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- clusters
CREATE POLICY clusters_select ON clusters
  FOR SELECT USING (is_platform_admin() OR is_cluster_member(id));

CREATE POLICY clusters_insert ON clusters
  FOR INSERT WITH CHECK (is_platform_admin());

CREATE POLICY clusters_update ON clusters
  FOR UPDATE USING (is_platform_admin() OR is_cluster_admin(id));

CREATE POLICY clusters_delete ON clusters
  FOR DELETE USING (is_platform_admin());

-- cluster_members
CREATE POLICY cluster_members_select ON cluster_members
  FOR SELECT USING (is_platform_admin() OR is_cluster_member(cluster_id));

CREATE POLICY cluster_members_insert ON cluster_members
  FOR INSERT WITH CHECK (is_platform_admin() OR is_cluster_admin(cluster_id));

CREATE POLICY cluster_members_update ON cluster_members
  FOR UPDATE USING (is_platform_admin() OR is_cluster_admin(cluster_id));

CREATE POLICY cluster_members_delete ON cluster_members
  FOR DELETE USING (is_platform_admin() OR is_cluster_admin(cluster_id));

-- storage_locations
CREATE POLICY storage_locations_select ON storage_locations
  FOR SELECT USING (is_platform_admin() OR is_cluster_member(cluster_id));

CREATE POLICY storage_locations_insert ON storage_locations
  FOR INSERT WITH CHECK (is_platform_admin() OR is_cluster_member(cluster_id));

CREATE POLICY storage_locations_update ON storage_locations
  FOR UPDATE USING (is_platform_admin() OR is_cluster_member(cluster_id));

-- ruhi_books
CREATE POLICY ruhi_books_select ON ruhi_books
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY ruhi_books_insert ON ruhi_books
  FOR INSERT WITH CHECK (is_platform_admin());

CREATE POLICY ruhi_books_update ON ruhi_books
  FOR UPDATE USING (is_platform_admin());

CREATE POLICY ruhi_books_delete ON ruhi_books
  FOR DELETE USING (is_platform_admin());

-- inventory
CREATE POLICY inventory_select ON inventory
  FOR SELECT USING (is_platform_admin() OR is_cluster_member(cluster_id));

CREATE POLICY inventory_insert ON inventory
  FOR INSERT WITH CHECK (is_platform_admin() OR is_cluster_member(cluster_id));

CREATE POLICY inventory_update ON inventory
  FOR UPDATE USING (is_platform_admin() OR is_cluster_member(cluster_id));

-- book_requests
CREATE POLICY book_requests_select ON book_requests
  FOR SELECT USING (is_platform_admin() OR is_cluster_member(cluster_id));

CREATE POLICY book_requests_insert ON book_requests
  FOR INSERT WITH CHECK (is_platform_admin() OR is_cluster_member(cluster_id));

CREATE POLICY book_requests_update ON book_requests
  FOR UPDATE USING (is_platform_admin() OR is_cluster_admin(cluster_id));

-- request_fulfillments: join to book_requests for cluster_id
CREATE POLICY request_fulfillments_select ON request_fulfillments
  FOR SELECT USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM book_requests br
      WHERE br.id = request_fulfillments.request_id
        AND is_cluster_member(br.cluster_id)
    )
  );

CREATE POLICY request_fulfillments_insert ON request_fulfillments
  FOR INSERT WITH CHECK (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM book_requests br
      WHERE br.id = request_fulfillments.request_id
        AND is_cluster_admin(br.cluster_id)
    )
  );

-- inventory_log: read-only for cluster members
CREATE POLICY inventory_log_select ON inventory_log
  FOR SELECT USING (is_platform_admin() OR is_cluster_member(cluster_id));
