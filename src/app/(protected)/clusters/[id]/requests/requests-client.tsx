"use client";

import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  pre_publication: "Pre-Publication",
  in_development: "In Development",
};


import {
  Search,
  Download,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Trash2,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  approveRequest,
  denyRequest,
  fulfillRequest,
  deleteRequest,
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

type SortKey = "book" | "language" | "requested_by";

interface RequestsClientProps {
  requests: BookRequest[];
  bookMap: Record<string, RuhiBook>;
  profileMap: Record<string, Profile>;
  locations: StorageLocation[];
  inventory: Inventory[];
  isAdmin: boolean;
  requestIdsWithFulfillments: string[];
}

export function RequestsClient({
  requests,
  bookMap,
  profileMap,
  locations,
  inventory,
  isAdmin,
  requestIdsWithFulfillments,
}: RequestsClientProps) {
  const [fulfillOpen, setFulfillOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<BookRequest | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<BookRequest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // A request can be deleted only if it hasn't pulled any stock from
  // inventory. Fulfilled requests always have fulfillments; partially
  // fulfilled ones are still "approved" but appear in this set too.
  const fulfillmentSet = new Set(requestIdsWithFulfillments);
  const canDelete = (req: BookRequest) =>
    req.status !== "fulfilled" && !fulfillmentSet.has(req.id);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function requesterLabel(req: BookRequest) {
    const p = profileMap[req.requested_by];
    return (p?.full_name || p?.email || "").toLowerCase();
  }

  const byTab =
    tab === "all" ? requests : requests.filter((r) => r.status === tab);

  const filtered = byTab.filter((req) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const book = bookMap[req.ruhi_book_id];
    const requester = profileMap[req.requested_by];
    const searchable = [
      book?.title,
      book?.book_number ? `Book ${book.book_number}` : null,
      req.language,
      requester?.full_name,
      requester?.email,
      req.purpose,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(q);
  });

  const sorted = [...filtered];
  if (sortKey) {
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "book") {
        const av =
          bookMap[a.ruhi_book_id]?.book_number ?? Number.POSITIVE_INFINITY;
        const bv =
          bookMap[b.ruhi_book_id]?.book_number ?? Number.POSITIVE_INFINITY;
        cmp = av - bv;
      } else if (sortKey === "language") {
        cmp = a.language.localeCompare(b.language);
      } else {
        cmp = requesterLabel(a).localeCompare(requesterLabel(b));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  function exportCsv() {
    const rows = [["Book", "Language", "Requested By", "Qty", "Purpose", "Status", "Date"]];
    for (const req of sorted) {
      const book = bookMap[req.ruhi_book_id];
      const requester = profileMap[req.requested_by];
      rows.push([
        book?.book_number ? `Book ${book.book_number}: ${book.title}` : book?.title ?? "Unknown",
        req.language,
        requester?.full_name || requester?.email || "Unknown",
        String(req.quantity_requested),
        req.purpose || "",
        req.status,
        new Date(req.created_at).toLocaleDateString(),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "requests.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    const target = deleteTarget;
    if (!target) return;
    setDeleting(true);
    const result = await deleteRequest(target.id);
    setDeleting(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Request deleted");
    }
    setDeleteTarget(null);
  }

  const sortHeader = (key: SortKey, label: string) => {
    const active = sortKey === key;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground"
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 opacity-40" />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by book, person, or purpose..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="mr-1 size-4" />
          Export
        </Button>
      </div>

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
                  <TableHead>{sortHeader("book", "Book")}</TableHead>
                  <TableHead>{sortHeader("language", "Language")}</TableHead>
                  <TableHead>
                    {sortHeader("requested_by", "Requested By")}
                  </TableHead>
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
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isAdmin ? 8 : 7}
                      className="h-24 text-center"
                    >
                      No requests found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((req) => {
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
                          <Badge variant="secondary" className="font-normal">
                            {req.language}
                          </Badge>
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
                              canDelete={canDelete(req)}
                              onFulfill={() => {
                                setSelectedRequest(req);
                                setFulfillOpen(true);
                              }}
                              onDelete={() => setDeleteTarget(req)}
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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this request?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the request and can&apos;t be undone.
              Requests that have already been fulfilled can&apos;t be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RequestActions({
  request,
  canDelete,
  onFulfill,
  onDelete,
}: {
  request: BookRequest;
  canDelete: boolean;
  onFulfill: () => void;
  onDelete: () => void;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex gap-1">
      {request.status === "pending" && (
        <>
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
        </>
      )}

      {request.status === "approved" && (
        <Button size="sm" onClick={onFulfill}>
          Fulfill
        </Button>
      )}

      {canDelete && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label="Delete request"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
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

  // Filter inventory to only this book + the requested language + status
  const bookInventory = inventory.filter(
    (inv) =>
      inv.ruhi_book_id === request.ruhi_book_id &&
      inv.language === request.language &&
      inv.publication_status === request.publication_status
  );
  const locationInventoryMap = new Map(
    bookInventory.map((inv) => [inv.storage_location_id, inv.quantity])
  );

  // How many copies of this book/language/edition are on hand across the
  // active locations the admin can actually pull from. Drives the
  // "no inventory" / "not enough inventory" messaging below.
  const totalAvailable = locations.reduce(
    (sum, loc) => sum + (locationInventoryMap.get(loc.id) ?? 0),
    0
  );
  const hasNoInventory = totalAvailable === 0;
  const hasShortfall =
    totalAvailable > 0 && totalAvailable < request.quantity_requested;

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
            {book?.title ?? "Unknown"} ({request.language},{" "}
            {STATUS_LABELS[request.publication_status] ??
              request.publication_status}
            ) &mdash; {request.quantity_requested} copies needed
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {hasNoInventory ? (
            <div className="space-y-4">
              <div className="flex gap-2 rounded-md border bg-muted/50 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="font-medium">No inventory available</p>
                  <p className="text-muted-foreground">
                    There&apos;s no stock of this book ({request.language},{" "}
                    {STATUS_LABELS[request.publication_status] ??
                      request.publication_status}
                    ) in any active storage location. Add inventory before
                    fulfilling this request.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
                <Button asChild>
                  <Link href={`/clusters/${request.cluster_id}/inventory`}>
                    <Plus className="mr-1 size-4" />
                    Add inventory
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {hasShortfall && (
                <div className="flex gap-2 rounded-md border bg-muted/50 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="space-y-1">
                    <p className="font-medium">Not enough inventory</p>
                    <p className="text-muted-foreground">
                      Only {totalAvailable} of {request.quantity_requested}{" "}
                      requested copies are available across your active
                      locations. Add more inventory to fully fulfill this
                      request.
                    </p>
                    <Button
                      asChild
                      variant="link"
                      className="h-auto p-0 text-sm"
                    >
                      <Link
                        href={`/clusters/${request.cluster_id}/inventory`}
                      >
                        Add inventory
                      </Link>
                    </Button>
                  </div>
                </div>
              )}

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
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
