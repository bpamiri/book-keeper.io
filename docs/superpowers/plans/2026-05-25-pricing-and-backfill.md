# Pricing Catalog & Backfill Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-cluster pricing catalog (default cost + sale price per book + language) that the new-order form pre-fills from, plus a `is_backfill` flag on `book_orders` driven by an "Already stocked" checkbox that creates documentation-only orders (no inventory write).

**Architecture:** Additive. One new table (`cluster_book_pricing`), one new column on `book_orders`, one new actions file (`pricing.ts`), one new admin page, and modifications to the existing new-order form, order list, order detail, and cluster home page.

**Tech Stack:** Same as PR #19 — Next.js 16, TypeScript, Supabase, react-hook-form (not actually used in this plan), shadcn/ui, sonner, Tailwind 4.

**Reference:** Full design at [docs/superpowers/specs/2026-05-25-pricing-and-backfill-design.md](../specs/2026-05-25-pricing-and-backfill-design.md).

**Verification:** No automated tests. Each task ends with `npx tsc --noEmit && npm run lint` clean, plus the final task does `npm run build` and a manual walkthrough handoff.

**Branch:** All commits land on `claude/kind-robinson-f95d8d` (the same PR #19 branch).

---

## Task 1: Migration 012 — pricing table + is_backfill column

**Files:**
- Create: `supabase/migrations/012_pricing_and_backfill.sql`

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Sanity check against existing migrations**

Confirm the referenced helpers exist:
- `update_updated_at()` — defined in `001_initial_schema.sql`
- `is_platform_admin()` / `is_cluster_member()` / `is_cluster_admin()` — defined in `001_initial_schema.sql`
- `book_language` enum — defined in `007_add_inventory_language.sql`

Confirm the new file uses the same comment-banner style as `011_book_orders.sql`.

- [ ] **Step 3: Do NOT attempt to apply the migration**

The implementer doesn't have DB credentials. The user applies the migration. Note that explicitly in the report.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_pricing_and_backfill.sql
git commit -m "feat(db): add cluster_book_pricing + book_orders.is_backfill

Migration 012 adds:
- cluster_book_pricing per-cluster catalog (book + language -> default cost / sale price)
- book_orders.is_backfill flag for documentation-only orders
- RLS policies on cluster_book_pricing matching the established cluster-scoped pattern"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add the `cluster_book_pricing` table type**

Inside the `Tables` object in `database.ts`, after `book_order_items`, add:

```ts
      cluster_book_pricing: {
        Row: {
          id: string;
          cluster_id: string;
          ruhi_book_id: string;
          language: BookLanguage;
          default_cost: number;
          default_sale_price: number;
          notes: string | null;
          updated_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cluster_id: string;
          ruhi_book_id: string;
          language: BookLanguage;
          default_cost: number;
          default_sale_price: number;
          notes?: string | null;
          updated_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cluster_id?: string;
          ruhi_book_id?: string;
          language?: BookLanguage;
          default_cost?: number;
          default_sale_price?: number;
          notes?: string | null;
          updated_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cluster_book_pricing_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "clusters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cluster_book_pricing_ruhi_book_id_fkey";
            columns: ["ruhi_book_id"];
            isOneToOne: false;
            referencedRelation: "ruhi_books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cluster_book_pricing_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
```

- [ ] **Step 2: Add `is_backfill` to the `book_orders` table type**

Find the `book_orders` block. Add `is_backfill: boolean;` to the `Row` (after `created_by` to keep the field order matching the SQL), `is_backfill?: boolean;` to `Insert` and `Update`.

- [ ] **Step 3: Add the row type alias at the bottom of the file**

After `BookOrderItem`:

```ts
export type ClusterBookPricing = Tables<'cluster_book_pricing'>;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "types: add cluster_book_pricing + book_orders.is_backfill

Adds the Row/Insert/Update types for the new pricing catalog table
and the is_backfill flag column on book_orders. Adds the
ClusterBookPricing row alias."
```

---

## Task 3: pricing.ts server actions

**Files:**
- Create: `src/app/actions/pricing.ts`

- [ ] **Step 1: Create the file**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { BookLanguage } from '@/types/database'

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
      'Only cluster admins or platform admins can manage pricing' as const,
  }
}

export async function listPricing(clusterId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('cluster_book_pricing')
      .select('*')
      .eq('cluster_id', clusterId)

    if (error) return { error: error.message }
    return { data: data ?? [] }
  } catch {
    return { error: 'Failed to list pricing' }
  }
}

export async function upsertPricing(
  clusterId: string,
  data: {
    ruhi_book_id: string
    language: BookLanguage
    default_cost: number
    default_sale_price: number
    notes?: string | null
  }
) {
  try {
    if (data.default_cost < 0) {
      return { error: 'Default cost must be non-negative' }
    }
    if (data.default_sale_price < 0) {
      return { error: 'Default sale price must be non-negative' }
    }

    const adminCheck = await verifyClusterAdmin(clusterId)
    if ('error' in adminCheck) return { error: adminCheck.error }
    const { user, supabase } = adminCheck

    const { data: upserted, error } = await supabase
      .from('cluster_book_pricing')
      .upsert(
        {
          cluster_id: clusterId,
          ruhi_book_id: data.ruhi_book_id,
          language: data.language,
          default_cost: data.default_cost,
          default_sale_price: data.default_sale_price,
          notes: data.notes ?? null,
          updated_by: user.id,
        },
        { onConflict: 'cluster_id,ruhi_book_id,language' }
      )
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${clusterId}/orders/pricing`)
    revalidatePath(`/clusters/${clusterId}/orders/new`)
    return { data: upserted }
  } catch {
    return { error: 'Failed to save pricing' }
  }
}

export async function deletePricing(id: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: current, error: fetchError } = await supabase
      .from('cluster_book_pricing')
      .select('cluster_id')
      .eq('id', id)
      .single()

    if (fetchError || !current) return { error: 'Pricing row not found' }

    const adminCheck = await verifyClusterAdmin(current.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }

    const { error: deleteError } = await supabase
      .from('cluster_book_pricing')
      .delete()
      .eq('id', id)

    if (deleteError) return { error: deleteError.message }

    revalidatePath(`/clusters/${current.cluster_id}/orders/pricing`)
    revalidatePath(`/clusters/${current.cluster_id}/orders/new`)
    return { data: { success: true } }
  } catch {
    return { error: 'Failed to delete pricing row' }
  }
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean (5 pre-existing warnings in unrelated files are fine).

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/pricing.ts
git commit -m "feat(actions): add cluster_book_pricing CRUD

list (any cluster member), upsert / delete (cluster admin).
Upsert keys on (cluster_id, ruhi_book_id, language) so the same
(book, language) combo always has at most one row per cluster."
```

---

## Task 4: createOrder accepts `already_stocked` flag

**Files:**
- Modify: `src/app/actions/orders.ts`

- [ ] **Step 1: Update the `createOrder` parameter type**

Find the signature of `createOrder` and add `already_stocked?: boolean` after `reimbursement_notes?: string | null`:

```ts
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
  already_stocked?: boolean
  items: Array<{
    ...
  }>
}) {
```

- [ ] **Step 2: Persist `is_backfill` on the order header**

Find the `book_orders` insert call. Add `is_backfill: data.already_stocked ?? false,` to the inserted object (after `reimbursement_notes`).

- [ ] **Step 3: Skip the inventory write when `already_stocked`**

Inside the per-item loop, find the block that starts with `// Increment inventory at the target location` and ends after the `inventory_log` insert. Wrap that whole block in:

```ts
      if (!data.already_stocked) {
        // Increment inventory at the target location
        const { data: existing } = await supabase
          .from('inventory')
          .select('id, quantity')
          ...
        // ... existing inventory upsert + inventory_log insert ...
      }
```

The item insert (`book_order_items`) MUST still run regardless of `already_stocked` — only the inventory side is skipped.

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/orders.ts
git commit -m "feat(actions): createOrder supports backfill mode

New optional already_stocked flag. When true, the order header gets
is_backfill=true and the per-item loop skips the inventory upsert
and inventory_log insert (items are still written). This lets
admins document who paid for pre-existing stock without
double-counting the inventory."
```

---

## Task 5: Pricing admin page

**Files:**
- Create: `src/app/(protected)/clusters/[id]/orders/pricing/page.tsx`
- Create: `src/app/(protected)/clusters/[id]/orders/pricing/pricing-client.tsx`

- [ ] **Step 1: Create the server component**

`src/app/(protected)/clusters/[id]/orders/pricing/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  ClusterBookPricing,
  ClusterMember,
  RuhiBook,
} from "@/types/database";
import { PricingClient } from "./pricing-client";

export default async function PricingPage({
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
  const isAdmin = m.cluster_role === "admin";

  const [pricingRes, booksRes] = await Promise.all([
    supabase
      .from("cluster_book_pricing")
      .select("*")
      .eq("cluster_id", id),
    supabase
      .from("ruhi_books")
      .select("*")
      .eq("is_active", true),
  ]);

  const pricing = (pricingRes.data ?? []) as ClusterBookPricing[];
  const books = (booksRes.data ?? []) as RuhiBook[];

  return (
    <PricingClient
      clusterId={id}
      isAdmin={isAdmin}
      pricing={pricing}
      books={books}
    />
  );
}
```

- [ ] **Step 2: Create the client component**

`src/app/(protected)/clusters/[id]/orders/pricing/pricing-client.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { BookPicker } from "@/components/forms/book-picker";
import { LanguagePicker } from "@/components/forms/language-picker";
import { upsertPricing, deletePricing } from "@/app/actions/pricing";
import { DEFAULT_BOOK_LANGUAGE } from "@/lib/languages";
import type {
  BookLanguage,
  ClusterBookPricing,
  RuhiBook,
} from "@/types/database";

interface PricingClientProps {
  clusterId: string;
  isAdmin: boolean;
  pricing: ClusterBookPricing[];
  books: RuhiBook[];
}

export function PricingClient({
  clusterId,
  isAdmin,
  pricing,
  books,
}: PricingClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bookId, setBookId] = useState("");
  const [language, setLanguage] = useState<BookLanguage>(DEFAULT_BOOK_LANGUAGE);
  const [cost, setCost] = useState<string>("0");
  const [salePrice, setSalePrice] = useState<string>("0");
  const [notes, setNotes] = useState("");

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const booksById = new Map(books.map((b) => [b.id, b]));

  const resetForm = () => {
    setEditingId(null);
    setBookId("");
    setLanguage(DEFAULT_BOOK_LANGUAGE);
    setCost("0");
    setSalePrice("0");
    setNotes("");
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (row: ClusterBookPricing) => {
    setEditingId(row.id);
    setBookId(row.ruhi_book_id);
    setLanguage(row.language);
    setCost(String(row.default_cost));
    setSalePrice(String(row.default_sale_price));
    setNotes(row.notes ?? "");
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!bookId) {
      toast.error("Pick a book");
      return;
    }
    const costNum = Number(cost);
    const saleNum = Number(salePrice);
    if (Number.isNaN(costNum) || costNum < 0) {
      toast.error("Cost must be a non-negative number");
      return;
    }
    if (Number.isNaN(saleNum) || saleNum < 0) {
      toast.error("Sale price must be a non-negative number");
      return;
    }
    startTransition(async () => {
      const result = await upsertPricing(clusterId, {
        ruhi_book_id: bookId,
        language,
        default_cost: costNum,
        default_sale_price: saleNum,
        notes: notes.trim() || null,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editingId ? "Pricing updated" : "Pricing added");
      setDialogOpen(false);
      resetForm();
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!deleteTargetId) return;
    startTransition(async () => {
      const result = await deletePricing(deleteTargetId);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Pricing deleted");
      setDeleteTargetId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <span>/</span>
            <Link href={`/clusters/${clusterId}`} className="hover:underline">
              Cluster
            </Link>
            <span>/</span>
            <Link
              href={`/clusters/${clusterId}/orders`}
              className="hover:underline"
            >
              Orders
            </Link>
            <span>/</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Pricing Catalog</h1>
          <p className="text-muted-foreground">
            Default cost and sale price per book and language. New orders
            pre-fill these values.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openAdd}>
            <Plus className="mr-2 size-4" />
            Add pricing
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prices</CardTitle>
        </CardHeader>
        <CardContent>
          {pricing.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
              No pricing configured yet.
              {isAdmin && " Click Add pricing to set default prices."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead className="text-right">Default cost</TableHead>
                  <TableHead className="text-right">Default sale</TableHead>
                  <TableHead>Notes</TableHead>
                  {isAdmin && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricing.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {booksById.get(row.ruhi_book_id)?.title ?? "—"}
                    </TableCell>
                    <TableCell>{row.language}</TableCell>
                    <TableCell className="text-right">
                      ${Number(row.default_cost).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${Number(row.default_sale_price).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.notes ?? "—"}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="space-x-1 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(row)}
                          aria-label="Edit pricing"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTargetId(row.id)}
                          aria-label="Delete pricing"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) resetForm();
          setDialogOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit pricing" : "Add pricing"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Book</Label>
              <BookPicker value={bookId} onChange={setBookId} books={books} />
            </div>
            <div className="space-y-1">
              <Label>Language</Label>
              <LanguagePicker value={language} onChange={setLanguage} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1">
                <Label>Default cost</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Label>Default sale price</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTargetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this pricing row?</AlertDialogTitle>
            <AlertDialogDescription>
              Future orders will no longer pre-fill cost and sale price for
              this book and language combination. Existing orders are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/clusters/[id]/orders/pricing/"
git commit -m "feat(ui): add pricing catalog admin page

Cluster admins can add, edit, and delete default cost/sale price rows
for any (book, language) combination. Uses the upsert action so
adding a row that conflicts on (cluster, book, language) replaces
the existing one. AlertDialog confirms deletes, matching the
established pattern."
```

---

## Task 6: New-order form — pricing lookup + "already stocked" checkbox

**Files:**
- Modify: `src/app/(protected)/clusters/[id]/orders/new/page.tsx`
- Modify: `src/app/(protected)/clusters/[id]/orders/new/new-order-form.tsx`

- [ ] **Step 1: Server page — fetch pricing rows**

In `new/page.tsx`, add a fifth fetch to the `Promise.all` that gets `cluster_book_pricing` for this cluster:

Find:
```ts
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
```

Replace with:
```ts
  const [booksRes, locationsRes, membersRes, institutionsRes, pricingRes] =
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
      supabase
        .from("cluster_book_pricing")
        .select("*")
        .eq("cluster_id", id),
    ]);
```

Add the import:
```ts
import type {
  ClusterBookPricing,
  ...
} from "@/types/database";
```

After the existing data assignments, add:
```ts
  const pricing = (pricingRes.data ?? []) as ClusterBookPricing[];
```

Pass it to the form:
```tsx
    <NewOrderForm
      clusterId={id}
      books={books}
      locations={locations}
      profiles={memberProfiles}
      institutions={institutions}
      pricing={pricing}
    />
```

- [ ] **Step 2: Client form — accept pricing prop and build lookup map**

In `new-order-form.tsx`, add `ClusterBookPricing` to the imports from `@/types/database`. Add the prop:

```ts
interface NewOrderFormProps {
  clusterId: string;
  books: RuhiBook[];
  locations: StorageLocation[];
  profiles: Profile[];
  institutions: PayerInstitution[];
  pricing: ClusterBookPricing[];
}
```

Inside the component, build the lookup map once near the top of the function body:

```ts
  const pricingMap = new Map<string, ClusterBookPricing>(
    pricing.map((p) => [`${p.ruhi_book_id}|${p.language}`, p])
  );
```

- [ ] **Step 3: Update item changes to pre-fill from pricing**

The existing `updateItem(idx, patch)` mutates a single field. To pre-fill cost/sale when a book or language changes, wrap that logic:

Replace:
```ts
  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  };
```

With:
```ts
  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const updated = { ...row, ...patch };

        // If the book or language changed, look up pricing and pre-fill
        // cost/sale (only when the user hasn't already typed values for
        // the line — we don't want to wipe their input).
        const bookOrLangChanged =
          ("ruhi_book_id" in patch && patch.ruhi_book_id !== row.ruhi_book_id) ||
          ("language" in patch && patch.language !== row.language);

        if (bookOrLangChanged) {
          const key = `${updated.ruhi_book_id}|${updated.language}`;
          const match = pricingMap.get(key);
          if (match) {
            // Only pre-fill when the existing values are still at the
            // empty-row defaults (cost === 0 AND sale_price === 0).
            // Otherwise respect what the user already typed.
            if (row.unit_cost === 0 && row.unit_sale_price === 0) {
              updated.unit_cost = Number(match.default_cost);
              updated.unit_sale_price = Number(match.default_sale_price);
            }
          }
        }

        return updated;
      })
    );
  };
```

- [ ] **Step 4: Add the "Already stocked" checkbox**

Below the items Card and above the bottom button row, add:

```tsx
      <Card>
        <CardContent className="flex items-center gap-3 pt-6">
          <input
            id="already_stocked"
            type="checkbox"
            checked={alreadyStocked}
            onChange={(e) => setAlreadyStocked(e.target.checked)}
            className="size-4"
          />
          <Label htmlFor="already_stocked" className="cursor-pointer">
            These books are already in stock (don&apos;t update inventory).
            Use this to retroactively document who paid for existing books.
          </Label>
        </CardContent>
      </Card>
```

Add the state above the JSX:
```ts
  const [alreadyStocked, setAlreadyStocked] = useState(false);
```

- [ ] **Step 5: Pass the flag to `createOrder`**

In `handleSubmit`, find the `createOrder({` call and add `already_stocked: alreadyStocked,` to the data object (anywhere before `items`).

- [ ] **Step 6: Type-check + lint**

- [ ] **Step 7: Commit**

```bash
git add "src/app/(protected)/clusters/[id]/orders/new/"
git commit -m "feat(ui): pricing lookup pre-fill + 'already stocked' checkbox

The new-order form receives the cluster's pricing catalog and pre-fills
each line's unit_cost / unit_sale_price when the book + language match
an entry, but only if the user hasn't typed a non-zero value yet
(don't overwrite user input).

The 'Already stocked' checkbox routes the order through the backfill
path: createOrder sets is_backfill=true and skips inventory writes for
all items."
```

---

## Task 7: "Backfill" badge on list and detail pages

**Files:**
- Modify: `src/app/(protected)/clusters/[id]/orders/orders-client.tsx`
- Modify: `src/app/(protected)/clusters/[id]/orders/[orderId]/order-detail-client.tsx`

- [ ] **Step 1: Orders list — show "Backfill" badge in the date cell**

In `orders-client.tsx`, find the row rendering. The current "Date" cell renders just `{order.order_date}`. Change it to:

```tsx
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{order.order_date}</span>
                        {order.is_backfill && (
                          <Badge variant="outline" className="text-xs">
                            Backfill
                          </Badge>
                        )}
                      </div>
                    </TableCell>
```

`Badge` is already imported in this file.

- [ ] **Step 2: Order detail — show "Backfill" badge near the title**

In `order-detail-client.tsx`, find the heading block:

```tsx
        <h1 className="text-2xl font-bold tracking-tight">
          Order {order.order_date}
        </h1>
        <p className="text-muted-foreground">
          {order.supplier ?? "No supplier"}
        </p>
```

Change to:

```tsx
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            Order {order.order_date}
          </h1>
          {order.is_backfill && (
            <Badge variant="outline">Backfill</Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          {order.supplier ?? "No supplier"}
        </p>
```

`Badge` is already imported.

- [ ] **Step 3: Type-check + lint**

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/clusters/[id]/orders/orders-client.tsx" "src/app/(protected)/clusters/[id]/orders/[orderId]/order-detail-client.tsx"
git commit -m "feat(ui): show 'Backfill' badge on backfill orders

List view shows the badge next to the date; detail view shows it
next to the title. Makes documentation-only orders distinguishable
from real-time purchases without changing any other UI."
```

---

## Task 8: Cluster home — "Manage Pricing" admin link + final verification

**Files:**
- Modify: `src/app/(protected)/clusters/[id]/page.tsx`

- [ ] **Step 1: Add the third admin button**

Find the admin actions block (currently with two buttons: Invite Members + Manage Payer Institutions). Add a third button:

```tsx
          <Button asChild variant="outline" size="sm">
            <Link href={`/clusters/${id}/orders/pricing`}>
              Manage Pricing
            </Link>
          </Button>
```

- [ ] **Step 2: Type-check + lint**

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: build succeeds, the new `/orders/pricing` route appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/clusters/[id]/page.tsx"
git commit -m "feat(ui): add Manage Pricing link to cluster admin block

Third admin action button alongside Invite Members and Manage Payer
Institutions, routing to the new pricing catalog page."
```

- [ ] **Step 5: Push and update the PR**

```bash
git push
```

The push appends commits to PR #19. No new PR needed.

- [ ] **Step 6: Manual verification handoff (NOT executable by the agent)**

Document for the user:

1. Apply migration 012 to their Supabase project.
2. Visit `/clusters/[id]/orders/pricing` as a cluster admin → confirm empty state, then add a pricing row.
3. Visit `/clusters/[id]/orders/new` → pick a book + language matching the pricing row → confirm `unit_cost` and `unit_sale_price` auto-fill.
4. Check "Already stocked" → submit → confirm `book_orders.is_backfill = true`, inventory was NOT incremented, no new `inventory_log` rows.
5. View the order on the list and detail pages → confirm "Backfill" badge.

---

## Final notes for the executor

- This plan reuses everything from the previous Book Orders implementation (helpers, types, UI patterns, RLS conventions). Most tasks are short — the longest is the pricing admin client (~270 lines).
- The atomicity caveat from PR #19 carries over: `createOrder` in backfill mode still writes an order header + N items in sequence; a mid-flight failure leaves a partial order. Accepted trade-off.
- After this PR lands, the recommended manual workflow for an existing cluster is: (1) populate pricing catalog, (2) create one backfill order documenting existing stock, (3) use normal orders for future purchases.
