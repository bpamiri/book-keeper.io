import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { clusterDisplayId } from "@/lib/clusters";
import { MembersClient } from "@/app/(protected)/clusters/[id]/members/members-client";
import type { Cluster, ClusterMember, Profile } from "@/types/database";

export default async function AdminClusterDetailPage({
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

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const profile = rawProfile as unknown as Pick<Profile, "role"> | null;

  if (!profile || profile.role !== "platform_admin") {
    redirect("/dashboard");
  }

  const adminClient = createAdminClient();

  // Fetch cluster details
  const { data: rawCluster } = await adminClient
    .from("clusters")
    .select("*")
    .eq("id", id)
    .single();

  if (!rawCluster) notFound();
  const cluster = rawCluster as unknown as Cluster;

  // Fetch all cluster members
  const { data: rawMembers } = await adminClient
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .order("invited_at", { ascending: false });

  const members = (rawMembers ?? []) as unknown as ClusterMember[];

  // Fetch profiles for members with user_ids
  const userIds = members
    .map((m) => m.user_id)
    .filter((uid): uid is string => uid !== null);

  let profiles: Profile[] = [];
  if (userIds.length > 0) {
    const { data: rawProfiles } = await adminClient
      .from("profiles")
      .select("*")
      .in("id", userIds);
    profiles = (rawProfiles ?? []) as unknown as Profile[];
  }

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const activeMembers = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");

  const displayId = clusterDisplayId(cluster);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/clusters" className="hover:underline">
            Clusters
          </Link>
          <span>/</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{cluster.name}</h1>
        <div className="mt-1 flex items-center gap-2">
          {displayId && <Badge variant="secondary">{displayId}</Badge>}
          {cluster.description && (
            <p className="text-sm text-muted-foreground">
              {cluster.description}
            </p>
          )}
        </div>
      </div>

      <MembersClient
        clusterId={id}
        currentUserId={user.id}
        isAdmin={true}
        activeMembers={activeMembers}
        pendingMembers={pendingMembers}
        profileMap={profileMap}
      />
    </div>
  );
}
