"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  ArrowLeftRight,
  Search,
  Download,
  AlertTriangle,
  Layers,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addStock, updateQuantity, transferStock, bulkAddStock } from "@/app/actions/inventory";
import type { Inventory, RuhiBook, StorageLocation } from "@/types/database";

const LOW_STOCK_THRESHOLD = 5;

function bookLabel(b: RuhiBook) {
  if (b.category === "junior_youth_text") return `JYSEP: ${b.title}`;
  if (b.book_number) return `Book ${b.book_number}: ${b.title}`;
  return b.title;
}

interface InventoryClientProps {
  clusterId: string;
  inventory: Inventory[];
  books: RuhiBook[];
  locations: StorageLocation[];
  isAdmin: boolean;
}

export function InventoryClient({
  clusterId,
  inventory,
  books,
  locations,
  isAdmin,
}: InventoryClientProps) {
  const [filterBook, setFilterBook] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const bookMap = new Map(books.map((b) => [b.id, b]));
  const locationMap = new Map(locations.map((l) => [l.id, l]));

  const filtered = inventory.filter((item) => {
    if (filterBook !== "all" && item.ruhi_book_id !== filterBook) return false;
    if (filterLocation !== "all" && item.storage_location_id !== filterLocation)
      return false;
    if (search) {
      const q = search.toLowerCase();
      const book = bookMap.get(item.ruhi_book_id);
      const location = locationMap.get(item.storage_location_id);
      const searchable = [
        book?.title,
        book?.book_number ? `Book ${book.book_number}` : null,
        location?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  const lowStockItems = inventory.filter(
    (item) => item.quantity > 0 && item.quantity <= LOW_STOCK_THRESHOLD
  );

  function exportCsv() {
    const rows = [["Book", "Location", "Quantity", "Last Updated"]];
    for (const item of filtered) {
      const book = bookMap.get(item.ruhi_book_id);
      const location = locationMap.get(item.storage_location_id);
      rows.push([
        book ? bookLabel(book) : "Unknown",
        location?.name ?? "Unknown",
        String(item.quantity),
        new Date(item.updated_at).toLocaleDateString(),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleInlineEdit(id: string) {
    const qty = parseInt(editValue, 10);
    if (isNaN(qty) || qty < 0) {
      toast.error("Quantity must be a non-negative number");
      setEditingId(null);
      return;
    }
    const result = await updateQuantity(id, qty);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Quantity updated");
    }
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      {lowStockItems.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-950/30">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Low Stock Alert
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""}{" "}
              with {LOW_STOCK_THRESHOLD} or fewer copies:{" "}
              {lowStockItems
                .map((item) => {
                  const book = bookMap.get(item.ruhi_book_id);
                  return book?.book_number
                    ? `Book ${book.book_number} (${item.quantity})`
                    : `${book?.title ?? "Unknown"} (${item.quantity})`;
                })
                .join(", ")}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search books or locations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Book:</Label>
          <Select value={filterBook} onValueChange={setFilterBook}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Books</SelectItem>
              {books.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {bookLabel(b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Location:</Label>
          <Select value={filterLocation} onValueChange={setFilterLocation}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="mr-1 size-4" />
            Export
          </Button>
          <AddStockDialog
            clusterId={clusterId}
            books={books}
            locations={locations}
            open={addOpen}
            onOpenChange={setAddOpen}
          />
          {isAdmin && (
            <>
              <BulkAddDialog
                clusterId={clusterId}
                books={books}
                locations={locations}
                open={bulkOpen}
                onOpenChange={setBulkOpen}
              />
              <TransferDialog
                clusterId={clusterId}
                books={books}
                locations={locations}
                inventory={inventory}
                open={transferOpen}
                onOpenChange={setTransferOpen}
              />
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Book</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="hidden sm:table-cell">
                Last Updated
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No inventory records found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => {
                const book = bookMap.get(item.ruhi_book_id);
                const location = locationMap.get(item.storage_location_id);
                const isLow =
                  item.quantity > 0 && item.quantity <= LOW_STOCK_THRESHOLD;
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="font-medium">
                          {book?.book_number
                            ? `Book ${book.book_number}`
                            : book?.title ?? "Unknown"}
                        </div>
                        {isLow && (
                          <Badge
                            variant="outline"
                            className="border-yellow-400 text-yellow-600 dark:text-yellow-400 text-[10px] px-1.5 py-0"
                          >
                            Low
                          </Badge>
                        )}
                      </div>
                      {book?.book_number && (
                        <div className="text-xs text-muted-foreground">
                          {book.title}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{location?.name ?? "Unknown"}</TableCell>
                    <TableCell className="text-right">
                      {editingId === item.id ? (
                        <Input
                          type="number"
                          min={0}
                          className="ml-auto w-20 text-right"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleInlineEdit(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleInlineEdit(item.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <button
                          className="cursor-pointer rounded px-2 py-1 tabular-nums hover:bg-accent"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditValue(String(item.quantity));
                          }}
                        >
                          {item.quantity}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {new Date(item.updated_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AddStockDialog({
  clusterId,
  books,
  locations,
  open,
  onOpenChange,
}: {
  clusterId: string;
  books: RuhiBook[];
  locations: StorageLocation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [bookId, setBookId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (!bookId || !locationId || isNaN(qty) || qty <= 0) {
      toast.error("Please fill all required fields with valid values");
      return;
    }
    setLoading(true);
    const result = await addStock({
      cluster_id: clusterId,
      storage_location_id: locationId,
      ruhi_book_id: bookId,
      quantity: qty,
      notes: notes || null,
    });
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Stock added successfully");
      onOpenChange(false);
      setBookId("");
      setLocationId("");
      setQuantity("");
      setNotes("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 size-4" />
          Add Stock
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Stock</DialogTitle>
          <DialogDescription>
            Add books to a storage location.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Book</Label>
            <Select value={bookId} onValueChange={setBookId}>
              <SelectTrigger>
                <SelectValue placeholder="Select book" />
              </SelectTrigger>
              <SelectContent>
                {books.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {bookLabel(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Number of copies"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., New shipment received"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Adding..." : "Add Stock"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface BulkRow {
  bookId: string;
  locationId: string;
  quantity: string;
}

function BulkAddDialog({
  clusterId,
  books,
  locations,
  open,
  onOpenChange,
}: {
  clusterId: string;
  books: RuhiBook[];
  locations: StorageLocation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([
    { bookId: "", locationId: "", quantity: "" },
  ]);

  function addRow() {
    setRows((prev) => [...prev, { bookId: "", locationId: "", quantity: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof BulkRow, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const items = rows
      .map((row) => ({
        storage_location_id: row.locationId,
        ruhi_book_id: row.bookId,
        quantity: parseInt(row.quantity, 10) || 0,
      }))
      .filter((item) => item.storage_location_id && item.ruhi_book_id && item.quantity > 0);

    if (items.length === 0) {
      toast.error("Add at least one valid item");
      return;
    }

    setLoading(true);
    const result = await bulkAddStock({
      cluster_id: clusterId,
      items,
      notes: notes || null,
    });
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`${items.length} items added successfully`);
      onOpenChange(false);
      setRows([{ bookId: "", locationId: "", quantity: "" }]);
      setNotes("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Layers className="mr-1 size-4" />
          Bulk Add
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Add Stock</DialogTitle>
          <DialogDescription>
            Add multiple book/location entries at once.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  {index === 0 && (
                    <Label className="text-xs">Book</Label>
                  )}
                  <Select
                    value={row.bookId}
                    onValueChange={(v) => updateRow(index, "bookId", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Book" />
                    </SelectTrigger>
                    <SelectContent>
                      {books.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {bookLabel(b)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  {index === 0 && (
                    <Label className="text-xs">Location</Label>
                  )}
                  <Select
                    value={row.locationId}
                    onValueChange={(v) => updateRow(index, "locationId", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-20 space-y-1">
                  {index === 0 && (
                    <Label className="text-xs">Qty</Label>
                  )}
                  <Input
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(e) => updateRow(index, "quantity", e.target.value)}
                    placeholder="0"
                  />
                </div>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeRow(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="w-full"
          >
            <Plus className="mr-1 size-4" />
            Add Row
          </Button>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Quarterly shipment"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Adding..." : `Add ${rows.length} Item${rows.length !== 1 ? "s" : ""}`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  clusterId,
  books,
  locations,
  inventory,
  open,
  onOpenChange,
}: {
  clusterId: string;
  books: RuhiBook[];
  locations: StorageLocation[];
  inventory: Inventory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [bookId, setBookId] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const sourceItem = inventory.find(
    (i) =>
      i.ruhi_book_id === bookId && i.storage_location_id === fromId
  );
  const maxQty = sourceItem?.quantity ?? 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (!bookId || !fromId || !toId || isNaN(qty) || qty <= 0) {
      toast.error("Please fill all required fields");
      return;
    }
    if (fromId === toId) {
      toast.error("Source and destination must be different");
      return;
    }
    setLoading(true);
    const result = await transferStock({
      cluster_id: clusterId,
      from_location_id: fromId,
      to_location_id: toId,
      ruhi_book_id: bookId,
      quantity: qty,
      notes: notes || null,
    });
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Stock transferred successfully");
      onOpenChange(false);
      setBookId("");
      setFromId("");
      setToId("");
      setQuantity("");
      setNotes("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ArrowLeftRight className="mr-1 size-4" />
          Transfer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer Stock</DialogTitle>
          <DialogDescription>
            Move books between storage locations.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Book</Label>
            <Select value={bookId} onValueChange={setBookId}>
              <SelectTrigger>
                <SelectValue placeholder="Select book" />
              </SelectTrigger>
              <SelectContent>
                {books.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {bookLabel(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>From Location</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger>
                <SelectValue placeholder="Source location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>To Location</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger>
                <SelectValue placeholder="Destination location" />
              </SelectTrigger>
              <SelectContent>
                {locations
                  .filter((l) => l.id !== fromId)
                  .map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              Quantity{" "}
              {maxQty > 0 && (
                <span className="text-muted-foreground">
                  (max: {maxQty})
                </span>
              )}
            </Label>
            <Input
              type="number"
              min={1}
              max={maxQty}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Number of copies"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for transfer"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Transferring..." : "Transfer Stock"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
