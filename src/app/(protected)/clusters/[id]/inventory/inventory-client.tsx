"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { addStock, updateQuantity, transferStock } from "@/app/actions/inventory";
import type { Inventory, RuhiBook, StorageLocation } from "@/types/database";

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
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const bookMap = new Map(books.map((b) => [b.id, b]));
  const locationMap = new Map(locations.map((l) => [l.id, l]));

  const filtered = inventory.filter((item) => {
    if (filterBook !== "all" && item.ruhi_book_id !== filterBook) return false;
    if (filterLocation !== "all" && item.storage_location_id !== filterLocation)
      return false;
    return true;
  });

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
      <div className="flex flex-wrap items-center gap-4">
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
                  {b.book_number ? `Book ${b.book_number}: ` : ""}
                  {b.title}
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
          <AddStockDialog
            clusterId={clusterId}
            books={books}
            locations={locations}
            open={addOpen}
            onOpenChange={setAddOpen}
          />
          {isAdmin && (
            <TransferDialog
              clusterId={clusterId}
              books={books}
              locations={locations}
              inventory={inventory}
              open={transferOpen}
              onOpenChange={setTransferOpen}
            />
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
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">
                        {book?.book_number
                          ? `Book ${book.book_number}`
                          : book?.title ?? "Unknown"}
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
                    {b.book_number ? `Book ${b.book_number}: ` : ""}
                    {b.title}
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
                    {b.book_number ? `Book ${b.book_number}: ` : ""}
                    {b.title}
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
