import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  ClusterBookPricing,
  ClusterMember,
  RuhiBook,
} from "@/types/database";
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

  const [pricingRes, booksRes] = await Promise.all([
    supabase
      .from("cluster_book_pricing")
      .select("*")
      .eq("cluster_id", id),
    supabase
      .from("ruhi_books")
      .select("*")
      .eq("is_active", true),
  ]);

  const pricing = (pricingRes.data ?? []) as ClusterBookPricing[];
  const books = (booksRes.data ?? []) as RuhiBook[];

  return (
    <PricingClient
      clusterId={id}
      isAdmin={isAdmin}
      pricing={pricing}
      books={books}
    />
  );
}
