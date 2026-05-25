# Book Orders: Purchase Tracking & Reimbursement

## Problem

Today the system can only fulfill `book_requests` from existing inventory. There is no concept of *purchasing* books from an external source. As a result the cluster has no record of:

- What books cost to acquire vs. what they're sold for
- Who paid for a given batch of books (individual cluster member vs. an institutional body like the Area Teaching Committee)
- Whether an individual who paid out of pocket has been reimbursed

This makes it impossible to fulfill a request and know "the books we just gave out were paid for by Alice — Alice is owed $35."

## Solution Overview

Add a **Book Orders** ledger: an additive purchase-record layer that sits alongside the existing inventory system.

- Each order records who paid (an individual cluster member or an institutional payer), one or more line items (book + location + quantity + cost + sale price), and a reimbursement status.
- Creating an order **immediately stocks inventory** at the specified location(s) — orders are recorded after the fact, as a log of a completed purchase. There is no separate "received" step.
- Inventory log entries gain a `related_order_item_id` column so any inventory change resulting from an order traces back to its source.
- The existing `addStock` action remains untouched: it's still the path for non-purchase stock changes (gifts, transfers, found stock).

## Data Model

### New tables

```sql
-- Per-cluster lookup of institutional payers (ATC, LSA, Regional Council, etc.).
-- Each cluster manages its own list. A trigger seeds defaults when a cluster
-- is created; existing clusters are backfilled by the migration.
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

CREATE TYPE payer_kind AS ENUM ('individual', 'institution');
CREATE TYPE reimbursement_status AS ENUM ('not_required', 'owed', 'partial', 'reimbursed');

-- Order header: financial + payer info.
CREATE TABLE book_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier text,
  notes text,
  payer_kind payer_kind NOT NULL,
  paid_by_user_id uuid REFERENCES profiles(id),
  paid_by_institution_id uuid REFERENCES payer_institutions(id),
  reimbursement_status reimbursement_status NOT NULL DEFAULT 'owed',
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

-- Line items: each row is N copies of a book at a given location, with cost + sale price.
-- publication_status is snapshotted at order time so the historical record stays stable.
CREATE TABLE book_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES book_orders(id) ON DELETE CASCADE,
  ruhi_book_id uuid NOT NULL REFERENCES ruhi_books(id),
  language text NOT NULL,
  publication_status publication_status NOT NULL,
  storage_location_id uuid NOT NULL REFERENCES storage_locations(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(10,2) NOT NULL CHECK (unit_cost >= 0),
  unit_sale_price numeric(10,2) NOT NULL CHECK (unit_sale_price >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Existing-table changes

```sql
ALTER TABLE inventory_log
  ADD COLUMN related_order_item_id uuid REFERENCES book_order_items(id) ON DELETE SET NULL;

ALTER TYPE change_type ADD VALUE 'ordered';
```

### Triggers

- `trg_payer_institutions_updated_at` and `trg_book_orders_updated_at`: reuse the existing `update_updated_at()` function.
- `trg_seed_payer_institutions`: on `AFTER INSERT ON clusters`, insert four default rows into `payer_institutions` (`Area Teaching Committee`, `Local Spiritual Assembly`, `Regional Council`, `National Fund`).

### Indexes

```sql
CREATE INDEX idx_payer_institutions_cluster_id ON payer_institutions(cluster_id);
CREATE INDEX idx_book_orders_cluster_id ON book_orders(cluster_id);
CREATE INDEX idx_book_orders_paid_by_user_id ON book_orders(paid_by_user_id) WHERE paid_by_user_id IS NOT NULL;
CREATE INDEX idx_book_orders_paid_by_institution_id ON book_orders(paid_by_institution_id) WHERE paid_by_institution_id IS NOT NULL;
CREATE INDEX idx_book_orders_reimbursement_status ON book_orders(reimbursement_status);
CREATE INDEX idx_book_orders_order_date ON book_orders(order_date);
CREATE INDEX idx_book_order_items_order_id ON book_order_items(order_id);
CREATE INDEX idx_book_order_items_ruhi_book_id ON book_order_items(ruhi_book_id);
CREATE INDEX idx_book_order_items_storage_location_id ON book_order_items(storage_location_id);
```

### Design rationale

- **Two-table header/lines pattern** matches the existing `book_requests` + `request_fulfillments` shape.
- **Money as `numeric(10,2)`** — never `float`. Financial reporting needs exact arithmetic.
- **`publication_status` snapshot on the line item** mirrors what `inventory.publication_status` and `book_requests.publication_status` already do, keeping historical records stable when the catalog's status changes.
- **CHECK constraint on payer fields** enforces that exactly one of `paid_by_user_id` / `paid_by_institution_id` is set, matching `payer_kind`. This pushes the consistency rule into the database so server actions can't drift from it.
- **`reimbursement_status = 'not_required'`** is the value cluster admins pick when an institutional payment doesn't need reimbursement (e.g., ATC just absorbed the cost).

## Authorization

Following the existing RLS helpers (`is_platform_admin`, `is_cluster_member`, `is_cluster_admin`):

| Action | Required role |
|---|---|
| View orders / order items | cluster member |
| Create / edit order (including items) | cluster admin |
| Record reimbursement | cluster admin |
| Delete order | platform admin only |
| View / list payer institutions | cluster member |
| Create / edit / deactivate payer institution | cluster admin |

**Why admin-only writes**: orders modify inventory and carry financial implications. The existing `book_requests` flow lets any cluster member request books, but the inventory-mutating side (`updateInventory`, `deleteInventory`) is already gated behind an admin check via `verifyInventoryAdmin`. Orders fall on that side.

### RLS policies

```sql
-- payer_institutions
CREATE POLICY payer_institutions_select ON payer_institutions
  FOR SELECT USING (is_platform_admin() OR is_cluster_member(cluster_id));
CREATE POLICY payer_institutions_insert ON payer_institutions
  FOR INSERT WITH CHECK (is_platform_admin() OR is_cluster_admin(cluster_id));
CREATE POLICY payer_institutions_update ON payer_institutions
  FOR UPDATE USING (is_platform_admin() OR is_cluster_admin(cluster_id));
CREATE POLICY payer_institutions_delete ON payer_institutions
  FOR DELETE USING (is_platform_admin() OR is_cluster_admin(cluster_id));

-- book_orders
CREATE POLICY book_orders_select ON book_orders
  FOR SELECT USING (is_platform_admin() OR is_cluster_member(cluster_id));
CREATE POLICY book_orders_insert ON book_orders
  FOR INSERT WITH CHECK (is_platform_admin() OR is_cluster_admin(cluster_id));
CREATE POLICY book_orders_update ON book_orders
  FOR UPDATE USING (is_platform_admin() OR is_cluster_admin(cluster_id));
CREATE POLICY book_orders_delete ON book_orders
  FOR DELETE USING (is_platform_admin());

-- book_order_items: join through book_orders for cluster_id (same pattern as request_fulfillments)
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
  FOR UPDATE USING (
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
```

## Server Actions

### `src/app/actions/orders.ts` (new file)

```ts
createOrder({
  cluster_id,
  order_date,
  supplier?, notes?,
  payer_kind,                          // 'individual' | 'institution'
  paid_by_user_id?,                    // when payer_kind === 'individual'
  paid_by_institution_id?,             // when payer_kind === 'institution'
  reimbursement_status?,               // defaults: 'owed' for individual, 'not_required' for institution
  reimbursement_notes?,
  items: Array<{
    ruhi_book_id, language, storage_location_id,
    quantity, unit_cost, unit_sale_price, notes?
  }>,
})
```

Flow:
1. Auth check; verify caller is cluster admin or platform admin.
2. Validate payer fields match `payer_kind`; validate `items` non-empty; validate quantities/prices.
3. For each item, look up `ruhi_books.publication_status` and snapshot onto the item row.
4. Insert `book_orders` row.
5. Insert `book_order_items` rows.
6. For each item: upsert into `inventory` (mirroring `addStock` logic — increment existing row or insert new), then write an `inventory_log` row with `change_type='ordered'`, `quantity_change = +item.quantity`, and `related_order_item_id = item.id`.
7. `revalidatePath(/clusters/${cluster_id}/orders)` and `revalidatePath(/clusters/${cluster_id})`.
8. Return `{ data: order }`.

```ts
updateOrderHeader(id, {
  order_date?, supplier?, notes?,
  payer_kind?, paid_by_user_id?, paid_by_institution_id?,
})
```
- Admin-only. Updates the order header. Re-validates the payer constraint. Does **not** touch items or inventory.

```ts
recordReimbursement(id, {
  status,                              // 'owed' | 'partial' | 'reimbursed' | 'not_required'
  amount,                              // numeric; the new total reimbursed_amount
  notes?,
})
```
- Admin-only. Updates `reimbursement_status`, `reimbursed_amount`, `reimbursement_notes`. Sets `reimbursed_at = now()` and `reimbursed_by = auth.uid()` when status transitions to `'reimbursed'`. Clears them when status moves back to `'owed'`.

```ts
addOrderItem(order_id, {
  ruhi_book_id, language, storage_location_id,
  quantity, unit_cost, unit_sale_price, notes?,
})
```
- Admin-only. Snapshots `publication_status`. Inserts the item, increments inventory, writes `inventory_log` with `change_type='ordered'`.

```ts
updateOrderItem(item_id, {
  ruhi_book_id?, language?, storage_location_id?,
  quantity?, unit_cost?, unit_sale_price?, notes?,
})
```
- Admin-only. Computes inventory delta:
  - If `(book, language, location)` unchanged: `delta = new_qty - old_qty` at that location.
  - If any of those changed: `delta_old = -old_qty` at old `(book, language, location)`; `delta_new = +new_qty` at new `(book, language, location)`.
- For each negative delta, validate the affected `inventory` row has sufficient stock. If not, return `{ error: 'Insufficient stock at <location> for <book>; current quantity is X but the edit would require subtracting Y' }`.
- Apply deltas to inventory; write `inventory_log` rows with `change_type='adjustment'` and `related_order_item_id` for each affected row.
- Update the item row.
- If `ruhi_book_id` changed, re-snapshot `publication_status`.

```ts
deleteOrderItem(item_id)
```
- Admin-only. Equivalent to setting quantity to 0: subtract `old_qty` from inventory at the item's `(book, language, location)`, validate sufficient stock, log the adjustment, then delete the row.

### `src/app/actions/payer_institutions.ts` (new file)

```ts
listInstitutions(cluster_id)
createInstitution(cluster_id, { name, description?, sort_order? })
updateInstitution(id, { name?, description?, sort_order?, is_active? })
deactivateInstitution(id)  // sets is_active = false; preserves historical orders
```

- All admin-only writes. `deactivateInstitution` is a soft delete (set `is_active = false`) — never a hard delete, because `book_orders.paid_by_institution_id` references it. The list/select dropdown filters `is_active = true`.

### Atomicity caveat

Supabase JS client doesn't expose true SQL transactions. The multi-write flows above (e.g. `createOrder`'s "insert order + insert items + update inventory + log") mirror the existing `fulfillRequest` action: validate up front, then apply changes in sequence. Mid-flight failure could leave a partial state — the spec accepts this trade-off for v1, matching existing precedent in the codebase. A follow-up could push these flows into a Postgres function (RPC) for transactional safety.

## UI / Pages

### Routes

```
/clusters/[id]/orders                     # list view
/clusters/[id]/orders/new                 # create form
/clusters/[id]/orders/[orderId]           # detail + edit
/clusters/[id]/orders/payer-institutions  # admin: manage cluster's institution list
```

### `/clusters/[id]/orders` — list

- Table columns: Date, Supplier, Items (count), Total Cost, Payer, Reimbursement (status badge).
- Filters: date range, payer, reimbursement status, book.
- Row click → detail page.
- "New Order" button visible only to cluster/platform admins.
- Empty state: "No orders yet. Click New Order to record your first purchase."

### `/clusters/[id]/orders/new` — create form

- Header section: `Order date` (defaults to today), `Supplier` (text), `Notes` (textarea).
- Payer section: radio (`Individual` / `Institution`).
  - If Individual: searchable combobox of cluster members (active rows in `cluster_members` for this cluster).
  - If Institution: dropdown of cluster's active payer institutions, with an inline "+ Add new institution" link that opens a small dialog.
- Reimbursement section: status select (defaults to `Owed` for individual, `Not required` for institution); reimbursement notes textarea.
- Items section: repeatable rows (book combobox, language select, storage location select, quantity input, unit cost input, unit sale price input, line notes).
  - Each row shows its line total (qty × unit cost).
  - Footer shows running totals: Total Cost, Total Sale Value, Margin (Sale − Cost).
  - "Add line" button below the items list.
  - At least one item is required to submit.
- Submit creates the order via `createOrder`, then redirects to the detail page.
- Error states: server action errors render as a sonner toast plus an inline alert at the top of the form.

### `/clusters/[id]/orders/[orderId]` — detail

- **Header card**: order_date, supplier, payer name (clickable to user profile if individual), total cost, total sale value, margin, created_by/at.
- **Reimbursement card**: current status badge, `reimbursed_amount`, `reimbursed_at`, `reimbursed_by`, `reimbursement_notes`. Admin button: "Record reimbursement" opens a dialog with the `recordReimbursement` form.
- **Items table** (admin can edit inline):
  - Each line is editable inline — book combobox, language, location, quantity, unit cost, unit sale price.
  - "Save" / "Cancel" buttons per row when editing.
  - "Delete line" button per row with confirmation dialog.
  - "Add line" button below the table opens an inline new-row form.
  - Inline validation surfaces `updateOrderItem` errors (e.g., "Insufficient stock at X") without leaving the page.

### `/clusters/[id]/orders/payer-institutions` — admin only

- Simple table: name, description, is_active.
- "Add institution" dialog (name, description, sort_order).
- Row actions: edit, deactivate / reactivate.
- The four seeded defaults can be deactivated but not deleted (FK from `book_orders` prevents hard delete).

### Sidebar navigation

Add **Orders** link in `src/components/sidebar.tsx` under each cluster's nav section, between Inventory and Requests. The "manage payer institutions" link sits in the cluster admin section alongside members/locations admin links.

### Component reuse

- shadcn/radix `Table`, `Dialog`, `Form`, `Combobox` — already in the codebase.
- Book / language / location pickers: new shared components live at `src/components/forms/book-picker.tsx` / `language-picker.tsx` / `location-picker.tsx`. They are designed for reuse, but the existing `/clusters/[id]/request` form is **not** migrated to consume them in this PR — that's a follow-up refactor, kept out of scope to avoid touching unrelated code.
- `sonner` toasts for action results.
- Status badge styling matches the existing `book_requests` status pills.

## Migration & Rollout

Single SQL file `supabase/migrations/011_book_orders.sql`. Applied as one unit.

Order of statements within the migration:

1. `CREATE TABLE payer_institutions` + indexes.
2. `CREATE TYPE payer_kind` and `reimbursement_status`.
3. `CREATE TABLE book_orders` + indexes.
4. `CREATE TABLE book_order_items` + indexes.
5. `ALTER TABLE inventory_log ADD COLUMN related_order_item_id ...`.
6. `ALTER TYPE change_type ADD VALUE 'ordered'`.
7. `CREATE FUNCTION seed_default_payer_institutions()` + `AFTER INSERT ON clusters` trigger.
8. `DO` block: backfill default institutions for every existing row in `clusters`.
9. `updated_at` triggers on `payer_institutions` and `book_orders`.
10. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all three new tables.
11. RLS policies (see Authorization).

After the migration applies, regenerate `src/types/database.ts` from Supabase so the new tables and enums are typed.

### Migration gotcha: `ALTER TYPE ... ADD VALUE`

Step 6 (`ALTER TYPE change_type ADD VALUE 'ordered'`) has special semantics in Postgres: even though Postgres 12+ allows this statement inside a transaction, the newly added enum value **cannot be used** until the transaction commits. The migration above is safe because no statement inside the same migration tries to insert a row with `change_type = 'ordered'` — the backfill in step 8 only writes to `payer_institutions`, never to `inventory_log`. Inventory log rows with `change_type = 'ordered'` are written at runtime by `createOrder` after the migration has committed. Do not collapse the migration into a different order without rechecking this.

## Verification

No automated tests in v1 — the project has no test suite configured (no test deps in `package.json`, no test files). Verification is manual:

- **DB-level (Supabase Studio or `psql`)**:
  - Apply the migration to a fresh Supabase project; confirm all tables, indexes, triggers, policies exist.
  - Insert a row into `clusters` and confirm `payer_institutions` gets the four defaults via trigger.
  - Try to insert a `book_orders` row with mismatched payer fields (e.g., `payer_kind = 'individual'` but no `paid_by_user_id`) and confirm the CHECK constraint rejects it.
  - Sign in as a non-cluster-member and confirm RLS hides the orders.

- **Action-level (dev session in the running app)**:
  - Create an order with two lines targeting different storage locations and confirm inventory increments at both.
  - Inspect `inventory_log` and confirm both new rows have `change_type='ordered'` and the correct `related_order_item_id`.
  - Edit one item's quantity upward — confirm inventory increments and an adjustment row appears in the log.
  - Edit one item's quantity downward to less than was already consumed by a fulfillment — confirm the action returns the insufficient-stock error and inventory is unchanged.
  - Delete an item and confirm inventory decrements and the log records it.
  - Record a reimbursement and confirm `reimbursed_at` / `reimbursed_by` populate.

- **UI walk-through**:
  - Create an order from the new-order form; verify the redirect lands on the detail page with totals correct.
  - Navigate to the inventory page for the cluster and confirm the new stock is visible.
  - Fulfill an existing request that pulls from the order's stock; confirm fulfillment works normally and the detail page's "items" still show the original quantities (sale price doesn't change when stock is sold).
  - Deactivate a payer institution and confirm it disappears from the new-order dropdown but historical orders still display its name.

## Unresolved questions (will surface during implementation)

1. **Margin / collection ledger**: `unit_sale_price` is informational — there's no record of whether the cluster *actually collected* that amount from the recipient when the request was fulfilled. If you later want to track payments-in, that's a separate feature.
2. **Order numbering**: no human-friendly sequential order number ("ORD-2026-042") in v1. UUID is the PK; the list page sorts by date.
3. **Currency**: assumed USD; no `currency` column. If multi-currency becomes a need, we'd add it.
4. **Order voiding**: there's no "voided" status. Cluster admins fix mistakes by editing/deleting items; full-order delete is platform-admin only. If end users need to mark an entire order as voided without losing the audit trail, we'd add a `voided_at` / `voided_by` pair.
5. **Multiple partial reimbursements**: the spec stores a single `reimbursed_amount` total. If an individual is reimbursed in installments (e.g., $20 today, $30 next month), the running total updates but each event isn't independently logged. If you need per-event reimbursement history (date, amount, who recorded it), that requires a `reimbursement_events` sub-table — out of scope for v1.

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/011_book_orders.sql` | New: tables, enums, indexes, triggers, RLS policies, defaults backfill |
| `src/types/database.ts` | Regenerate from Supabase; new tables/enums become typed |
| `src/app/actions/orders.ts` | New: `createOrder`, `updateOrderHeader`, `recordReimbursement`, `addOrderItem`, `updateOrderItem`, `deleteOrderItem` |
| `src/app/actions/payer_institutions.ts` | New: `listInstitutions`, `createInstitution`, `updateInstitution`, `deactivateInstitution` |
| `src/app/(protected)/clusters/[id]/orders/page.tsx` | New: orders list |
| `src/app/(protected)/clusters/[id]/orders/orders-client.tsx` | New: filter / table client component |
| `src/app/(protected)/clusters/[id]/orders/new/page.tsx` | New: create form |
| `src/app/(protected)/clusters/[id]/orders/new/new-order-form.tsx` | New: client component for the multi-line form |
| `src/app/(protected)/clusters/[id]/orders/[orderId]/page.tsx` | New: order detail |
| `src/app/(protected)/clusters/[id]/orders/[orderId]/order-detail-client.tsx` | New: detail page with inline-editable items and reimbursement dialog |
| `src/app/(protected)/clusters/[id]/orders/payer-institutions/page.tsx` | New: institutions admin |
| `src/components/sidebar.tsx` | Add "Orders" link under each cluster's nav |
| `src/components/forms/book-picker.tsx` | New (extracted): shared book combobox |
| `src/components/forms/language-picker.tsx` | New (extracted): shared language select |
| `src/components/forms/location-picker.tsx` | New (extracted): shared location select |

## Files NOT Changed

- `src/app/actions/inventory.ts` — `addStock`, `updateInventory`, etc. remain untouched; orders is an additive path
- `src/app/actions/requests.ts` — request/fulfillment flow doesn't change
- Existing inventory and request UI pages — no functional changes; the new shared form components are used by the new order form only in this PR. Migrating other pages to consume them is a follow-up.
- Existing migrations (001–010) — not modified
