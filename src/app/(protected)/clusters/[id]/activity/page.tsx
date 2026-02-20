import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  InventoryLog,
  RuhiBook,
  StorageLocation,
  Profile,
  ClusterMember,
} from "@/types/database";
import { ActivityClient } from "./activity-client";

export default async function ActivityPage({
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

  // Fetch last 100 log entries
  const { data: rawLogs } = await supabase
    .from("inventory_log")
    .select("*")
    .eq("cluster_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  const logs = (rawLogs ?? []) as unknown as InventoryLog[];

  // Fetch related data for display
  const bookIds = [...new Set(logs.map((l) => l.ruhi_book_id))];
  const locationIds = [...new Set(logs.map((l) => l.storage_location_id))];
  const performerIds = [...new Set(logs.map((l) => l.performed_by))];

  const [booksResult, locationsResult, profilesResult] = await Promise.all([
    bookIds.length > 0
      ? supabase.from("ruhi_books").select("*").in("id", bookIds)
      : { data: [] },
    locationIds.length > 0
      ? supabase.from("storage_locations").select("*").in("id", locationIds)
      : { data: [] },
    performerIds.length > 0
      ? supabase.from("profiles").select("*").in("id", performerIds)
      : { data: [] },
  ]);

  const books = (booksResult.data ?? []) as unknown as RuhiBook[];
  const locations = (locationsResult.data ?? []) as unknown as StorageLocation[];
  const profiles = (profilesResult.data ?? []) as unknown as Profile[];

  const bookMap = Object.fromEntries(books.map((b) => [b.id, b]));
  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l]));
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));

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
        <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-muted-foreground">
          Recent inventory changes and actions in this cluster.
        </p>
      </div>

      <ActivityClient
        logs={logs}
        bookMap={bookMap}
        locationMap={locationMap}
        profileMap={profileMap}
      />
    </div>
  );
}
