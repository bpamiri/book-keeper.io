import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Inventory,
  RuhiBook,
  StorageLocation,
  ClusterMember,
} from "@/types/database";
import { InventoryClient } from "./inventory-client";

export default async function InventoryPage({
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

  const { data: rawMembership } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!rawMembership) redirect("/dashboard");
  const membership = rawMembership as unknown as ClusterMember;

  // Fetch inventory, books, and locations
  const [inventoryResult, booksResult, locationsResult] = await Promise.all([
    supabase.from("inventory").select("*").eq("cluster_id", id),
    supabase
      .from("ruhi_books")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("storage_locations")
      .select("*")
      .eq("cluster_id", id)
      .eq("is_active", true),
  ]);

  const inventory = (inventoryResult.data ?? []) as unknown as Inventory[];
  const books = (booksResult.data ?? []) as unknown as RuhiBook[];
  const locations = (locationsResult.data ?? []) as unknown as StorageLocation[];

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
        <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
      </div>

      <InventoryClient
        clusterId={id}
        inventory={inventory}
        books={books}
        locations={locations}
        isAdmin={membership.cluster_role === "admin"}
      />
    </div>
  );
}
