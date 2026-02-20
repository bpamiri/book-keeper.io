"use client";

import { useState } from "react";
import {
  Plus,
  Minus,
  ArrowLeftRight,
  Wrench,
  PackageCheck,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import type {
  InventoryLog,
  RuhiBook,
  StorageLocation,
  Profile,
  ChangeType,
} from "@/types/database";

const changeTypeConfig: Record<
  ChangeType,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Plus }
> = {
  added: { label: "Added", variant: "default", icon: Plus },
  removed: { label: "Removed", variant: "destructive", icon: Minus },
  transferred: { label: "Transferred", variant: "secondary", icon: ArrowLeftRight },
  adjustment: { label: "Adjusted", variant: "outline", icon: Wrench },
  fulfilled: { label: "Fulfilled", variant: "secondary", icon: PackageCheck },
};

interface ActivityClientProps {
  logs: InventoryLog[];
  bookMap: Record<string, RuhiBook>;
  locationMap: Record<string, StorageLocation>;
  profileMap: Record<string, Profile>;
}

export function ActivityClient({
  logs,
  bookMap,
  locationMap,
  profileMap,
}: ActivityClientProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = logs.filter((log) => {
    if (typeFilter !== "all" && log.change_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const book = bookMap[log.ruhi_book_id];
      const location = locationMap[log.storage_location_id];
      const performer = profileMap[log.performed_by];
      const searchable = [
        book?.title,
        book?.book_number ? `Book ${book.book_number}` : null,
        location?.name,
        performer?.full_name,
        log.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by book, location, or person..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="added">Added</SelectItem>
            <SelectItem value="removed">Removed</SelectItem>
            <SelectItem value="transferred">Transferred</SelectItem>
            <SelectItem value="adjustment">Adjusted</SelectItem>
            <SelectItem value="fulfilled">Fulfilled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Book</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="hidden sm:table-cell text-right">
                Result
              </TableHead>
              <TableHead className="hidden md:table-cell">By</TableHead>
              <TableHead className="hidden md:table-cell">Notes</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  No activity found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((log) => {
                const book = bookMap[log.ruhi_book_id];
                const location = locationMap[log.storage_location_id];
                const performer = profileMap[log.performed_by];
                const config = changeTypeConfig[log.change_type];
                const Icon = config.icon;

                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant={config.variant} className="gap-1">
                        <Icon className="size-3" />
                        <span className="hidden sm:inline">{config.label}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {book?.book_number
                        ? `Book ${book.book_number}`
                        : book?.title ?? "Unknown"}
                    </TableCell>
                    <TableCell>{location?.name ?? "Unknown"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={
                          log.quantity_change > 0
                            ? "text-green-600 dark:text-green-400"
                            : log.quantity_change < 0
                              ? "text-red-600 dark:text-red-400"
                              : ""
                        }
                      >
                        {log.quantity_change > 0 ? "+" : ""}
                        {log.quantity_change}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right tabular-nums">
                      {log.previous_quantity} &rarr; {log.new_quantity}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {performer?.full_name || "Unknown"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell max-w-[200px] truncate text-muted-foreground">
                      {log.notes || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        Showing {filtered.length} of {logs.length} entries (last 100)
      </p>
    </div>
  );
}
