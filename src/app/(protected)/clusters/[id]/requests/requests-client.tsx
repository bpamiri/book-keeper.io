"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  approveRequest,
  denyRequest,
  fulfillRequest,
} from "@/app/actions/requests";
import type {
  BookRequest,
  RuhiBook,
  Profile,
  StorageLocation,
  Inventory,
  RequestStatus,
} from "@/types/database";

const statusVariant: Record<RequestStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  approved: "default",
  fulfilled: "secondary",
  denied: "destructive",
};

interface RequestsClientProps {
  requests: BookRequest[];
  bookMap: Record<string, RuhiBook>;
  profileMap: Record<string, Profile>;
  locations: StorageLocation[];
  inventory: Inventory[];
  isAdmin: boolean;
}

export function RequestsClient({
  requests,
  bookMap,
  profileMap,
  locations,
  inventory,
  isAdmin,
}: RequestsClientProps) {
  const [fulfillOpen, setFulfillOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<BookRequest | null>(
    null
  );
  const [tab, setTab] = useState("all");

  const filtered =
    tab === "all" ? requests : requests.filter((r) => r.status === tab);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
          <TabsTrigger value="pending">
            Pending ({requests.filter((r) => r.status === "pending").length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({requests.filter((r) => r.status === "approved").length})
          </TabsTrigger>
          <TabsTrigger value="fulfilled">
            Fulfilled (
            {requests.filter((r) => r.status === "fulfilled").length})
          </TabsTrigger>
          <TabsTrigger value="denied">
            Denied ({requests.filter((r) => r.status === "denied").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Purpose
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  {isAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isAdmin ? 7 : 6}
                      className="h-24 text-center"
                    >
                      No requests found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((req) => {
                    const book = bookMap[req.ruhi_book_id];
                    const requester = profileMap[req.requested_by];
                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">
                          {book?.book_number
                            ? `Book ${book.book_number}`
                            : book?.title ?? "Unknown"}
                        </TableCell>
                        <TableCell>
                          {requester?.full_name || requester?.email || "Unknown"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {req.quantity_requested}
                        </TableCell>
                        <TableCell className="hidden max-w-[200px] truncate md:table-cell">
                          {req.purpose || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[req.status]}>
                            {req.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {new Date(req.created_at).toLocaleDateString()}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <RequestActions
                              request={req}
                              onFulfill={() => {
                                setSelectedRequest(req);
                                setFulfillOpen(true);
                              }}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {selectedRequest && (
        <FulfillDialog
          request={selectedRequest}
          book={bookMap[selectedRequest.ruhi_book_id]}
          locations={locations}
          inventory={inventory}
          open={fulfillOpen}
          onOpenChange={(open) => {
            setFulfillOpen(open);
            if (!open) setSelectedRequest(null);
          }}
        />
      )}
    </div>
  );
}

function RequestActions({
  request,
  onFulfill,
}: {
  request: BookRequest;
  onFulfill: () => void;
}) {
  const [loading, setLoading] = useState(false);

  if (request.status === "pending") {
    return (
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            const result = await approveRequest(request.id);
            setLoading(false);
            if (result.error) toast.error(result.error);
            else toast.success("Request approved");
          }}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            const result = await denyRequest(request.id);
            setLoading(false);
            if (result.error) toast.error(result.error);
            else toast.success("Request denied");
          }}
        >
          Deny
        </Button>
      </div>
    );
  }

  if (request.status === "approved") {
    return (
      <Button size="sm" onClick={onFulfill}>
        Fulfill
      </Button>
    );
  }

  return null;
}

function FulfillDialog({
  request,
  book,
  locations,
  inventory,
  open,
  onOpenChange,
}: {
  request: BookRequest;
  book?: RuhiBook;
  locations: StorageLocation[];
  inventory: Inventory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  // Filter inventory to only this book
  const bookInventory = inventory.filter(
    (inv) => inv.ruhi_book_id === request.ruhi_book_id
  );
  const locationInventoryMap = new Map(
    bookInventory.map((inv) => [inv.storage_location_id, inv.quantity])
  );

  const totalAllocated = Object.values(quantities).reduce(
    (sum, v) => sum + (parseInt(v, 10) || 0),
    0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fulfillments = Object.entries(quantities)
      .map(([locationId, qtyStr]) => ({
        storage_location_id: locationId,
        quantity: parseInt(qtyStr, 10) || 0,
      }))
      .filter((f) => f.quantity > 0);

    if (fulfillments.length === 0) {
      toast.error("Allocate at least some books from a location");
      return;
    }

    if (totalAllocated !== request.quantity_requested) {
      toast.error(
        `Total allocated (${totalAllocated}) must equal requested quantity (${request.quantity_requested})`
      );
      return;
    }

    setLoading(true);
    const result = await fulfillRequest({
      request_id: request.id,
      fulfillments,
    });
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Request fulfilled");
      onOpenChange(false);
      setQuantities({});
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fulfill Request</DialogTitle>
          <DialogDescription>
            {book?.book_number ? `Book ${book.book_number}: ` : ""}
            {book?.title ?? "Unknown"} &mdash;{" "}
            {request.quantity_requested} copies needed
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {locations.map((loc) => {
              const available = locationInventoryMap.get(loc.id) ?? 0;
              if (available === 0) return null;
              return (
                <div key={loc.id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{loc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {available} available
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={available}
                    className="w-20 text-right"
                    value={quantities[loc.id] ?? ""}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [loc.id]: e.target.value,
                      }))
                    }
                    placeholder="0"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t pt-3 text-sm">
            <span>Total allocated:</span>
            <span
              className={
                totalAllocated === request.quantity_requested
                  ? "font-bold text-green-600"
                  : "font-bold"
              }
            >
              {totalAllocated} / {request.quantity_requested}
            </span>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={
              loading || totalAllocated !== request.quantity_requested
            }
          >
            {loading ? "Fulfilling..." : "Fulfill Request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
