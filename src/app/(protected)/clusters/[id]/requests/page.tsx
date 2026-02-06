import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  BookRequest,
  RuhiBook,
  Profile,
  ClusterMember,
  StorageLocation,
  Inventory,
} from "@/types/database";
import { RequestsClient } from "./requests-client";

export default async function RequestsPage({
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

  // Get all requests for this cluster
  const { data: rawRequests } = await supabase
    .from("book_requests")
    .select("*")
    .eq("cluster_id", id)
    .order("created_at", { ascending: false });

  const requests = (rawRequests ?? []) as unknown as BookRequest[];

  // Get books for display
  const { data: rawBooks } = await supabase
    .from("ruhi_books")
    .select("*")
    .eq("is_active", true);

  const books = (rawBooks ?? []) as unknown as RuhiBook[];
  const bookMap = Object.fromEntries(books.map((b) => [b.id, b]));

  // Get profiles for display
  const requesterIds = [
    ...new Set(requests.map((r) => r.requested_by)),
  ];
  let profiles: Profile[] = [];
  if (requesterIds.length > 0) {
    const { data: rawProfiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", requesterIds);
    profiles = (rawProfiles ?? []) as unknown as Profile[];
  }
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));

  // Get locations and inventory for fulfill dialog
  const [locationsResult, inventoryResult] = await Promise.all([
    supabase
      .from("storage_locations")
      .select("*")
      .eq("cluster_id", id)
      .eq("is_active", true),
    supabase.from("inventory").select("*").eq("cluster_id", id),
  ]);

  const locations = (locationsResult.data ?? []) as unknown as StorageLocation[];
  const inventory = (inventoryResult.data ?? []) as unknown as Inventory[];

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
        <h1 className="text-2xl font-bold tracking-tight">Book Requests</h1>
      </div>

      <RequestsClient
        requests={requests}
        bookMap={bookMap}
        profileMap={profileMap}
        locations={locations}
        inventory={inventory}
        isAdmin={membership.cluster_role === "admin"}
      />
    </div>
  );
}
