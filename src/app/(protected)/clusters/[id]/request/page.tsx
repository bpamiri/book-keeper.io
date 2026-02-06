import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RuhiBook } from "@/types/database";
import { RequestBookForm } from "./request-form";

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

      <RequestBookForm
        clusterId={id}
        books={booksWithAvailability}
      />
    </div>
  );
}
