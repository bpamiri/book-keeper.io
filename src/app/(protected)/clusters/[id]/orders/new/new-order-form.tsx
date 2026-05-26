"use client";

import Link from "next/link";
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
import {
  BookPicker,
  type BookWithAvailability,
} from "@/components/forms/book-picker";
import { LanguagePicker } from "@/components/forms/language-picker";
import { LocationPicker } from "@/components/forms/location-picker";
import { createOrder } from "@/app/actions/orders";
import { DEFAULT_BOOK_LANGUAGE } from "@/lib/languages";
import type {
  BookLanguage,
  ClusterBookPricing,
  PayerInstitution,
  PayerKind,
  Profile,
  ReimbursementStatus,
  StorageLocation,
} from "@/types/database";

interface NewOrderFormProps {
  clusterId: string;
  books: BookWithAvailability[];
  locations: StorageLocation[];
  profiles: Profile[];
  institutions: PayerInstitution[];
  pricing: ClusterBookPricing[];
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
  pricing,
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
  const [alreadyStocked, setAlreadyStocked] = useState(false);

  const pricingMap = new Map<string, ClusterBookPricing>(
    pricing.map((p) => [`${p.ruhi_book_id}|${p.language}`, p])
  );

  const totals = items.reduce(
    (acc, row) => ({
      cost: acc.cost + row.quantity * row.unit_cost,
      sale: acc.sale + row.quantity * row.unit_sale_price,
    }),
    { cost: 0, sale: 0 }
  );

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

  const handlePayerKindChange = (kind: PayerKind) => {
    setPayerKind(kind);
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
      already_stocked: alreadyStocked,
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
        <h1 className="text-2xl font-bold tracking-tight">New Order</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="order_date">Order date</Label>
              <Input
                id="order_date"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-2">
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

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 space-y-2">
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
            <div className="min-w-0 space-y-2">
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
              className="grid gap-3 rounded-md border p-3 lg:grid-cols-[2fr_1fr_2fr_1fr_1fr_1fr_auto]"
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
