"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRequest } from "@/app/actions/requests";
import { BOOK_LANGUAGES, DEFAULT_BOOK_LANGUAGE } from "@/lib/languages";
import type {
  BookCategory,
  BookLanguage,
  PublicationStatus,
  RuhiBook,
} from "@/types/database";

type BookWithAvailability = RuhiBook & { available: number };

const STATUS_OPTIONS: { value: PublicationStatus; label: string }[] = [
  { value: "published", label: "Published" },
  { value: "pre_publication", label: "Pre-Publication" },
  { value: "in_development", label: "In Development" },
];

// Same grouping the inventory list uses (Main Sequence first, then JYSEP,
// then Children's Classes), so Book 8 and Book 8 Unit 2 cluster together.
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

function dropdownLabel(b: RuhiBook) {
  if (isJysepBook(b)) return `JYSEP: ${b.title}`;
  if (b.book_number) return `Book ${b.book_number}: ${b.title}`;
  return b.title;
}

export function RequestBookForm({
  clusterId,
  books,
}: {
  clusterId: string;
  books: BookWithAvailability[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [bookId, setBookId] = useState("");
  const [language, setLanguage] = useState<BookLanguage>(DEFAULT_BOOK_LANGUAGE);
  const [publicationStatus, setPublicationStatus] = useState<PublicationStatus>(
    "published"
  );
  const [quantity, setQuantity] = useState("");
  const [purpose, setPurpose] = useState("");

  const sortedBooks = sortBooks(books);
  const selectedBook = books.find((b) => b.id === bookId);

  function handleBookChange(value: string) {
    setBookId(value);
    const next = books.find((b) => b.id === value);
    if (next) setPublicationStatus(next.publication_status);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (!bookId || isNaN(qty) || qty <= 0) {
      toast.error("Please select a book and enter a valid quantity");
      return;
    }
    setLoading(true);
    const result = await createRequest({
      cluster_id: clusterId,
      ruhi_book_id: bookId,
      language,
      publication_status: publicationStatus,
      quantity_requested: qty,
      purpose: purpose || null,
    });
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      const autoApproved = result.data?.status === "approved";
      toast.success(
        autoApproved
          ? "Request auto-approved"
          : "Request submitted successfully"
      );
      router.push(`/clusters/${clusterId}/requests`);
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>New Book Request</CardTitle>
        <CardDescription>
          Select the book and quantity you need. A cluster administrator will
          review and fulfill your request.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Book</Label>
            <Select value={bookId} onValueChange={handleBookChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select book" />
              </SelectTrigger>
              <SelectContent>
                {sortedBooks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="flex items-center gap-2">
                      {dropdownLabel(b)}
                      <Badge variant="outline" className="ml-1 text-xs">
                        {b.available} avail.
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBook && (
              <div className="text-sm text-muted-foreground space-y-0.5">
                {selectedBook.unit && <p>Unit: {selectedBook.unit}</p>}
                <p>
                  Current catalog status:{" "}
                  {STATUS_OPTIONS.find(
                    (s) => s.value === selectedBook.publication_status
                  )?.label ?? selectedBook.publication_status}
                </p>
                <p>
                  {selectedBook.available} copies currently available across
                  all languages in this cluster.
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Language</Label>
            <Select
              value={language}
              onValueChange={(v) => setLanguage(v as BookLanguage)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOK_LANGUAGES.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Publication Status</Label>
            <Select
              value={publicationStatus}
              onValueChange={(v) =>
                setPublicationStatus(v as PublicationStatus)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Defaults to the book&rsquo;s current catalog status. Change it to
              request an older printing.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Quantity Needed</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Number of copies"
            />
          </div>
          <div className="space-y-2">
            <Label>Purpose (optional)</Label>
            <Textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g., Starting a study circle in the Roswell area"
              rows={3}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Submitting..." : "Submit Request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
