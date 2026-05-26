-- ============================================================
-- BookKeeper: Allow Cluster Admins to Delete Orders (013)
-- ============================================================
--
-- Original migration 011 restricted book_orders DELETE to platform
-- admins only. Cluster admins can already delete individual order
-- items (which reverses inventory), so blocking them from deleting
-- whole orders is an arbitrary asymmetry. Loosen the policy.
--
-- The server-side deleteOrder action validates that all items can
-- be reversed before applying any changes, so the looser policy
-- doesn't relax the safety guard — it just lets the action run.

DROP POLICY book_orders_delete ON book_orders;

CREATE POLICY book_orders_delete ON book_orders
  FOR DELETE USING (
    is_platform_admin() OR is_cluster_admin(cluster_id)
  );
