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
import {
  BookPicker,
  type BookWithAvailability,
} from "@/components/forms/book-picker";
import { LanguagePicker } from "@/components/forms/language-picker";
import { upsertPricing, deletePricing } from "@/app/actions/pricing";
import { DEFAULT_BOOK_LANGUAGE } from "@/lib/languages";
import type {
  BookLanguage,
  ClusterBookPricing,
} from "@/types/database";

interface PricingClientProps {
  clusterId: string;
  isAdmin: boolean;
  pricing: ClusterBookPricing[];
  books: BookWithAvailability[];
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
