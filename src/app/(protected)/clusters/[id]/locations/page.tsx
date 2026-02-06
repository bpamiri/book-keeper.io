import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { StorageLocation, ClusterMember } from "@/types/database";
import { LocationsClient } from "./locations-client";

export default async function LocationsPage({
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

  const { data: rawLocations } = await supabase
    .from("storage_locations")
    .select("*")
    .eq("cluster_id", id)
    .order("name");

  const locations = (rawLocations ?? []) as unknown as StorageLocation[];

  // Get inventory counts per location
  const { data: rawInventory } = await supabase
    .from("inventory")
    .select("storage_location_id, quantity")
    .eq("cluster_id", id);

  const inventoryCounts = new Map<string, number>();
  for (const item of (rawInventory ?? []) as unknown as {
    storage_location_id: string;
    quantity: number;
  }[]) {
    const current = inventoryCounts.get(item.storage_location_id) ?? 0;
    inventoryCounts.set(item.storage_location_id, current + item.quantity);
  }

  const locationsWithCounts = locations.map((loc) => ({
    ...loc,
    bookCount: inventoryCounts.get(loc.id) ?? 0,
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
        <h1 className="text-2xl font-bold tracking-tight">
          Storage Locations
        </h1>
      </div>

      <LocationsClient
        clusterId={id}
        locations={locationsWithCounts}
        isAdmin={membership.cluster_role === "admin"}
      />
    </div>
  );
}
