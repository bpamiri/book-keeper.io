"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <span>/</span>
            <Link
              href={`/clusters/${clusterId}`}
              className="hover:underline"
            >
              Cluster
            </Link>
            <span>/</span>
          </div>
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
                    onClick={() => router.push(`/clusters/${clusterId}/orders/${order.id}`)}
                  >
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
                    <TableCell>{order.supplier ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {orderItems.length}
                    </TableCell>
                    <TableCell className="text-right">
                      ${totalCost.toFixed(2)}
                    </TableCell>
                    <TableCell>{payerName}</TableCell>
                    <TableCell>
                      <Badge variant={reimbursementVariant[order.reimbursement_status]}>
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
