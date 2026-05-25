# Book Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Book Orders ledger to the BookKeeper app — record purchases (cost + sale price), capture who paid (individual cluster member or institutional payer like the ATC), and track reimbursement status. Creating an order also stocks inventory.

**Architecture:** Additive — orders sit alongside the existing inventory and requests systems without disrupting them. Two new core tables (`book_orders` header + `book_order_items` lines), a per-cluster lookup table (`payer_institutions`), and a new column on `inventory_log` for provenance. Server actions in `src/app/actions/orders.ts` and `src/app/actions/payer_institutions.ts`. UI routes under `/clusters/[id]/orders/...`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase (Postgres + RLS), react-hook-form + zod, shadcn/ui (radix), Tailwind 4, sonner toasts.

**Reference:** Full design at [docs/superpowers/specs/2026-05-24-book-orders-design.md](../specs/2026-05-24-book-orders-design.md).

**Verification note:** Project has no test suite (no test deps in `package.json`, no test files). Each task's verification uses TypeScript type-checking (`npx tsc --noEmit`), lint (`npm run lint`), and — for UI tasks — manual browser exercise. The final task is a full end-to-end walkthrough.

**Branch:** All commits land on the current branch (`claude/kind-robinson-f95d8d`).

---

## Task 1: Add database migration for book orders schema

**Files:**
- Create: `supabase/migrations/011_book_orders.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/011_book_orders.sql` with the following content:

```sql
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

CREATE INDEX idx_payer_institutions_cluster_id ON payer_institutions(cluster_id);

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
  language text NOT NULL,
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

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db reset` (resets local DB and applies all migrations) OR if running against linked remote: `npx supabase db push`.

Expected: no errors. Verify by listing tables:
```
psql ... -c "\dt payer_institutions; \dt book_orders; \dt book_order_items;"
```

If `supabase` CLI isn't configured locally, apply the SQL manually via the Supabase Studio SQL editor.

- [ ] **Step 3: Verify the seed trigger works**

In Supabase Studio SQL editor (or psql), run:
```sql
SELECT name FROM payer_institutions
WHERE cluster_id = (SELECT id FROM clusters LIMIT 1)
ORDER BY sort_order;
```

Expected: 4 rows — Area Teaching Committee, Local Spiritual Assembly, Regional Council, National Fund.

- [ ] **Step 4: Verify the CHECK constraint**

Try inserting a bad order row:
```sql
INSERT INTO book_orders (cluster_id, payer_kind, created_by)
VALUES (
  (SELECT id FROM clusters LIMIT 1),
  'individual',
  (SELECT id FROM profiles LIMIT 1)
);
-- (paid_by_user_id is NULL — should violate CHECK)
```

Expected: `ERROR: new row for relation "book_orders" violates check constraint`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/011_book_orders.sql
git commit -m "feat(db): add book orders, items, and payer institutions tables

Migration 011 adds:
- payer_institutions (per-cluster lookup) with seed-on-cluster-insert trigger
- book_orders header with payer/reimbursement fields and exclusive-payer CHECK
- book_order_items with cost + sale price columns
- inventory_log.related_order_item_id for provenance
- change_type='ordered' enum value
- RLS policies matching existing cluster-scoped patterns"
```

---

## Task 2: Add TypeScript types for new tables

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add new enum types**

Edit `src/types/database.ts`. At the top of the file (after the existing enum types around line 16), add:

```ts
export type PayerKind = 'individual' | 'institution';
export type ReimbursementStatus = 'not_required' | 'owed' | 'partial' | 'reimbursed';
```

Update `ChangeType` to include the new value:

```ts
export type ChangeType = 'added' | 'removed' | 'transferred' | 'adjustment' | 'fulfilled' | 'ordered';
```

- [ ] **Step 2: Add table types to the `Database` interface**

Inside the `Tables` object in `src/types/database.ts` (after `inventory_log` definition, before the closing `};` of `Tables`), insert these three new table type blocks:

```ts
      payer_institutions: {
        Row: {
          id: string;
          cluster_id: string;
          name: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cluster_id: string;
          name: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cluster_id?: string;
          name?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payer_institutions_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "clusters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payer_institutions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      book_orders: {
        Row: {
          id: string;
          cluster_id: string;
          order_date: string;
          supplier: string | null;
          notes: string | null;
          payer_kind: PayerKind;
          paid_by_user_id: string | null;
          paid_by_institution_id: string | null;
          reimbursement_status: ReimbursementStatus;
          reimbursed_amount: number;
          reimbursed_at: string | null;
          reimbursed_by: string | null;
          reimbursement_notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cluster_id: string;
          order_date?: string;
          supplier?: string | null;
          notes?: string | null;
          payer_kind: PayerKind;
          paid_by_user_id?: string | null;
          paid_by_institution_id?: string | null;
          reimbursement_status?: ReimbursementStatus;
          reimbursed_amount?: number;
          reimbursed_at?: string | null;
          reimbursed_by?: string | null;
          reimbursement_notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cluster_id?: string;
          order_date?: string;
          supplier?: string | null;
          notes?: string | null;
          payer_kind?: PayerKind;
          paid_by_user_id?: string | null;
          paid_by_institution_id?: string | null;
          reimbursement_status?: ReimbursementStatus;
          reimbursed_amount?: number;
          reimbursed_at?: string | null;
          reimbursed_by?: string | null;
          reimbursement_notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "book_orders_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "clusters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "book_orders_paid_by_user_id_fkey";
            columns: ["paid_by_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "book_orders_paid_by_institution_id_fkey";
            columns: ["paid_by_institution_id"];
            isOneToOne: false;
            referencedRelation: "payer_institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "book_orders_reimbursed_by_fkey";
            columns: ["reimbursed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "book_orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      book_order_items: {
        Row: {
          id: string;
          order_id: string;
          ruhi_book_id: string;
          language: BookLanguage;
          publication_status: PublicationStatus;
          storage_location_id: string;
          quantity: number;
          unit_cost: number;
          unit_sale_price: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          ruhi_book_id: string;
          language: BookLanguage;
          publication_status: PublicationStatus;
          storage_location_id: string;
          quantity: number;
          unit_cost: number;
          unit_sale_price: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          ruhi_book_id?: string;
          language?: BookLanguage;
          publication_status?: PublicationStatus;
          storage_location_id?: string;
          quantity?: number;
          unit_cost?: number;
          unit_sale_price?: number;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "book_order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "book_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "book_order_items_ruhi_book_id_fkey";
            columns: ["ruhi_book_id"];
            isOneToOne: false;
            referencedRelation: "ruhi_books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "book_order_items_storage_location_id_fkey";
            columns: ["storage_location_id"];
            isOneToOne: false;
            referencedRelation: "storage_locations";
            referencedColumns: ["id"];
          },
        ];
      };
```

- [ ] **Step 3: Update `inventory_log` Row/Insert/Update to include `related_order_item_id`**

In `src/types/database.ts`, find the `inventory_log` block and add `related_order_item_id` after `related_fulfillment_id` in each of `Row`, `Insert`, and `Update`:

```ts
        Row: {
          // ... existing fields ...
          related_fulfillment_id: string | null;
          related_order_item_id: string | null;  // ADD
          notes: string | null;
          // ... existing fields ...
        };
```

(Same shape — `string | null` in Row, `?: string | null` in Insert and Update.)

Also add a relationship entry to `inventory_log.Relationships`:

```ts
          {
            foreignKeyName: "inventory_log_related_order_item_id_fkey";
            columns: ["related_order_item_id"];
            isOneToOne: false;
            referencedRelation: "book_order_items";
            referencedColumns: ["id"];
          },
```

- [ ] **Step 4: Add Enums entries**

In `src/types/database.ts`, in the `Enums` object (around line 572), add:

```ts
      payer_kind: PayerKind;
      reimbursement_status: ReimbursementStatus;
```

- [ ] **Step 5: Add row type aliases**

At the bottom of `src/types/database.ts` (around line 605, after the existing aliases), add:

```ts
export type PayerInstitution = Tables<'payer_institutions'>;
export type BookOrder = Tables<'book_orders'>;
export type BookOrderItem = Tables<'book_order_items'>;
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If the TypeScript compiler reports issues, fix them in this same task.)

- [ ] **Step 7: Commit**

```bash
git add src/types/database.ts
git commit -m "types: add book orders, items, and payer institutions

Adds Row/Insert/Update types for the three new tables, PayerKind and
ReimbursementStatus enums, related_order_item_id on inventory_log, and
convenience row aliases."
```

---

## Task 3: Add `createOrder` server action

**Files:**
- Create: `src/app/actions/orders.ts`

- [ ] **Step 1: Create the file with `createOrder`**

Create `src/app/actions/orders.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_BOOK_LANGUAGE } from '@/lib/languages'
import type {
  BookLanguage,
  PayerKind,
  PublicationStatus,
  ReimbursementStatus,
} from '@/types/database'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function verifyOrderAdmin(clusterId: string) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Not authenticated' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'platform_admin') {
    return { user, supabase }
  }

  const { data: membership } = await supabase
    .from('cluster_members')
    .select('cluster_role')
    .eq('cluster_id', clusterId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (membership?.cluster_role === 'admin') {
    return { user, supabase }
  }

  return {
    error:
      'Only cluster admins or platform admins can create or edit orders' as const,
  }
}

async function getBookPublicationStatus(
  supabase: SupabaseClient,
  bookId: string
): Promise<PublicationStatus | null> {
  const { data } = await supabase
    .from('ruhi_books')
    .select('publication_status')
    .eq('id', bookId)
    .single()
  return (data?.publication_status as PublicationStatus | undefined) ?? null
}

export async function createOrder(data: {
  cluster_id: string
  order_date?: string
  supplier?: string | null
  notes?: string | null
  payer_kind: PayerKind
  paid_by_user_id?: string | null
  paid_by_institution_id?: string | null
  reimbursement_status?: ReimbursementStatus
  reimbursement_notes?: string | null
  items: Array<{
    ruhi_book_id: string
    language: BookLanguage
    storage_location_id: string
    quantity: number
    unit_cost: number
    unit_sale_price: number
    notes?: string | null
  }>
}) {
  try {
    const adminCheck = await verifyOrderAdmin(data.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }
    const { user, supabase } = adminCheck

    // Validate payer fields
    if (data.payer_kind === 'individual') {
      if (!data.paid_by_user_id || data.paid_by_institution_id) {
        return {
          error:
            'Individual orders require paid_by_user_id and must not have paid_by_institution_id',
        }
      }
    } else {
      if (!data.paid_by_institution_id || data.paid_by_user_id) {
        return {
          error:
            'Institutional orders require paid_by_institution_id and must not have paid_by_user_id',
        }
      }
    }

    if (!data.items.length) return { error: 'At least one item is required' }
    for (const item of data.items) {
      if (item.quantity <= 0) return { error: 'Quantities must be positive' }
      if (item.unit_cost < 0) return { error: 'Unit cost must be non-negative' }
      if (item.unit_sale_price < 0)
        return { error: 'Unit sale price must be non-negative' }
    }

    // Snapshot publication_status for each item up-front
    const itemsWithStatus: Array<
      (typeof data.items)[number] & { publication_status: PublicationStatus }
    > = []
    for (const item of data.items) {
      const publication_status = await getBookPublicationStatus(
        supabase,
        item.ruhi_book_id
      )
      if (!publication_status) {
        return { error: `Book not found in catalog: ${item.ruhi_book_id}` }
      }
      itemsWithStatus.push({ ...item, publication_status })
    }

    // Default reimbursement_status: 'owed' for individual, 'not_required' for institution
    const reimbursement_status: ReimbursementStatus =
      data.reimbursement_status ??
      (data.payer_kind === 'individual' ? 'owed' : 'not_required')

    // Insert order header
    const { data: order, error: orderError } = await supabase
      .from('book_orders')
      .insert({
        cluster_id: data.cluster_id,
        order_date: data.order_date ?? new Date().toISOString().slice(0, 10),
        supplier: data.supplier ?? null,
        notes: data.notes ?? null,
        payer_kind: data.payer_kind,
        paid_by_user_id: data.paid_by_user_id ?? null,
        paid_by_institution_id: data.paid_by_institution_id ?? null,
        reimbursement_status,
        reimbursement_notes: data.reimbursement_notes ?? null,
        created_by: user.id,
      })
      .select()
      .single()

    if (orderError || !order) {
      return { error: orderError?.message ?? 'Failed to create order' }
    }

    // Insert items and stock inventory
    for (const item of itemsWithStatus) {
      const { data: inserted, error: itemError } = await supabase
        .from('book_order_items')
        .insert({
          order_id: order.id,
          ruhi_book_id: item.ruhi_book_id,
          language: item.language ?? DEFAULT_BOOK_LANGUAGE,
          publication_status: item.publication_status,
          storage_location_id: item.storage_location_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          unit_sale_price: item.unit_sale_price,
          notes: item.notes ?? null,
        })
        .select()
        .single()

      if (itemError || !inserted) {
        return { error: itemError?.message ?? 'Failed to insert order item' }
      }

      // Increment inventory at the target location
      const { data: existing } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('cluster_id', data.cluster_id)
        .eq('storage_location_id', item.storage_location_id)
        .eq('ruhi_book_id', item.ruhi_book_id)
        .eq('language', item.language)
        .eq('publication_status', item.publication_status)
        .maybeSingle()

      const previousQuantity = existing?.quantity ?? 0
      const newQuantity = previousQuantity + item.quantity

      if (existing) {
        const { error: incError } = await supabase
          .from('inventory')
          .update({ quantity: newQuantity, updated_by: user.id })
          .eq('id', existing.id)
        if (incError) return { error: incError.message }
      } else {
        const { error: insertError } = await supabase.from('inventory').insert({
          cluster_id: data.cluster_id,
          storage_location_id: item.storage_location_id,
          ruhi_book_id: item.ruhi_book_id,
          language: item.language,
          publication_status: item.publication_status,
          quantity: item.quantity,
          updated_by: user.id,
        })
        if (insertError) return { error: insertError.message }
      }

      // Log the change with provenance
      await supabase.from('inventory_log').insert({
        cluster_id: data.cluster_id,
        storage_location_id: item.storage_location_id,
        ruhi_book_id: item.ruhi_book_id,
        language: item.language,
        publication_status: item.publication_status,
        change_type: 'ordered' as const,
        quantity_change: item.quantity,
        previous_quantity: previousQuantity,
        new_quantity: newQuantity,
        related_order_item_id: inserted.id,
        notes: item.notes ?? null,
        performed_by: user.id,
      })
    }

    revalidatePath(`/clusters/${data.cluster_id}/orders`)
    revalidatePath(`/clusters/${data.cluster_id}`)
    return { data: order }
  } catch {
    return { error: 'Failed to create order' }
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/orders.ts
git commit -m "feat(actions): add createOrder server action

Validates payer fields, snapshots publication_status, inserts order
header and items, increments inventory at the target locations, logs
inventory_log entries with change_type='ordered' and provenance link.
Cluster-admin-only via verifyOrderAdmin helper."
```

---

## Task 4: Add `updateOrderHeader` and `recordReimbursement` actions

**Files:**
- Modify: `src/app/actions/orders.ts`

- [ ] **Step 1: Append `updateOrderHeader`**

At the bottom of `src/app/actions/orders.ts`, add:

```ts
export async function updateOrderHeader(
  id: string,
  data: {
    order_date?: string
    supplier?: string | null
    notes?: string | null
    payer_kind?: PayerKind
    paid_by_user_id?: string | null
    paid_by_institution_id?: string | null
  }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: current, error: fetchError } = await supabase
      .from('book_orders')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !current) return { error: 'Order not found' }

    const adminCheck = await verifyOrderAdmin(current.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }

    // Resolve final payer values
    const payer_kind = data.payer_kind ?? current.payer_kind
    const paid_by_user_id =
      data.paid_by_user_id !== undefined
        ? data.paid_by_user_id
        : current.paid_by_user_id
    const paid_by_institution_id =
      data.paid_by_institution_id !== undefined
        ? data.paid_by_institution_id
        : current.paid_by_institution_id

    // Re-validate the CHECK constraint shape in app code
    if (payer_kind === 'individual') {
      if (!paid_by_user_id || paid_by_institution_id) {
        return {
          error:
            'Individual orders require paid_by_user_id and must not have paid_by_institution_id',
        }
      }
    } else {
      if (!paid_by_institution_id || paid_by_user_id) {
        return {
          error:
            'Institutional orders require paid_by_institution_id and must not have paid_by_user_id',
        }
      }
    }

    const { data: updated, error } = await supabase
      .from('book_orders')
      .update({
        order_date: data.order_date ?? current.order_date,
        supplier: data.supplier !== undefined ? data.supplier : current.supplier,
        notes: data.notes !== undefined ? data.notes : current.notes,
        payer_kind,
        paid_by_user_id,
        paid_by_institution_id,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${current.cluster_id}/orders/${id}`)
    revalidatePath(`/clusters/${current.cluster_id}/orders`)
    return { data: updated }
  } catch {
    return { error: 'Failed to update order' }
  }
}
```

- [ ] **Step 2: Append `recordReimbursement`**

```ts
export async function recordReimbursement(
  id: string,
  data: {
    status: ReimbursementStatus
    amount: number
    notes?: string | null
  }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    if (data.amount < 0) {
      return { error: 'Reimbursed amount cannot be negative' }
    }

    const { data: current, error: fetchError } = await supabase
      .from('book_orders')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !current) return { error: 'Order not found' }

    const adminCheck = await verifyOrderAdmin(current.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }

    // When moving INTO 'reimbursed', set reimbursed_at/_by.
    // When moving OUT of 'reimbursed', clear them.
    const wasReimbursed = current.reimbursement_status === 'reimbursed'
    const nowReimbursed = data.status === 'reimbursed'

    const patch: Record<string, unknown> = {
      reimbursement_status: data.status,
      reimbursed_amount: data.amount,
      reimbursement_notes:
        data.notes !== undefined ? data.notes : current.reimbursement_notes,
    }

    if (nowReimbursed && !wasReimbursed) {
      patch.reimbursed_at = new Date().toISOString()
      patch.reimbursed_by = user.id
    } else if (!nowReimbursed && wasReimbursed) {
      patch.reimbursed_at = null
      patch.reimbursed_by = null
    }

    const { data: updated, error } = await supabase
      .from('book_orders')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${current.cluster_id}/orders/${id}`)
    revalidatePath(`/clusters/${current.cluster_id}/orders`)
    return { data: updated }
  } catch {
    return { error: 'Failed to record reimbursement' }
  }
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/orders.ts
git commit -m "feat(actions): add updateOrderHeader and recordReimbursement

updateOrderHeader updates non-item fields (date, supplier, notes,
payer info) and re-validates the exclusive-payer constraint in app
code. recordReimbursement sets/clears reimbursed_at and reimbursed_by
on status transitions in and out of 'reimbursed'."
```

---

## Task 5: Add `addOrderItem` action

**Files:**
- Modify: `src/app/actions/orders.ts`

- [ ] **Step 1: Append `addOrderItem`**

At the bottom of `src/app/actions/orders.ts`, add:

```ts
export async function addOrderItem(
  orderId: string,
  data: {
    ruhi_book_id: string
    language: BookLanguage
    storage_location_id: string
    quantity: number
    unit_cost: number
    unit_sale_price: number
    notes?: string | null
  }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    if (data.quantity <= 0) return { error: 'Quantity must be positive' }
    if (data.unit_cost < 0) return { error: 'Unit cost must be non-negative' }
    if (data.unit_sale_price < 0)
      return { error: 'Unit sale price must be non-negative' }

    const { data: order, error: orderError } = await supabase
      .from('book_orders')
      .select('id, cluster_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) return { error: 'Order not found' }

    const adminCheck = await verifyOrderAdmin(order.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }

    const publication_status = await getBookPublicationStatus(
      supabase,
      data.ruhi_book_id
    )
    if (!publication_status) return { error: 'Book not found in catalog' }

    const { data: inserted, error: insertError } = await supabase
      .from('book_order_items')
      .insert({
        order_id: orderId,
        ruhi_book_id: data.ruhi_book_id,
        language: data.language ?? DEFAULT_BOOK_LANGUAGE,
        publication_status,
        storage_location_id: data.storage_location_id,
        quantity: data.quantity,
        unit_cost: data.unit_cost,
        unit_sale_price: data.unit_sale_price,
        notes: data.notes ?? null,
      })
      .select()
      .single()

    if (insertError || !inserted) {
      return { error: insertError?.message ?? 'Failed to add item' }
    }

    // Increment inventory at the target location (same shape as createOrder)
    const { data: existing } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('cluster_id', order.cluster_id)
      .eq('storage_location_id', data.storage_location_id)
      .eq('ruhi_book_id', data.ruhi_book_id)
      .eq('language', data.language)
      .eq('publication_status', publication_status)
      .maybeSingle()

    const previousQuantity = existing?.quantity ?? 0
    const newQuantity = previousQuantity + data.quantity

    if (existing) {
      const { error: incError } = await supabase
        .from('inventory')
        .update({ quantity: newQuantity, updated_by: user.id })
        .eq('id', existing.id)
      if (incError) return { error: incError.message }
    } else {
      const { error: createInvError } = await supabase.from('inventory').insert(
        {
          cluster_id: order.cluster_id,
          storage_location_id: data.storage_location_id,
          ruhi_book_id: data.ruhi_book_id,
          language: data.language,
          publication_status,
          quantity: data.quantity,
          updated_by: user.id,
        }
      )
      if (createInvError) return { error: createInvError.message }
    }

    await supabase.from('inventory_log').insert({
      cluster_id: order.cluster_id,
      storage_location_id: data.storage_location_id,
      ruhi_book_id: data.ruhi_book_id,
      language: data.language,
      publication_status,
      change_type: 'ordered' as const,
      quantity_change: data.quantity,
      previous_quantity: previousQuantity,
      new_quantity: newQuantity,
      related_order_item_id: inserted.id,
      notes: data.notes ?? null,
      performed_by: user.id,
    })

    revalidatePath(`/clusters/${order.cluster_id}/orders/${orderId}`)
    revalidatePath(`/clusters/${order.cluster_id}`)
    return { data: inserted }
  } catch {
    return { error: 'Failed to add order item' }
  }
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/orders.ts
git commit -m "feat(actions): add addOrderItem

Appends a new line to an existing order, snapshots publication_status,
increments inventory at the target location, and logs the change with
provenance. Admin-only via verifyOrderAdmin."
```

---

## Task 6: Add `updateOrderItem` action

**Files:**
- Modify: `src/app/actions/orders.ts`

- [ ] **Step 1: Append `updateOrderItem`**

At the bottom of `src/app/actions/orders.ts`, add. This action computes inventory deltas and validates availability before applying.

```ts
export async function updateOrderItem(
  itemId: string,
  data: {
    ruhi_book_id?: string
    language?: BookLanguage
    storage_location_id?: string
    quantity?: number
    unit_cost?: number
    unit_sale_price?: number
    notes?: string | null
  }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: current, error: fetchError } = await supabase
      .from('book_order_items')
      .select('*, book_orders!inner(cluster_id)')
      .eq('id', itemId)
      .single()

    if (fetchError || !current) return { error: 'Order item not found' }

    const order = current.book_orders as unknown as { cluster_id: string }
    const adminCheck = await verifyOrderAdmin(order.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }

    // Resolve new values
    const newRuhiBookId = data.ruhi_book_id ?? current.ruhi_book_id
    const newLanguage = (data.language ?? current.language) as BookLanguage
    const newLocationId =
      data.storage_location_id ?? current.storage_location_id
    const newQuantity =
      data.quantity !== undefined ? data.quantity : current.quantity
    const newUnitCost =
      data.unit_cost !== undefined ? data.unit_cost : current.unit_cost
    const newUnitSalePrice =
      data.unit_sale_price !== undefined
        ? data.unit_sale_price
        : current.unit_sale_price

    if (newQuantity <= 0) return { error: 'Quantity must be positive' }
    if (newUnitCost < 0) return { error: 'Unit cost must be non-negative' }
    if (newUnitSalePrice < 0)
      return { error: 'Unit sale price must be non-negative' }

    // Snapshot new publication_status if book changed
    const newPublicationStatus: PublicationStatus =
      data.ruhi_book_id && data.ruhi_book_id !== current.ruhi_book_id
        ? (await getBookPublicationStatus(supabase, newRuhiBookId)) ??
          (current.publication_status as PublicationStatus)
        : (current.publication_status as PublicationStatus)

    if (!newPublicationStatus) return { error: 'Book not found in catalog' }

    // Determine whether the inventory key changed
    const oldKey = `${current.ruhi_book_id}|${current.language}|${current.publication_status}|${current.storage_location_id}`
    const newKey = `${newRuhiBookId}|${newLanguage}|${newPublicationStatus}|${newLocationId}`
    const keyChanged = oldKey !== newKey

    if (keyChanged) {
      // Reverse old inventory, apply new inventory
      // 1. Validate old location has enough to subtract
      const { data: oldInv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('cluster_id', order.cluster_id)
        .eq('storage_location_id', current.storage_location_id)
        .eq('ruhi_book_id', current.ruhi_book_id)
        .eq('language', current.language)
        .eq('publication_status', current.publication_status)
        .maybeSingle()
      if (!oldInv || oldInv.quantity < current.quantity) {
        return {
          error: `Insufficient stock at old location to reverse (have ${oldInv?.quantity ?? 0}, need ${current.quantity})`,
        }
      }

      const oldNewQty = oldInv.quantity - current.quantity
      const { error: oldErr } = await supabase
        .from('inventory')
        .update({ quantity: oldNewQty, updated_by: user.id })
        .eq('id', oldInv.id)
      if (oldErr) return { error: oldErr.message }

      await supabase.from('inventory_log').insert({
        cluster_id: order.cluster_id,
        storage_location_id: current.storage_location_id,
        ruhi_book_id: current.ruhi_book_id,
        language: current.language,
        publication_status: current.publication_status,
        change_type: 'adjustment' as const,
        quantity_change: -current.quantity,
        previous_quantity: oldInv.quantity,
        new_quantity: oldNewQty,
        related_order_item_id: current.id,
        notes: 'Order item edited (reversed from previous location/book)',
        performed_by: user.id,
      })

      // 2. Apply to new location/book
      const { data: newInv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('cluster_id', order.cluster_id)
        .eq('storage_location_id', newLocationId)
        .eq('ruhi_book_id', newRuhiBookId)
        .eq('language', newLanguage)
        .eq('publication_status', newPublicationStatus)
        .maybeSingle()

      const newPrevQty = newInv?.quantity ?? 0
      const newNewQty = newPrevQty + newQuantity

      if (newInv) {
        const { error: incErr } = await supabase
          .from('inventory')
          .update({ quantity: newNewQty, updated_by: user.id })
          .eq('id', newInv.id)
        if (incErr) return { error: incErr.message }
      } else {
        const { error: insErr } = await supabase.from('inventory').insert({
          cluster_id: order.cluster_id,
          storage_location_id: newLocationId,
          ruhi_book_id: newRuhiBookId,
          language: newLanguage,
          publication_status: newPublicationStatus,
          quantity: newQuantity,
          updated_by: user.id,
        })
        if (insErr) return { error: insErr.message }
      }

      await supabase.from('inventory_log').insert({
        cluster_id: order.cluster_id,
        storage_location_id: newLocationId,
        ruhi_book_id: newRuhiBookId,
        language: newLanguage,
        publication_status: newPublicationStatus,
        change_type: 'adjustment' as const,
        quantity_change: newQuantity,
        previous_quantity: newPrevQty,
        new_quantity: newNewQty,
        related_order_item_id: current.id,
        notes: 'Order item edited (applied to new location/book)',
        performed_by: user.id,
      })
    } else if (newQuantity !== current.quantity) {
      // Same inventory key, but quantity changed
      const delta = newQuantity - current.quantity
      const { data: inv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('cluster_id', order.cluster_id)
        .eq('storage_location_id', current.storage_location_id)
        .eq('ruhi_book_id', current.ruhi_book_id)
        .eq('language', current.language)
        .eq('publication_status', current.publication_status)
        .maybeSingle()
      if (!inv) return { error: 'Inventory row missing for this item' }

      if (delta < 0 && inv.quantity + delta < 0) {
        return {
          error: `Insufficient stock at location to reduce quantity (have ${inv.quantity}, would need to subtract ${-delta})`,
        }
      }

      const newInvQty = inv.quantity + delta
      const { error: updErr } = await supabase
        .from('inventory')
        .update({ quantity: newInvQty, updated_by: user.id })
        .eq('id', inv.id)
      if (updErr) return { error: updErr.message }

      await supabase.from('inventory_log').insert({
        cluster_id: order.cluster_id,
        storage_location_id: current.storage_location_id,
        ruhi_book_id: current.ruhi_book_id,
        language: current.language,
        publication_status: current.publication_status,
        change_type: 'adjustment' as const,
        quantity_change: delta,
        previous_quantity: inv.quantity,
        new_quantity: newInvQty,
        related_order_item_id: current.id,
        notes: 'Order item quantity edited',
        performed_by: user.id,
      })
    }

    // Persist the item row changes
    const { data: updated, error: updateErr } = await supabase
      .from('book_order_items')
      .update({
        ruhi_book_id: newRuhiBookId,
        language: newLanguage,
        publication_status: newPublicationStatus,
        storage_location_id: newLocationId,
        quantity: newQuantity,
        unit_cost: newUnitCost,
        unit_sale_price: newUnitSalePrice,
        notes: data.notes !== undefined ? data.notes : current.notes,
      })
      .eq('id', itemId)
      .select()
      .single()

    if (updateErr) return { error: updateErr.message }

    revalidatePath(`/clusters/${order.cluster_id}/orders/${current.order_id}`)
    revalidatePath(`/clusters/${order.cluster_id}`)
    return { data: updated }
  } catch {
    return { error: 'Failed to update order item' }
  }
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/orders.ts
git commit -m "feat(actions): add updateOrderItem with inventory delta handling

Computes whether the inventory key (book+language+status+location)
changed, then either reverses+reapplies across two inventory rows or
applies a simple delta. Validates the affected inventory row has
enough stock to subtract. Logs adjustments with provenance."
```

---

## Task 7: Add `deleteOrderItem` action

**Files:**
- Modify: `src/app/actions/orders.ts`

- [ ] **Step 1: Append `deleteOrderItem`**

```ts
export async function deleteOrderItem(itemId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: current, error: fetchError } = await supabase
      .from('book_order_items')
      .select('*, book_orders!inner(cluster_id)')
      .eq('id', itemId)
      .single()

    if (fetchError || !current) return { error: 'Order item not found' }

    const order = current.book_orders as unknown as { cluster_id: string }
    const adminCheck = await verifyOrderAdmin(order.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }

    // Subtract the item's quantity from inventory
    const { data: inv } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('cluster_id', order.cluster_id)
      .eq('storage_location_id', current.storage_location_id)
      .eq('ruhi_book_id', current.ruhi_book_id)
      .eq('language', current.language)
      .eq('publication_status', current.publication_status)
      .maybeSingle()

    if (!inv || inv.quantity < current.quantity) {
      return {
        error: `Insufficient stock at location to delete this item (have ${inv?.quantity ?? 0}, need ${current.quantity})`,
      }
    }

    const newInvQty = inv.quantity - current.quantity
    const { error: updErr } = await supabase
      .from('inventory')
      .update({ quantity: newInvQty, updated_by: user.id })
      .eq('id', inv.id)
    if (updErr) return { error: updErr.message }

    await supabase.from('inventory_log').insert({
      cluster_id: order.cluster_id,
      storage_location_id: current.storage_location_id,
      ruhi_book_id: current.ruhi_book_id,
      language: current.language,
      publication_status: current.publication_status,
      change_type: 'adjustment' as const,
      quantity_change: -current.quantity,
      previous_quantity: inv.quantity,
      new_quantity: newInvQty,
      related_order_item_id: current.id,
      notes: 'Order item deleted',
      performed_by: user.id,
    })

    const { error: deleteErr } = await supabase
      .from('book_order_items')
      .delete()
      .eq('id', itemId)

    if (deleteErr) return { error: deleteErr.message }

    revalidatePath(`/clusters/${order.cluster_id}/orders/${current.order_id}`)
    revalidatePath(`/clusters/${order.cluster_id}`)
    return { data: { success: true } }
  } catch {
    return { error: 'Failed to delete order item' }
  }
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/orders.ts
git commit -m "feat(actions): add deleteOrderItem with inventory reversal

Subtracts the item's quantity from inventory (validates availability),
logs the adjustment with the item id, then deletes the item row."
```

---

## Task 8: Add payer institutions actions

**Files:**
- Create: `src/app/actions/payer_institutions.ts`

- [ ] **Step 1: Create the file**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function verifyClusterAdmin(clusterId: string) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Not authenticated' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'platform_admin') {
    return { user, supabase }
  }

  const { data: membership } = await supabase
    .from('cluster_members')
    .select('cluster_role')
    .eq('cluster_id', clusterId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (membership?.cluster_role === 'admin') {
    return { user, supabase }
  }

  return {
    error:
      'Only cluster admins or platform admins can manage payer institutions' as const,
  }
}

export async function listInstitutions(clusterId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('payer_institutions')
      .select('*')
      .eq('cluster_id', clusterId)
      .order('sort_order')
      .order('name')

    if (error) return { error: error.message }
    return { data: data ?? [] }
  } catch {
    return { error: 'Failed to list institutions' }
  }
}

export async function createInstitution(
  clusterId: string,
  data: { name: string; description?: string | null; sort_order?: number }
) {
  try {
    if (!data.name.trim()) return { error: 'Name is required' }

    const adminCheck = await verifyClusterAdmin(clusterId)
    if ('error' in adminCheck) return { error: adminCheck.error }
    const { user, supabase } = adminCheck

    const { data: inserted, error } = await supabase
      .from('payer_institutions')
      .insert({
        cluster_id: clusterId,
        name: data.name.trim(),
        description: data.description ?? null,
        sort_order: data.sort_order ?? 0,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${clusterId}/orders/payer-institutions`)
    return { data: inserted }
  } catch {
    return { error: 'Failed to create institution' }
  }
}

export async function updateInstitution(
  id: string,
  data: {
    name?: string
    description?: string | null
    sort_order?: number
    is_active?: boolean
  }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: current, error: fetchError } = await supabase
      .from('payer_institutions')
      .select('cluster_id')
      .eq('id', id)
      .single()
    if (fetchError || !current) return { error: 'Institution not found' }

    const adminCheck = await verifyClusterAdmin(current.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }

    if (data.name !== undefined && !data.name.trim()) {
      return { error: 'Name cannot be empty' }
    }

    const patch: Record<string, unknown> = {}
    if (data.name !== undefined) patch.name = data.name.trim()
    if (data.description !== undefined) patch.description = data.description
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order
    if (data.is_active !== undefined) patch.is_active = data.is_active

    const { data: updated, error } = await supabase
      .from('payer_institutions')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${current.cluster_id}/orders/payer-institutions`)
    return { data: updated }
  } catch {
    return { error: 'Failed to update institution' }
  }
}

export async function deactivateInstitution(id: string) {
  return updateInstitution(id, { is_active: false })
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/payer_institutions.ts
git commit -m "feat(actions): add payer_institutions CRUD

list (any cluster member), create / update / deactivate (cluster
admin). Deactivate is a soft-delete via is_active=false; hard delete
isn't exposed because book_orders FK-references this table."
```

---

## Task 9: Add shared form components

**Files:**
- Create: `src/components/forms/book-picker.tsx`
- Create: `src/components/forms/language-picker.tsx`
- Create: `src/components/forms/location-picker.tsx`

- [ ] **Step 1: Create `language-picker.tsx`**

Languages are a fixed enum exported from `src/lib/languages.ts` as `BOOK_LANGUAGES` (with `DEFAULT_BOOK_LANGUAGE` for the default value).

Create `src/components/forms/language-picker.tsx`:

```tsx
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BOOK_LANGUAGES, DEFAULT_BOOK_LANGUAGE } from "@/lib/languages";
import type { BookLanguage } from "@/types/database";

interface LanguagePickerProps {
  value: BookLanguage;
  onChange: (value: BookLanguage) => void;
  disabled?: boolean;
  className?: string;
}

export function LanguagePicker({
  value,
  onChange,
  disabled,
  className,
}: LanguagePickerProps) {
  return (
    <Select
      value={value ?? DEFAULT_BOOK_LANGUAGE}
      onValueChange={(v) => onChange(v as BookLanguage)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent>
        {BOOK_LANGUAGES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            {lang}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Create `location-picker.tsx`**

```tsx
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StorageLocation } from "@/types/database";

interface LocationPickerProps {
  value: string;
  onChange: (id: string) => void;
  locations: StorageLocation[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function LocationPicker({
  value,
  onChange,
  locations,
  disabled,
  placeholder = "Select a storage location",
  className,
}: LocationPickerProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {locations
          .filter((l) => l.is_active)
          .map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>
              {loc.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 3: Create `book-picker.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { RuhiBook } from "@/types/database";

interface BookPickerProps {
  value: string;
  onChange: (id: string) => void;
  books: RuhiBook[];
  disabled?: boolean;
  className?: string;
}

export function BookPicker({
  value,
  onChange,
  books,
  disabled,
  className,
}: BookPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = books.find((b) => b.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected ? selected.title : "Select a book…"}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search books…" />
          <CommandList>
            <CommandEmpty>No book found.</CommandEmpty>
            <CommandGroup>
              {books
                .filter((b) => b.is_active)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((book) => (
                  <CommandItem
                    key={book.id}
                    value={book.title}
                    onSelect={() => {
                      onChange(book.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        value === book.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {book.title}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/forms/book-picker.tsx src/components/forms/language-picker.tsx src/components/forms/location-picker.tsx
git commit -m "feat(components): add shared book/language/location pickers

Three small reusable form components. Used by the new order form;
existing request form keeps its own pickers (separate refactor)."
```

---

## Task 10: Add orders list page

**Files:**
- Create: `src/app/(protected)/clusters/[id]/orders/page.tsx`
- Create: `src/app/(protected)/clusters/[id]/orders/orders-client.tsx`

- [ ] **Step 1: Create the server component**

`src/app/(protected)/clusters/[id]/orders/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  BookOrder,
  BookOrderItem,
  ClusterMember,
  PayerInstitution,
  Profile,
} from "@/types/database";
import { OrdersClient } from "./orders-client";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!membership) redirect("/dashboard");

  const [ordersRes, itemsRes, profilesRes, institutionsRes] = await Promise.all([
    supabase
      .from("book_orders")
      .select("*")
      .eq("cluster_id", id)
      .order("order_date", { ascending: false }),
    supabase
      .from("book_order_items")
      .select("*, book_orders!inner(cluster_id)")
      .eq("book_orders.cluster_id", id),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, created_at, updated_at"),
    supabase
      .from("payer_institutions")
      .select("*")
      .eq("cluster_id", id),
  ]);

  const orders = (ordersRes.data ?? []) as BookOrder[];
  const items = (itemsRes.data ?? []) as (BookOrderItem & {
    book_orders: { cluster_id: string };
  })[];
  const profiles = (profilesRes.data ?? []) as Profile[];
  const institutions = (institutionsRes.data ?? []) as PayerInstitution[];

  return (
    <OrdersClient
      clusterId={id}
      isAdmin={(membership as unknown as ClusterMember).cluster_role === "admin"}
      orders={orders}
      items={items}
      profiles={profiles}
      institutions={institutions}
    />
  );
}
```

- [ ] **Step 2: Create the client component**

`src/app/(protected)/clusters/[id]/orders/orders-client.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  BookOrder,
  BookOrderItem,
  PayerInstitution,
  Profile,
  ReimbursementStatus,
} from "@/types/database";

const reimbursementVariant: Record<
  ReimbursementStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  not_required: "secondary",
  owed: "destructive",
  partial: "outline",
  reimbursed: "default",
};

const reimbursementLabel: Record<ReimbursementStatus, string> = {
  not_required: "Not required",
  owed: "Owed",
  partial: "Partial",
  reimbursed: "Reimbursed",
};

interface OrdersClientProps {
  clusterId: string;
  isAdmin: boolean;
  orders: BookOrder[];
  items: BookOrderItem[];
  profiles: Profile[];
  institutions: PayerInstitution[];
}

export function OrdersClient({
  clusterId,
  isAdmin,
  orders,
  items,
  profiles,
  institutions,
}: OrdersClientProps) {
  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const institutionsById = new Map(institutions.map((i) => [i.id, i]));
  const itemsByOrder = new Map<string, BookOrderItem[]>();
  for (const item of items) {
    const arr = itemsByOrder.get(item.order_id) ?? [];
    arr.push(item);
    itemsByOrder.set(item.order_id, arr);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            Track book purchases, costs, payers, and reimbursements.
          </p>
        </div>
        {isAdmin && (
          <Button asChild>
            <Link href={`/clusters/${clusterId}/orders/new`}>
              <Plus className="mr-2 size-4" />
              New Order
            </Link>
          </Button>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          No orders yet.
          {isAdmin && " Click New Order to record your first purchase."}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead>Payer</TableHead>
                <TableHead>Reimbursement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const orderItems = itemsByOrder.get(order.id) ?? [];
                const totalCost = orderItems.reduce(
                  (sum, i) => sum + Number(i.unit_cost) * i.quantity,
                  0
                );
                const payerName =
                  order.payer_kind === "individual"
                    ? profilesById.get(order.paid_by_user_id ?? "")?.full_name ??
                      profilesById.get(order.paid_by_user_id ?? "")?.email ??
                      "(unknown)"
                    : institutionsById.get(order.paid_by_institution_id ?? "")
                        ?.name ?? "(unknown)";

                return (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => {
                      window.location.href = `/clusters/${clusterId}/orders/${order.id}`;
                    }}
                  >
                    <TableCell>{order.order_date}</TableCell>
                    <TableCell>{order.supplier ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {orderItems.length}
                    </TableCell>
                    <TableCell className="text-right">
                      ${totalCost.toFixed(2)}
                    </TableCell>
                    <TableCell>{payerName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={reimbursementVariant[order.reimbursement_status]}
                      >
                        {reimbursementLabel[order.reimbursement_status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Start the dev server: `npm run dev` (run in background or in another terminal).

Open `http://localhost:3000/clusters/<some-cluster-id>/orders`. Expect to see "No orders yet." with a "New Order" button visible to admins.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(protected)/clusters/[id]/orders/"
git commit -m "feat(ui): add orders list page

Server component fetches orders + items + profiles + institutions
for the cluster; client component renders the table with running
totals, payer name resolution, and reimbursement status badges."
```

---

## Task 11: Add new-order form page

**Files:**
- Create: `src/app/(protected)/clusters/[id]/orders/new/page.tsx`
- Create: `src/app/(protected)/clusters/[id]/orders/new/new-order-form.tsx`

- [ ] **Step 1: Create the server component**

`src/app/(protected)/clusters/[id]/orders/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  ClusterMember,
  PayerInstitution,
  Profile,
  RuhiBook,
  StorageLocation,
} from "@/types/database";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!membership) redirect("/dashboard");
  const m = membership as unknown as ClusterMember;
  if (m.cluster_role !== "admin") {
    redirect(`/clusters/${id}/orders`);
  }

  const [booksRes, locationsRes, membersRes, institutionsRes] =
    await Promise.all([
      supabase.from("ruhi_books").select("*").eq("is_active", true),
      supabase
        .from("storage_locations")
        .select("*")
        .eq("cluster_id", id)
        .eq("is_active", true),
      supabase
        .from("cluster_members")
        .select("*, profiles!cluster_members_user_id_fkey(id, full_name, email)")
        .eq("cluster_id", id)
        .eq("status", "active"),
      supabase
        .from("payer_institutions")
        .select("*")
        .eq("cluster_id", id)
        .eq("is_active", true),
    ]);

  const books = (booksRes.data ?? []) as RuhiBook[];
  const locations = (locationsRes.data ?? []) as StorageLocation[];
  const memberProfiles = (membersRes.data ?? [])
    .map((row) => (row as unknown as { profiles: Profile | null }).profiles)
    .filter((p): p is Profile => p !== null);
  const institutions = (institutionsRes.data ?? []) as PayerInstitution[];

  return (
    <NewOrderForm
      clusterId={id}
      books={books}
      locations={locations}
      profiles={memberProfiles}
      institutions={institutions}
    />
  );
}
```

- [ ] **Step 2: Create the client form**

`src/app/(protected)/clusters/[id]/orders/new/new-order-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookPicker } from "@/components/forms/book-picker";
import { LanguagePicker } from "@/components/forms/language-picker";
import { LocationPicker } from "@/components/forms/location-picker";
import { createOrder } from "@/app/actions/orders";
import { DEFAULT_BOOK_LANGUAGE } from "@/lib/languages";
import type {
  BookLanguage,
  PayerInstitution,
  PayerKind,
  Profile,
  ReimbursementStatus,
  RuhiBook,
  StorageLocation,
} from "@/types/database";

interface NewOrderFormProps {
  clusterId: string;
  books: RuhiBook[];
  locations: StorageLocation[];
  profiles: Profile[];
  institutions: PayerInstitution[];
}

interface ItemRow {
  ruhi_book_id: string;
  language: BookLanguage;
  storage_location_id: string;
  quantity: number;
  unit_cost: number;
  unit_sale_price: number;
  notes: string;
}

const emptyRow = (locations: StorageLocation[]): ItemRow => ({
  ruhi_book_id: "",
  language: DEFAULT_BOOK_LANGUAGE,
  storage_location_id: locations[0]?.id ?? "",
  quantity: 1,
  unit_cost: 0,
  unit_sale_price: 0,
  notes: "",
});

export function NewOrderForm({
  clusterId,
  books,
  locations,
  profiles,
  institutions,
}: NewOrderFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [orderDate, setOrderDate] = useState(today);
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");

  const [payerKind, setPayerKind] = useState<PayerKind>("individual");
  const [paidByUserId, setPaidByUserId] = useState<string>("");
  const [paidByInstitutionId, setPaidByInstitutionId] = useState<string>("");

  const [reimbursementStatus, setReimbursementStatus] =
    useState<ReimbursementStatus>("owed");
  const [reimbursementNotes, setReimbursementNotes] = useState("");

  const [items, setItems] = useState<ItemRow[]>([emptyRow(locations)]);

  const totals = items.reduce(
    (acc, row) => ({
      cost: acc.cost + row.quantity * row.unit_cost,
      sale: acc.sale + row.quantity * row.unit_sale_price,
    }),
    { cost: 0, sale: 0 }
  );

  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  };

  const handlePayerKindChange = (kind: PayerKind) => {
    setPayerKind(kind);
    // Match the default reimbursement status to the new payer kind
    setReimbursementStatus(kind === "individual" ? "owed" : "not_required");
  };

  const handleSubmit = async () => {
    if (payerKind === "individual" && !paidByUserId) {
      toast.error("Select who paid for this order");
      return;
    }
    if (payerKind === "institution" && !paidByInstitutionId) {
      toast.error("Select the institution that paid for this order");
      return;
    }
    if (
      items.some(
        (i) =>
          !i.ruhi_book_id ||
          !i.storage_location_id ||
          i.quantity <= 0 ||
          i.unit_cost < 0 ||
          i.unit_sale_price < 0
      )
    ) {
      toast.error("Every item needs a book, location, and positive quantity");
      return;
    }

    setSubmitting(true);
    const result = await createOrder({
      cluster_id: clusterId,
      order_date: orderDate,
      supplier: supplier.trim() || null,
      notes: notes.trim() || null,
      payer_kind: payerKind,
      paid_by_user_id: payerKind === "individual" ? paidByUserId : null,
      paid_by_institution_id:
        payerKind === "institution" ? paidByInstitutionId : null,
      reimbursement_status: reimbursementStatus,
      reimbursement_notes: reimbursementNotes.trim() || null,
      items: items.map((i) => ({
        ruhi_book_id: i.ruhi_book_id,
        language: i.language,
        storage_location_id: i.storage_location_id,
        quantity: i.quantity,
        unit_cost: i.unit_cost,
        unit_sale_price: i.unit_sale_price,
        notes: i.notes.trim() || null,
      })),
    });
    setSubmitting(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Order created");
    if ("data" in result && result.data) {
      router.push(`/clusters/${clusterId}/orders/${result.data.id}`);
    } else {
      router.push(`/clusters/${clusterId}/orders`);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">New Order</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="order_date">Order date</Label>
              <Input
                id="order_date"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="e.g. Bahá'í Distribution Service"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={payerKind === "individual"}
                onChange={() => handlePayerKindChange("individual")}
              />
              Individual
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={payerKind === "institution"}
                onChange={() => handlePayerKindChange("institution")}
              />
              Institution
            </label>
          </div>
          {payerKind === "individual" ? (
            <div className="space-y-2">
              <Label>Paid by</Label>
              <Select value={paidByUserId} onValueChange={setPaidByUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a cluster member" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Paid by institution</Label>
              <Select
                value={paidByInstitutionId}
                onValueChange={setPaidByInstitutionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an institution" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Reimbursement status</Label>
              <Select
                value={reimbursementStatus}
                onValueChange={(v) =>
                  setReimbursementStatus(v as ReimbursementStatus)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owed">Owed</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="reimbursed">Reimbursed</SelectItem>
                  <SelectItem value="not_required">Not required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reimbursement_notes">Reimbursement notes</Label>
              <Input
                id="reimbursement_notes"
                value={reimbursementNotes}
                onChange={(e) => setReimbursementNotes(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Items</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems((prev) => [...prev, emptyRow(locations)])}
          >
            <Plus className="mr-2 size-4" />
            Add line
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((row, idx) => (
            <div
              key={idx}
              className="grid gap-3 rounded-md border p-3 sm:grid-cols-[2fr_1fr_2fr_1fr_1fr_1fr_auto]"
            >
              <div className="space-y-1">
                <Label>Book</Label>
                <BookPicker
                  value={row.ruhi_book_id}
                  onChange={(id) => updateItem(idx, { ruhi_book_id: id })}
                  books={books}
                />
              </div>
              <div className="space-y-1">
                <Label>Language</Label>
                <LanguagePicker
                  value={row.language}
                  onChange={(lang) => updateItem(idx, { language: lang })}
                />
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <LocationPicker
                  value={row.storage_location_id}
                  onChange={(id) => updateItem(idx, { storage_location_id: id })}
                  locations={locations}
                />
              </div>
              <div className="space-y-1">
                <Label>Qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) =>
                    updateItem(idx, { quantity: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Unit cost</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.unit_cost}
                  onChange={(e) =>
                    updateItem(idx, { unit_cost: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Unit sale price</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.unit_sale_price}
                  onChange={(e) =>
                    updateItem(idx, {
                      unit_sale_price: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((prev) => prev.filter((_, i) => i !== idx))
                  }
                  aria-label="Remove line"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-6 border-t pt-3 text-sm">
            <div>
              <span className="text-muted-foreground">Total cost: </span>
              <span className="font-semibold">${totals.cost.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total sale: </span>
              <span className="font-semibold">${totals.sale.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Margin: </span>
              <span className="font-semibold">
                ${(totals.sale - totals.cost).toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.push(`/clusters/${clusterId}/orders`)}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Creating…" : "Create order"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Start dev server (if not running). Navigate to `/clusters/<cluster-id>/orders/new`. Fill in the form with one item, submit; expect redirect to detail page (which 404s for now — next task fixes that, but the list page should show the new row when you back out). Inspect the inventory page — the line's storage location should show incremented quantity.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(protected)/clusters/[id]/orders/new/"
git commit -m "feat(ui): add new-order form

Multi-line item entry with book/language/location pickers, running
cost/sale/margin totals, payer kind toggle, reimbursement status
default that follows payer kind, server action submission, toast
feedback, redirect to detail on success."
```

---

## Task 12: Add order detail page (read view + reimbursement dialog)

**Files:**
- Create: `src/app/(protected)/clusters/[id]/orders/[orderId]/page.tsx`
- Create: `src/app/(protected)/clusters/[id]/orders/[orderId]/order-detail-client.tsx`

- [ ] **Step 1: Create the server component**

`src/app/(protected)/clusters/[id]/orders/[orderId]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  BookOrder,
  BookOrderItem,
  ClusterMember,
  PayerInstitution,
  Profile,
  RuhiBook,
  StorageLocation,
} from "@/types/database";
import { OrderDetailClient } from "./order-detail-client";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string; orderId: string }>;
}) {
  const { id, orderId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();
  if (!membership) redirect("/dashboard");

  const [orderRes, itemsRes, booksRes, locationsRes, profilesRes, institutionsRes] =
    await Promise.all([
      supabase.from("book_orders").select("*").eq("id", orderId).single(),
      supabase
        .from("book_order_items")
        .select("*")
        .eq("order_id", orderId),
      supabase.from("ruhi_books").select("*").eq("is_active", true),
      supabase
        .from("storage_locations")
        .select("*")
        .eq("cluster_id", id),
      supabase.from("profiles").select("*"),
      supabase
        .from("payer_institutions")
        .select("*")
        .eq("cluster_id", id),
    ]);

  if (!orderRes.data) redirect(`/clusters/${id}/orders`);

  const order = orderRes.data as BookOrder;
  if (order.cluster_id !== id) redirect(`/clusters/${id}/orders`);

  const items = (itemsRes.data ?? []) as BookOrderItem[];
  const books = (booksRes.data ?? []) as RuhiBook[];
  const locations = (locationsRes.data ?? []) as StorageLocation[];
  const profiles = (profilesRes.data ?? []) as Profile[];
  const institutions = (institutionsRes.data ?? []) as PayerInstitution[];

  return (
    <OrderDetailClient
      clusterId={id}
      isAdmin={(membership as unknown as ClusterMember).cluster_role === "admin"}
      order={order}
      items={items}
      books={books}
      locations={locations}
      profiles={profiles}
      institutions={institutions}
    />
  );
}
```

- [ ] **Step 2: Create the client component (read view + reimbursement dialog)**

`src/app/(protected)/clusters/[id]/orders/[orderId]/order-detail-client.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { recordReimbursement } from "@/app/actions/orders";
import type {
  BookOrder,
  BookOrderItem,
  PayerInstitution,
  Profile,
  ReimbursementStatus,
  RuhiBook,
  StorageLocation,
} from "@/types/database";

const reimbursementVariant: Record<
  ReimbursementStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  not_required: "secondary",
  owed: "destructive",
  partial: "outline",
  reimbursed: "default",
};

const reimbursementLabel: Record<ReimbursementStatus, string> = {
  not_required: "Not required",
  owed: "Owed",
  partial: "Partial",
  reimbursed: "Reimbursed",
};

interface OrderDetailClientProps {
  clusterId: string;
  isAdmin: boolean;
  order: BookOrder;
  items: BookOrderItem[];
  books: RuhiBook[];
  locations: StorageLocation[];
  profiles: Profile[];
  institutions: PayerInstitution[];
}

export function OrderDetailClient({
  clusterId,
  isAdmin,
  order,
  items,
  books,
  locations,
  profiles,
  institutions,
}: OrderDetailClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rbStatus, setRbStatus] = useState<ReimbursementStatus>(
    order.reimbursement_status
  );
  const [rbAmount, setRbAmount] = useState<string>(
    String(order.reimbursed_amount)
  );
  const [rbNotes, setRbNotes] = useState(order.reimbursement_notes ?? "");

  const booksById = new Map(books.map((b) => [b.id, b]));
  const locationsById = new Map(locations.map((l) => [l.id, l]));
  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const institutionsById = new Map(institutions.map((i) => [i.id, i]));

  const payerName =
    order.payer_kind === "individual"
      ? profilesById.get(order.paid_by_user_id ?? "")?.full_name ??
        profilesById.get(order.paid_by_user_id ?? "")?.email ??
        "(unknown)"
      : institutionsById.get(order.paid_by_institution_id ?? "")?.name ??
        "(unknown)";

  const totals = items.reduce(
    (acc, i) => ({
      cost: acc.cost + Number(i.unit_cost) * i.quantity,
      sale: acc.sale + Number(i.unit_sale_price) * i.quantity,
    }),
    { cost: 0, sale: 0 }
  );

  const handleSaveReimbursement = () => {
    startTransition(async () => {
      const amount = Number(rbAmount);
      if (Number.isNaN(amount) || amount < 0) {
        toast.error("Amount must be a non-negative number");
        return;
      }
      const result = await recordReimbursement(order.id, {
        status: rbStatus,
        amount,
        notes: rbNotes.trim() || null,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Reimbursement updated");
      setDialogOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Order {order.order_date}
        </h1>
        <p className="text-muted-foreground">
          {order.supplier ?? "No supplier"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payer kind</span>
              <span>{order.payer_kind}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid by</span>
              <span>{payerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total cost</span>
              <span className="font-semibold">${totals.cost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total sale</span>
              <span className="font-semibold">${totals.sale.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Margin</span>
              <span className="font-semibold">
                ${(totals.sale - totals.cost).toFixed(2)}
              </span>
            </div>
            {order.notes && (
              <p className="pt-2 text-muted-foreground">{order.notes}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Reimbursement</CardTitle>
            <Badge variant={reimbursementVariant[order.reimbursement_status]}>
              {reimbursementLabel[order.reimbursement_status]}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reimbursed amount</span>
              <span className="font-semibold">
                ${Number(order.reimbursed_amount).toFixed(2)}
              </span>
            </div>
            {order.reimbursed_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reimbursed at</span>
                <span>{new Date(order.reimbursed_at).toLocaleString()}</span>
              </div>
            )}
            {order.reimbursement_notes && (
              <p className="pt-2 text-muted-foreground">
                {order.reimbursement_notes}
              </p>
            )}
            {isAdmin && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="mt-3">
                    Record reimbursement
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record reimbursement</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select
                        value={rbStatus}
                        onValueChange={(v) =>
                          setRbStatus(v as ReimbursementStatus)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owed">Owed</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="reimbursed">Reimbursed</SelectItem>
                          <SelectItem value="not_required">
                            Not required
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Amount reimbursed</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={rbAmount}
                        onChange={(e) => setRbAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Notes</Label>
                      <Textarea
                        value={rbNotes}
                        onChange={(e) => setRbNotes(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveReimbursement}
                      disabled={pending}
                    >
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Unit sale</TableHead>
                <TableHead className="text-right">Line cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    {booksById.get(it.ruhi_book_id)?.title ?? "—"}
                  </TableCell>
                  <TableCell>{it.language}</TableCell>
                  <TableCell>
                    {locationsById.get(it.storage_location_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{it.quantity}</TableCell>
                  <TableCell className="text-right">
                    ${Number(it.unit_cost).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${Number(it.unit_sale_price).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${(Number(it.unit_cost) * it.quantity).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Navigate to `/clusters/<id>/orders/<orderId>` for the order created in Task 11. Expect to see the summary card, reimbursement card with the "Record reimbursement" button (admins only), and items table.

Open the reimbursement dialog as an admin, change status to "Reimbursed" and amount to the total cost, save. Confirm the badge updates and `reimbursed_at` appears.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(protected)/clusters/[id]/orders/[orderId]/"
git commit -m "feat(ui): add order detail page with reimbursement dialog

Summary card (payer + totals + margin), reimbursement card with admin
Record-reimbursement dialog wired to recordReimbursement server
action, items table (read view). Inline editing is added in a
follow-up task."
```

---

## Task 13: Add inline item editing to the order detail page

**Files:**
- Modify: `src/app/(protected)/clusters/[id]/orders/[orderId]/order-detail-client.tsx`

- [ ] **Step 1: Add imports for the new actions and pickers**

At the top of `order-detail-client.tsx`, replace the action import line with:

```ts
import {
  addOrderItem,
  deleteOrderItem,
  recordReimbursement,
  updateOrderItem,
} from "@/app/actions/orders";
import { BookPicker } from "@/components/forms/book-picker";
import { LanguagePicker } from "@/components/forms/language-picker";
import { LocationPicker } from "@/components/forms/location-picker";
import { DEFAULT_BOOK_LANGUAGE } from "@/lib/languages";
import { Plus, Trash2 } from "lucide-react";
import type { BookLanguage } from "@/types/database";
```

(The existing `BookOrder`, `BookOrderItem`, etc. imports stay.)

- [ ] **Step 2: Add edit state and helpers near the top of the component**

Inside `OrderDetailClient`, just after the existing `useState` block, add:

```tsx
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    ruhi_book_id: string;
    language: BookLanguage;
    storage_location_id: string;
    quantity: number;
    unit_cost: number;
    unit_sale_price: number;
    notes: string;
  } | null>(null);

  const [addingNew, setAddingNew] = useState(false);
  const [newDraft, setNewDraft] = useState({
    ruhi_book_id: "",
    language: DEFAULT_BOOK_LANGUAGE as BookLanguage,
    storage_location_id: locations[0]?.id ?? "",
    quantity: 1,
    unit_cost: 0,
    unit_sale_price: 0,
    notes: "",
  });

  const startEdit = (item: BookOrderItem) => {
    setEditingId(item.id);
    setEditDraft({
      ruhi_book_id: item.ruhi_book_id,
      language: item.language as BookLanguage,
      storage_location_id: item.storage_location_id,
      quantity: item.quantity,
      unit_cost: Number(item.unit_cost),
      unit_sale_price: Number(item.unit_sale_price),
      notes: item.notes ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editingId || !editDraft) return;
    startTransition(async () => {
      const result = await updateOrderItem(editingId, {
        ruhi_book_id: editDraft.ruhi_book_id,
        language: editDraft.language,
        storage_location_id: editDraft.storage_location_id,
        quantity: editDraft.quantity,
        unit_cost: editDraft.unit_cost,
        unit_sale_price: editDraft.unit_sale_price,
        notes: editDraft.notes.trim() || null,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Item updated");
      cancelEdit();
      router.refresh();
    });
  };

  const removeItem = (id: string) => {
    if (!confirm("Delete this line? This will reverse inventory.")) return;
    startTransition(async () => {
      const result = await deleteOrderItem(id);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Item deleted");
      router.refresh();
    });
  };

  const submitNew = () => {
    if (!newDraft.ruhi_book_id || !newDraft.storage_location_id) {
      toast.error("Book and location are required");
      return;
    }
    startTransition(async () => {
      const result = await addOrderItem(order.id, {
        ruhi_book_id: newDraft.ruhi_book_id,
        language: newDraft.language,
        storage_location_id: newDraft.storage_location_id,
        quantity: newDraft.quantity,
        unit_cost: newDraft.unit_cost,
        unit_sale_price: newDraft.unit_sale_price,
        notes: newDraft.notes.trim() || null,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Item added");
      setAddingNew(false);
      setNewDraft({
        ruhi_book_id: "",
        language: DEFAULT_BOOK_LANGUAGE as BookLanguage,
        storage_location_id: locations[0]?.id ?? "",
        quantity: 1,
        unit_cost: 0,
        unit_sale_price: 0,
        notes: "",
      });
      router.refresh();
    });
  };
```

- [ ] **Step 3: Replace the items `Card` with an editable version**

Replace the entire items `<Card>` block (the one starting `<CardHeader>` `<CardTitle className="text-base">Items</CardTitle>`) with:

```tsx
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Items</CardTitle>
          {isAdmin && !addingNew && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingNew(true)}
            >
              <Plus className="mr-2 size-4" />
              Add line
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Unit sale</TableHead>
                <TableHead className="text-right">Line cost</TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const isEditing = editingId === it.id && editDraft;
                if (isEditing && editDraft) {
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <BookPicker
                          value={editDraft.ruhi_book_id}
                          onChange={(id) =>
                            setEditDraft({ ...editDraft, ruhi_book_id: id })
                          }
                          books={books}
                        />
                      </TableCell>
                      <TableCell>
                        <LanguagePicker
                          value={editDraft.language}
                          onChange={(l) =>
                            setEditDraft({ ...editDraft, language: l })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <LocationPicker
                          value={editDraft.storage_location_id}
                          onChange={(id) =>
                            setEditDraft({
                              ...editDraft,
                              storage_location_id: id,
                            })
                          }
                          locations={locations}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={editDraft.quantity}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              quantity: Number(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={editDraft.unit_cost}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              unit_cost: Number(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={editDraft.unit_sale_price}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              unit_sale_price: Number(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelEdit}
                          disabled={pending}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveEdit}
                          disabled={pending}
                        >
                          Save
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                }
                return (
                  <TableRow key={it.id}>
                    <TableCell>
                      {booksById.get(it.ruhi_book_id)?.title ?? "—"}
                    </TableCell>
                    <TableCell>{it.language}</TableCell>
                    <TableCell>
                      {locationsById.get(it.storage_location_id)?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">{it.quantity}</TableCell>
                    <TableCell className="text-right">
                      ${Number(it.unit_cost).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${Number(it.unit_sale_price).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${(Number(it.unit_cost) * it.quantity).toFixed(2)}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="space-x-1 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(it)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeItem(it.id)}
                          aria-label="Delete line"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {addingNew && (
                <TableRow>
                  <TableCell>
                    <BookPicker
                      value={newDraft.ruhi_book_id}
                      onChange={(id) =>
                        setNewDraft({ ...newDraft, ruhi_book_id: id })
                      }
                      books={books}
                    />
                  </TableCell>
                  <TableCell>
                    <LanguagePicker
                      value={newDraft.language}
                      onChange={(l) =>
                        setNewDraft({ ...newDraft, language: l })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <LocationPicker
                      value={newDraft.storage_location_id}
                      onChange={(id) =>
                        setNewDraft({ ...newDraft, storage_location_id: id })
                      }
                      locations={locations}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={newDraft.quantity}
                      onChange={(e) =>
                        setNewDraft({
                          ...newDraft,
                          quantity: Number(e.target.value),
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newDraft.unit_cost}
                      onChange={(e) =>
                        setNewDraft({
                          ...newDraft,
                          unit_cost: Number(e.target.value),
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newDraft.unit_sale_price}
                      onChange={(e) =>
                        setNewDraft({
                          ...newDraft,
                          unit_sale_price: Number(e.target.value),
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddingNew(false)}
                      disabled={pending}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={submitNew} disabled={pending}>
                      Add
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manually verify**

On the order detail page (as an admin), click Edit on a row, change the quantity, hit Save. Confirm the row updates and the inventory page for that location reflects the new total.

Try to reduce the quantity by more than is currently in inventory (e.g., if the location currently has the same number that was ordered AND a fulfillment has already pulled some) — expect a toast error like "Insufficient stock at location to reduce quantity".

Click the trash icon — confirm the prompt — and verify the row disappears and inventory decrements.

Click Add line — fill in book/location/quantity — Add. Verify the new row appears and inventory increments.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(protected)/clusters/[id]/orders/[orderId]/order-detail-client.tsx"
git commit -m "feat(ui): inline item editing on order detail page

Edit/Save/Cancel per row wired to updateOrderItem; delete confirms
then calls deleteOrderItem; Add line opens an inline new-row form
wired to addOrderItem. Server errors surface as toasts; success
refreshes the page so totals and inventory stay accurate."
```

---

## Task 14: Add payer institutions admin page

**Files:**
- Create: `src/app/(protected)/clusters/[id]/orders/payer-institutions/page.tsx`
- Create: `src/app/(protected)/clusters/[id]/orders/payer-institutions/institutions-client.tsx`

- [ ] **Step 1: Create the server component**

`src/app/(protected)/clusters/[id]/orders/payer-institutions/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClusterMember, PayerInstitution } from "@/types/database";
import { InstitutionsClient } from "./institutions-client";

export default async function PayerInstitutionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!membership) redirect("/dashboard");
  const m = membership as unknown as ClusterMember;
  if (m.cluster_role !== "admin") {
    redirect(`/clusters/${id}/orders`);
  }

  const { data } = await supabase
    .from("payer_institutions")
    .select("*")
    .eq("cluster_id", id)
    .order("sort_order")
    .order("name");

  const institutions = (data ?? []) as PayerInstitution[];

  return <InstitutionsClient clusterId={id} institutions={institutions} />;
}
```

- [ ] **Step 2: Create the client component**

`src/app/(protected)/clusters/[id]/orders/payer-institutions/institutions-client.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createInstitution,
  updateInstitution,
} from "@/app/actions/payer_institutions";
import type { PayerInstitution } from "@/types/database";

interface InstitutionsClientProps {
  clusterId: string;
  institutions: PayerInstitution[];
}

export function InstitutionsClient({
  clusterId,
  institutions,
}: InstitutionsClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createInstitution(clusterId, {
        name,
        description: description.trim() || null,
        sort_order: sortOrder,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Institution added");
      setName("");
      setDescription("");
      setSortOrder(0);
      setOpen(false);
      router.refresh();
    });
  };

  const toggleActive = (id: string, currentActive: boolean) => {
    startTransition(async () => {
      const result = await updateInstitution(id, { is_active: !currentActive });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Payer Institutions
          </h1>
          <p className="text-muted-foreground">
            Configure institutional payers (ATC, LSA, etc.) available on
            orders for this cluster.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" />
              Add institution
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add institution</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. LSA of Springfield"
                />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={pending || !name.trim()}>
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Institutions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Sort</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {institutions.map((inst) => (
                <TableRow key={inst.id}>
                  <TableCell>{inst.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {inst.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{inst.sort_order}</TableCell>
                  <TableCell>
                    {inst.is_active ? "Active" : "Inactive"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleActive(inst.id, inst.is_active)}
                      disabled={pending}
                    >
                      {inst.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Navigate to `/clusters/<id>/orders/payer-institutions` as an admin. Expect to see the four seeded defaults (ATC, LSA, Regional Council, National Fund). Click "Add institution", create one (e.g. "LSA of Springfield"), confirm it appears. Click "Deactivate" on it, confirm status flips to Inactive.

Navigate to the new-order form for the same cluster and confirm the deactivated institution doesn't appear in the dropdown (the form only shows `is_active = true`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(protected)/clusters/[id]/orders/payer-institutions/"
git commit -m "feat(ui): add payer institutions admin page

Cluster admin can add new institutions and toggle active state.
Deactivate (rather than delete) preserves historical orders that
reference the institution."
```

---

## Task 15: Add Orders card to cluster detail page

**Files:**
- Modify: `src/app/(protected)/clusters/[id]/page.tsx`

- [ ] **Step 1: Read the current state of `page.tsx`**

You already know its structure (you read it during planning). The change adds an "Orders" stat fetch and nav card. Also add an admin-only link to the payer institutions admin page.

- [ ] **Step 2: Add the new stat fetch in the `Promise.all` block**

Find the `Promise.all([...])` block in `src/app/(protected)/clusters/[id]/page.tsx` (around lines 61-79). Add a fifth fetch for orders count and capture it:

Change:
```ts
  const [inventoryResult, locationsResult, requestsResult, membersResult] =
    await Promise.all([
      supabase.from("inventory").select("quantity").eq("cluster_id", id),
      supabase
        .from("storage_locations")
        .select("id")
        .eq("cluster_id", id)
        .eq("is_active", true),
      supabase
        .from("book_requests")
        .select("id")
        .eq("cluster_id", id)
        .eq("status", "pending"),
      supabase
        .from("cluster_members")
        .select("id")
        .eq("cluster_id", id)
        .eq("status", "active"),
    ]);
```

To:
```ts
  const [
    inventoryResult,
    locationsResult,
    requestsResult,
    membersResult,
    ordersResult,
  ] = await Promise.all([
    supabase.from("inventory").select("quantity").eq("cluster_id", id),
    supabase
      .from("storage_locations")
      .select("id")
      .eq("cluster_id", id)
      .eq("is_active", true),
    supabase
      .from("book_requests")
      .select("id")
      .eq("cluster_id", id)
      .eq("status", "pending"),
    supabase
      .from("cluster_members")
      .select("id")
      .eq("cluster_id", id)
      .eq("status", "active"),
    supabase
      .from("book_orders")
      .select("id, reimbursement_status")
      .eq("cluster_id", id),
  ]);
```

And add the derived counts after the existing `pendingRequests` calculation:

```ts
  const totalOrders = ordersResult.data?.length ?? 0;
  const owedOrders = (ordersResult.data ?? []).filter(
    (o) => o.reimbursement_status === "owed" || o.reimbursement_status === "partial"
  ).length;
```

- [ ] **Step 3: Add a `ShoppingCart` icon import and the Orders nav item**

In the lucide-react import block at the top of the file, add `ShoppingCart`:

```ts
import {
  BookOpen,
  MapPin,
  Users,
  Package,
  ClipboardList,
  History,
  ShoppingCart,
} from "lucide-react";
```

In the `navItems` array (around lines 90-127), insert an `Orders` item between `Requests` and `Request Books`:

```ts
    {
      title: "Orders",
      description:
        owedOrders > 0
          ? `${totalOrders} total, ${owedOrders} awaiting reimbursement`
          : `${totalOrders} total`,
      href: `/clusters/${id}/orders`,
      icon: ShoppingCart,
    },
```

- [ ] **Step 4: Add admin link for payer institutions**

In the admin actions block at the bottom of the file (around lines 175-181), append a second button:

```tsx
      {isAdmin && (
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/clusters/${id}/members`}>Invite Members</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/clusters/${id}/orders/payer-institutions`}>
              Manage Payer Institutions
            </Link>
          </Button>
        </div>
      )}
```

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Manually verify**

Navigate to `/clusters/<id>`. Expect a new "Orders" card showing the order count. As an admin, expect a "Manage Payer Institutions" button alongside "Invite Members". Click the Orders card and confirm it routes to `/clusters/<id>/orders`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(protected)/clusters/[id]/page.tsx"
git commit -m "feat(ui): add Orders card to cluster detail page

Adds a stat fetch for orders + reimbursement-awaiting counts, an
Orders nav card with ShoppingCart icon, and an admin link to the
Payer Institutions admin page."
```

---

## Task 16: Full end-to-end verification

**Files:** none changed in this task.

- [ ] **Step 1: Run a clean build**

Run: `npm run build`
Expected: build succeeds with no errors. Note any TypeScript errors and fix them before continuing.

- [ ] **Step 2: Walk the happy path in the browser**

With the dev server running, do this exact sequence:

1. Sign in as a cluster admin.
2. Navigate to `/clusters/<id>`. Confirm the new "Orders" card appears (count: 0).
3. Click "Orders". Confirm the empty state appears.
4. Click "New Order". Fill in:
   - Order date: today
   - Supplier: "Test Supplier"
   - Payer: Individual, select yourself
   - One item: any book, English, any location, quantity 5, unit cost 4.00, unit sale price 6.00
5. Click "Create order". Confirm redirect to the detail page.
6. Confirm: payer name is correct, total cost = $20.00, total sale = $30.00, margin = $10.00, reimbursement status = Owed.
7. Click "Record reimbursement". Set status to "Reimbursed", amount to 20. Save.
8. Confirm: status badge becomes "Reimbursed", reimbursed_at populates with current time.
9. Click "Edit" on the item row. Change quantity from 5 to 7. Save.
10. Confirm: row updates to 7, line cost becomes $28.00.
11. Navigate to `/clusters/<id>/inventory`. Confirm the location used in step 4 now shows the book with quantity 7 (or 7 more than it had before this test).
12. Back on the order detail page, click the trash icon on the row. Confirm the prompt, then confirm: row disappears, inventory reverts.
13. Click "Add line". Add a second book to the same order with quantity 2, unit cost 5, unit sale 8. Add. Confirm appears.
14. Navigate to `/clusters/<id>/orders`. Confirm the list shows the order with the right totals and reimbursement badge.

- [ ] **Step 3: Walk the error paths**

1. **Insufficient stock on edit**: from the order detail page, manually go to the inventory page first and reduce the inventory quantity for one of your order's items below what was ordered (use the inventory edit UI). Now come back to the order and try to edit the item's quantity downward by more than what's left. Expect a "Insufficient stock at location" toast.
2. **Missing payer on create**: start a new order, choose "Individual" but don't pick a member. Try to create. Expect toast "Select who paid for this order".
3. **Empty item**: start a new order, leave the book blank. Try to create. Expect toast about missing book / location.
4. **Deactivated institution doesn't show in dropdown**: at `/orders/payer-institutions`, deactivate one institution. Start a new order with payer kind Institution. Confirm the deactivated one doesn't appear.

- [ ] **Step 4: Check `inventory_log` provenance directly**

In Supabase Studio SQL editor, run:

```sql
SELECT change_type, quantity_change, related_order_item_id, notes, created_at
FROM inventory_log
WHERE cluster_id = '<your-test-cluster-id>'
ORDER BY created_at DESC
LIMIT 10;
```

Confirm: rows from step 4 (creation) have `change_type='ordered'` with `related_order_item_id` set. Rows from step 9 (edit) and step 12 (delete) have `change_type='adjustment'` with the same `related_order_item_id`.

- [ ] **Step 5: Verify the cluster-creation trigger by creating a new cluster**

As a platform admin, create a brand-new cluster (via the existing admin UI). Then in SQL:

```sql
SELECT name FROM payer_institutions
WHERE cluster_id = '<new-cluster-id>'
ORDER BY sort_order;
```

Expected: 4 rows — ATC, LSA, Regional Council, National Fund.

- [ ] **Step 6: Commit a verification note**

Nothing to commit (this is a verification-only task). If you found bugs and fixed them inline, commit those fixes here.

If everything passed:

```bash
# No-op task — verification only. Confirm the feature works end-to-end.
echo "Verification complete"
```

---

## Final notes for the executor

- **Atomicity caveat**: multi-write actions (`createOrder`, `updateOrderItem`, `deleteOrderItem`) aren't transactional. If a mid-flight error happens, inventory and the order item rows may diverge. This matches the existing `fulfillRequest` pattern. Don't fix this in v1 — it's tracked as a follow-up in the spec.
- **No automated tests**: the project has no test framework. Verification is manual (Task 16). If a future maintainer adds Vitest or similar, the existing action shapes (return `{ data | error }` discriminated unions) make them easy to unit-test.
- **Type-check before every commit**: `npx tsc --noEmit` is the cheapest signal that nothing's broken. Skipping it and discovering a type error two tasks later is far more expensive than running it each time.
- **If a task gets stuck**: don't try to bypass an error by writing around it. Investigate, fix root-cause, then keep going. Common issues:
  - **Type errors after Task 2**: `database.ts` was hand-edited. Cross-check the new types' shape against the migration in Task 1.
  - **RLS denying operations**: confirm the calling user is an active cluster member with `cluster_role='admin'`. Check `cluster_members` for the right row.
  - **Inventory not incrementing**: check the `inventory` row's UNIQUE constraint — `(storage_location_id, ruhi_book_id)` plus language/publication_status are checked by the action's lookup query.
- **Commit messages**: each task's suggested commit message is a starting point. Adjust if the work in the task diverged from what's written.
