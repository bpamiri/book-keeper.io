import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RuhiBook, BookRequest } from "@/types/database";
import { RequestBookForm } from "./request-form";
import { BookRecommendations } from "./book-recommendations";

export default async function RequestBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Verify membership
  const { data: rawMembership } = await supabase
    .from("cluster_members")
    .select("id")
    .eq("cluster_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!rawMembership) redirect("/dashboard");

  // Get active books
  const { data: rawBooks } = await supabase
    .from("ruhi_books")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  const books = (rawBooks ?? []) as unknown as RuhiBook[];

  // Get inventory totals per book in this cluster
  const { data: rawInventory } = await supabase
    .from("inventory")
    .select("ruhi_book_id, quantity")
    .eq("cluster_id", id);

  const availabilityMap = new Map<string, number>();
  for (const item of (rawInventory ?? []) as unknown as {
    ruhi_book_id: string;
    quantity: number;
  }[]) {
    const current = availabilityMap.get(item.ruhi_book_id) ?? 0;
    availabilityMap.set(item.ruhi_book_id, current + item.quantity);
  }

  const booksWithAvailability = books.map((book) => ({
    ...book,
    available: availabilityMap.get(book.id) ?? 0,
  }));

  // Get recent request history for recommendations
  const { data: rawRequests } = await supabase
    .from("book_requests")
    .select("ruhi_book_id, quantity_requested, status")
    .eq("cluster_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const recentRequests = (rawRequests ?? []) as unknown as Pick<
    BookRequest,
    "ruhi_book_id" | "quantity_requested" | "status"
  >[];

  // Compute recommendations
  const recommendations = computeRecommendations(
    booksWithAvailability,
    recentRequests
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            Dashboard
          </Link>
          <span>/</span>
          <Link href={`/clusters/${id}`} className="hover:underline">
            Cluster
          </Link>
          <span>/</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Request Books</h1>
        <p className="text-muted-foreground">
          Submit a request for books you need for a study circle.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <RequestBookForm clusterId={id} books={booksWithAvailability} />
        <BookRecommendations recommendations={recommendations} />
      </div>
    </div>
  );
}

type BookWithAvailability = RuhiBook & { available: number };

export interface Recommendation {
  bookId: string;
  bookTitle: string;
  bookNumber: number | null;
  reason: string;
  available: number;
  category: string;
}

function computeRecommendations(
  books: BookWithAvailability[],
  requests: Pick<BookRequest, "ruhi_book_id" | "quantity_requested" | "status">[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // 1. Frequently requested books with low/zero stock
  const requestCounts = new Map<string, number>();
  for (const req of requests) {
    const count = requestCounts.get(req.ruhi_book_id) ?? 0;
    requestCounts.set(req.ruhi_book_id, count + req.quantity_requested);
  }

  for (const book of books) {
    const totalRequested = requestCounts.get(book.id) ?? 0;
    if (totalRequested > 0 && book.available <= 5) {
      recommendations.push({
        bookId: book.id,
        bookTitle: book.title,
        bookNumber: book.book_number,
        reason:
          book.available === 0
            ? `Requested ${totalRequested} times, currently out of stock`
            : `Requested ${totalRequested} times, only ${book.available} left`,
        available: book.available,
        category: "high_demand",
      });
    }
  }

  // 2. Next main sequence book to stock
  const mainSequence = books
    .filter((b) => b.category === "main_sequence" && b.book_number)
    .sort((a, b) => (a.book_number ?? 0) - (b.book_number ?? 0));

  // Find the first main-sequence book with zero stock
  for (const book of mainSequence) {
    if (book.available === 0) {
      recommendations.push({
        bookId: book.id,
        bookTitle: book.title,
        bookNumber: book.book_number,
        reason: "Main sequence book not yet in stock",
        available: 0,
        category: "sequence_gap",
      });
      break;
    }
  }

  // 3. Books that are out of stock but have never been requested (discovery)
  const neverRequested = books.filter(
    (b) =>
      b.available === 0 &&
      !requestCounts.has(b.id) &&
      b.publication_status === "published"
  );

  for (const book of neverRequested.slice(0, 2)) {
    recommendations.push({
      bookId: book.id,
      bookTitle: book.title,
      bookNumber: book.book_number,
      reason: "Published book not yet stocked in this cluster",
      available: 0,
      category: "discovery",
    });
  }

  // Deduplicate by bookId
  const seen = new Set<string>();
  return recommendations.filter((r) => {
    if (seen.has(r.bookId)) return false;
    seen.add(r.bookId);
    return true;
  }).slice(0, 5);
}
