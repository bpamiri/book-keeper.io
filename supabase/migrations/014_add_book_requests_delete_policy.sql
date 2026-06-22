-- ============================================================
-- book_requests: allow deletes by platform admins and cluster admins
-- ============================================================
-- The initial schema granted SELECT/INSERT/UPDATE on book_requests but
-- no DELETE policy, so requests could never be removed. Admins need to
-- be able to delete requests (e.g. erroneous or duplicate ones).
-- Deletion is restricted to platform admins and cluster admins of the
-- owning cluster.
--
-- The server-side deleteRequest action additionally refuses to delete a
-- request that has any fulfillment records, so deleting a request never
-- silently leaves inventory counts understated.

CREATE POLICY book_requests_delete ON book_requests
  FOR DELETE USING (is_platform_admin() OR is_cluster_admin(cluster_id));
