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
import type { BookLanguage, RuhiBook } from "@/types/database";

type BookWithAvailability = RuhiBook & { available: number };

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
  const [quantity, setQuantity] = useState("");
  const [purpose, setPurpose] = useState("");

  const selectedBook = books.find((b) => b.id === bookId);

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
            <Select value={bookId} onValueChange={setBookId}>
              <SelectTrigger>
                <SelectValue placeholder="Select book" />
              </SelectTrigger>
              <SelectContent>
                {books.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="flex items-center gap-2">
                      {b.book_number ? `Book ${b.book_number}: ` : ""}
                      {b.title}
                      <Badge variant="outline" className="ml-1 text-xs">
                        {b.available} avail.
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBook && (
              <p className="text-sm text-muted-foreground">
                {selectedBook.available} copies currently available across all
                languages in this cluster.
              </p>
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
