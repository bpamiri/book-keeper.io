import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClusterMember, Profile } from "@/types/database";
import { MembersClient } from "./members-client";

export default async function MembersPage({
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

  // Verify current user's membership
  const { data: rawMembership } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!rawMembership) redirect("/dashboard");
  const currentMembership = rawMembership as unknown as ClusterMember;

  // Get all members
  const { data: rawMembers } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .order("invited_at", { ascending: false });

  const members = (rawMembers ?? []) as unknown as ClusterMember[];

  // Get profile info for members with user_ids
  const userIds = members
    .map((m) => m.user_id)
    .filter((uid): uid is string => uid !== null);

  let profiles: Profile[] = [];
  if (userIds.length > 0) {
    const { data: rawProfiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", userIds);
    profiles = (rawProfiles ?? []) as unknown as Profile[];
  }

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const activeMembers = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");

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
        <h1 className="text-2xl font-bold tracking-tight">Members</h1>
      </div>

      <MembersClient
        clusterId={id}
        currentUserId={user.id}
        isAdmin={currentMembership.cluster_role === "admin"}
        activeMembers={activeMembers}
        pendingMembers={pendingMembers}
        profileMap={Object.fromEntries(profileMap)}
      />
    </div>
  );
}
