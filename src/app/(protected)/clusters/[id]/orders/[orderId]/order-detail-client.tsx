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
