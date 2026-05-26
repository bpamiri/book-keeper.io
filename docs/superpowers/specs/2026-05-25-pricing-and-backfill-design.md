# Pricing Catalog & Backfill Orders

## Problem

After the initial Book Orders feature shipped (PR #19), two gaps surfaced during user testing:

1. **Pre-existing inventory has no financial metadata.** Stock added before the orders system existed — or via the still-supported `addStock` flow — has no associated cost, sale price, or payer. The cluster admin can't easily answer "what should we charge for these?" or "did anyone pay for these out of pocket?"
2. **New-order entry is repetitive.** Every order line item requires manually re-entering `unit_cost` and `unit_sale_price`, even when the same book at the same price is ordered repeatedly.

Both gaps share a common cause: there's no per-cluster "default price" for a book. And the second gap (retroactive purchase logging) has no UI path at all today.

## Solution Overview

Add two complementary mechanisms:

1. **Pricing catalog** (`cluster_book_pricing` table) — one row per `(cluster, book, language)` storing default cost + sale price. The new-order form looks up this catalog when a book+language is selected and pre-fills the line's cost/sale (admin can still override per-order). A dedicated admin page lets cluster admins maintain the catalog.

2. **Backfill orders** (a checkbox + a flag column) — the new-order form gets an "Books are already in stock" checkbox. When checked, `createOrder` skips the inventory increment and the `inventory_log` write, and sets `book_orders.is_backfill = true`. Otherwise the order behaves identically. List and detail views show a "Backfill" badge so backfill orders are distinguishable from real-time purchases.

The two pieces compose: a cluster admin can populate the pricing catalog once, then create a single backfill order using those defaults to retroactively document who paid for the books currently on the shelf.

## Data Model

### New table: `cluster_book_pricing`

```sql
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

CREATE INDEX idx_cluster_book_pricing_book_lang
  ON cluster_book_pricing(cluster_id, ruhi_book_id, language);
```

Plus an `updated_at` trigger using the existing `update_updated_at()` function.

### Existing-table change: `book_orders.is_backfill`

```sql
ALTER TABLE book_orders
  ADD COLUMN is_backfill boolean NOT NULL DEFAULT false;
```

Default `false` so existing orders keep their semantics. New orders pass an explicit value (the new-order form's checkbox controls it).

## RLS

```sql
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
```

Mirrors the `payer_institutions` policy shape exactly: any cluster member reads, only admins write. `WITH CHECK` is applied on UPDATE (defense-in-depth lesson from the PR #19 review).

`book_orders` policies don't need any change — the new `is_backfill` column is just another updatable field, governed by the same `book_orders_update` policy.

## Server Actions

### `src/app/actions/pricing.ts` (new file)

```ts
listPricing(clusterId: string)
  // -> { data: ClusterBookPricing[] | error: string }
  // Any authenticated cluster member can call.

upsertPricing(clusterId, {
  ruhi_book_id, language, default_cost, default_sale_price, notes?
})
  // Admin-only. INSERT ... ON CONFLICT (cluster_id, ruhi_book_id, language)
  // DO UPDATE — Supabase's .upsert() with onConflict.

deletePricing(id: string)
  // Admin-only. Hard delete is safe: nothing references this table.
```

### `src/app/actions/orders.ts` (modify `createOrder`)

Add `already_stocked?: boolean` to the data object. Behavior:
- `is_backfill` is set to `data.already_stocked ?? false` on the inserted `book_orders` row.
- If `already_stocked === true`, the per-item loop **skips the inventory upsert + `inventory_log` insert**. The order header and items are still written.
- All other behavior (auth, validation, payer constraint, publication_status snapshot) is unchanged.

No new exported action needed — the same `createOrder` handles both modes via the flag.

## UI

### Pricing admin page (new)

Route: `/clusters/[id]/orders/pricing` — admin only (mirrors `/payer-institutions` access pattern).

Layout:
- Breadcrumb: `Dashboard / Cluster / Orders /`
- Title: "Pricing Catalog" + description
- Table: Book / Language / Default cost / Default sale price / Notes / Actions (edit, delete)
- "Add pricing" button → dialog with BookPicker / LanguagePicker / cost / sale price / notes inputs
- Edit on a row opens the same dialog pre-filled

Empty state: "No pricing configured yet. Add a row to set default prices for orders in this cluster."

### New-order form changes (modify)

Already exists at `/clusters/[id]/orders/new`. Three changes:

1. **Pricing lookup**: when a line's `ruhi_book_id` or `language` changes, look up the corresponding pricing row from a `Map<string, ClusterBookPricing>` keyed by `"${ruhi_book_id}|${language}"`. If a match is found, pre-fill the line's `unit_cost` and `unit_sale_price` from the catalog. If no match is found, leave the existing values in the line unchanged (do **not** zero them out — admin may have already typed a value). The admin can still type over the pre-filled values.
2. **"Already stocked" checkbox**: between the items section and the submit row. Label: "These books are already in stock (don't update inventory)". Default unchecked.
3. **Server action call**: pass `already_stocked: alreadyStocked` to `createOrder`.

### Order detail and list (modify)

- Order list table: add a "Type" indicator next to the date — show a small "Backfill" badge for `is_backfill === true` rows.
- Order detail page: show a "Backfill" badge near the title for backfill orders. The reimbursement card behavior is unchanged.

### Cluster home page (modify)

Add a third admin link in the admin actions block:
```
[ Invite Members ] [ Manage Payer Institutions ] [ Manage Pricing ]
```

## Migration & Rollout

Single SQL file `supabase/migrations/012_pricing_and_backfill.sql`. Order of statements:
1. `CREATE TABLE cluster_book_pricing` + index
2. `updated_at` trigger
3. `ALTER TABLE book_orders ADD COLUMN is_backfill`
4. `ALTER TABLE cluster_book_pricing ENABLE ROW LEVEL SECURITY`
5. RLS policies on `cluster_book_pricing`

After the migration, regenerate (manually update) `src/types/database.ts` to add the new table types and the `is_backfill` field on `book_orders`.

## Verification

No automated tests in v1 — same as the original feature. Manual verification:

- **DB level**: apply migration, confirm `cluster_book_pricing` exists, confirm `book_orders.is_backfill` exists with `NOT NULL DEFAULT false`, insert a pricing row and confirm RLS rejects writes from a non-admin.
- **Pricing CRUD**: visit `/clusters/[id]/orders/pricing` as admin, add a row, edit it, delete it. Verify non-admins see the page (they can read) but no admin actions are shown.
- **Pricing lookup in new-order form**: pick a book + language that has pricing configured; confirm `unit_cost` and `unit_sale_price` pre-fill. Override one of the values manually and submit; confirm the override is what's persisted on the line.
- **Backfill checkbox**: create an order with "Already stocked" checked. Verify `book_orders.is_backfill = true`, verify inventory at the target location did NOT change, verify `inventory_log` has no new rows for the order's items. Open the detail page and confirm the "Backfill" badge appears.
- **Mixed workflow**: populate pricing catalog → create one backfill order documenting existing stock → create one regular order for new purchases → confirm inventory only changes on the second.

## Unresolved Questions

1. **Sale-price collection**: still not tracked. Pricing catalog gives a recommended sale price; whether/when the cluster actually collected that sale price from a recipient is out of scope for v1.
2. **Multi-currency**: catalog inherits the single-currency assumption (USD). Not addressed.
3. **Bulk pricing import**: no CSV/spreadsheet import for the catalog. Manual entry per (book, language). Could be added if friction is high.

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/012_pricing_and_backfill.sql` | New: table, index, trigger, ALTER column, RLS |
| `src/types/database.ts` | Add `ClusterBookPricing` Row/Insert/Update + `is_backfill` on `book_orders` types |
| `src/app/actions/pricing.ts` | New: `listPricing`, `upsertPricing`, `deletePricing` |
| `src/app/actions/orders.ts` | `createOrder` accepts `already_stocked` flag; skips inventory writes when true |
| `src/app/(protected)/clusters/[id]/orders/pricing/page.tsx` | New: server component |
| `src/app/(protected)/clusters/[id]/orders/pricing/pricing-client.tsx` | New: client UI |
| `src/app/(protected)/clusters/[id]/orders/new/page.tsx` | Fetch pricing rows in parallel; pass to form |
| `src/app/(protected)/clusters/[id]/orders/new/new-order-form.tsx` | Pricing lookup pre-fill + "already stocked" checkbox + pass flag to action |
| `src/app/(protected)/clusters/[id]/orders/orders-client.tsx` | "Backfill" badge in list |
| `src/app/(protected)/clusters/[id]/orders/[orderId]/order-detail-client.tsx` | "Backfill" badge in header |
| `src/app/(protected)/clusters/[id]/page.tsx` | "Manage Pricing" admin link |

## Files NOT Changed

- Payer institutions actions and admin page — unrelated
- Inventory and request flows — unaffected
- Migrations 001–011 — not modified
- Order item edit/delete actions — pricing applies at line creation only; subsequent edits don't re-snapshot pricing
