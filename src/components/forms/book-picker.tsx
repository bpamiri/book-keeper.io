"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookCategory, RuhiBook } from "@/types/database";

/**
 * A book row optionally decorated with an availability count
 * (sum of inventory.quantity across all locations / languages /
 * publication statuses for the current cluster).
 *
 * When `available` is provided, the dropdown renders a badge next to
 * each option showing "N avail.". When omitted, no badge is rendered.
 */
export type BookWithAvailability = RuhiBook & { available?: number };

interface BookPickerProps {
  value: string;
  onChange: (id: string) => void;
  books: BookWithAvailability[];
  disabled?: boolean;
  className?: string;
}

// Same ordering as the request page: main sequence first, JYSEP next,
// children's-class branches last. Mirrors CATEGORY_RANK in request-form.tsx.
const CATEGORY_RANK: Record<BookCategory, number> = {
  main_sequence: 0,
  junior_youth_text: 1,
  branch_book5: 1,
  branch_book3: 2,
};

function sortBooks<T extends RuhiBook>(books: T[]): T[] {
  return [...books].sort((a, b) => {
    const aRank = CATEGORY_RANK[a.category] ?? 99;
    const bRank = CATEGORY_RANK[b.category] ?? 99;
    if (aRank !== bRank) return aRank - bRank;
    const aNum = a.book_number ?? Number.POSITIVE_INFINITY;
    const bNum = b.book_number ?? Number.POSITIVE_INFINITY;
    if (aNum !== bNum) return aNum - bNum;
    return a.title.localeCompare(b.title);
  });
}

function isJysepBook(b: RuhiBook) {
  return b.category === "junior_youth_text" || b.category === "branch_book5";
}

/**
 * The label shown for a book in both the trigger and each dropdown item.
 * Matches the format used by the existing /request page so all book
 * dropdowns read identically across the app.
 */
export function bookLabel(b: RuhiBook): string {
  if (isJysepBook(b)) return `JYSEP: ${b.title}`;
  if (b.book_number) return `Book ${b.book_number}: ${b.title}`;
  return b.title;
}

export function BookPicker({
  value,
  onChange,
  books,
  disabled,
  className,
}: BookPickerProps) {
  const sortedBooks = sortBooks(books.filter((b) => b.is_active));

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select a book…" />
      </SelectTrigger>
      <SelectContent>
        {sortedBooks.map((book) => (
          <SelectItem key={book.id} value={book.id}>
            <span className="flex items-center gap-2">
              {bookLabel(book)}
              {book.available !== undefined && (
                <Badge variant="outline" className="ml-1 text-xs">
                  {book.available} avail.
                </Badge>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
