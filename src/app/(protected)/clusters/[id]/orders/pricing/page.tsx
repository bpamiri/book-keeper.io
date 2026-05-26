import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  ClusterBookPricing,
  ClusterMember,
  RuhiBook,
} from "@/types/database";
import type { BookWithAvailability } from "@/components/forms/book-picker";
import { PricingClient } from "./pricing-client";

export default async function PricingPage({
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

  const { data: membership } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!membership) redirect("/dashboard");
  const m = membership as unknown as ClusterMember;
  const isAdmin = m.cluster_role === "admin";

  const [pricingRes, booksRes, inventoryRes] = await Promise.all([
    supabase
      .from("cluster_book_pricing")
      .select("*")
      .eq("cluster_id", id),
    supabase
      .from("ruhi_books")
      .select("*")
      .eq("is_active", true),
    supabase
      .from("inventory")
      .select("ruhi_book_id, quantity")
      .eq("cluster_id", id),
  ]);

  const pricing = (pricingRes.data ?? []) as ClusterBookPricing[];
  const rawBooks = (booksRes.data ?? []) as RuhiBook[];

  // Aggregate inventory per book so BookPicker shows "N avail." per item.
  const availabilityMap = new Map<string, number>();
  for (const row of (inventoryRes.data ?? []) as {
    ruhi_book_id: string;
    quantity: number;
  }[]) {
    availabilityMap.set(
      row.ruhi_book_id,
      (availabilityMap.get(row.ruhi_book_id) ?? 0) + row.quantity
    );
  }
  const books: BookWithAvailability[] = rawBooks.map((b) => ({
    ...b,
    available: availabilityMap.get(b.id) ?? 0,
  }));

  return (
    <PricingClient
      clusterId={id}
      isAdmin={isAdmin}
      pricing={pricing}
      books={books}
    />
  );
}
