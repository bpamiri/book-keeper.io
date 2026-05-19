-- ============================================================
-- Inventory: allow deletes by platform admins and cluster admins
-- ============================================================
-- The initial schema only granted INSERT/UPDATE on inventory rows.
-- Full CRUD requires a DELETE policy. Deletion is restricted to
-- platform admins and cluster admins of the owning cluster, since
-- it removes an entire stock record (not just a quantity change).

CREATE POLICY inventory_delete ON inventory
  FOR DELETE USING (is_platform_admin() OR is_cluster_admin(cluster_id));
