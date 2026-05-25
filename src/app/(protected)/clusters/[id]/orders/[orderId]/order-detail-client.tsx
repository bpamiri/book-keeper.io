"use client";

import Link from "next/link";
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
import type {
  BookOrder,
  BookOrderItem,
  PayerInstitution,
  Profile,
  ReimbursementStatus,
  RuhiBook,
  StorageLocation,
} from "@/types/database";
import type { BookLanguage } from "@/types/database";

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

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

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
    startTransition(async () => {
      const result = await deleteOrderItem(id);
      if ("error" in result && result.error) {
        toast.error(result.error);
        setDeleteTargetId(null);
        return;
      }
      toast.success("Item deleted");
      setDeleteTargetId(null);
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
              <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                  if (!open) {
                    setRbStatus(order.reimbursement_status);
                    setRbAmount(String(order.reimbursed_amount));
                    setRbNotes(order.reimbursement_notes ?? "");
                  }
                  setDialogOpen(open);
                }}
              >
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
                          onClick={() => setDeleteTargetId(it.id)}
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

      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete line item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse inventory. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTargetId && removeItem(deleteTargetId)}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
