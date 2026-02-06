import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Profile, ClusterMember, Cluster } from "@/types/database";
import { UserActions } from "./user-actions";

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const authProfile = rawProfile as unknown as Pick<Profile, "role"> | null;

  if (!authProfile || authProfile.role !== "platform_admin") {
    redirect("/dashboard");
  }

  const adminClient = createAdminClient();

  const [profilesResult, membersResult, clustersResult] = await Promise.all([
    adminClient.from("profiles").select("*").order("created_at", { ascending: false }),
    adminClient.from("cluster_members").select("*"),
    adminClient.from("clusters").select("id, name"),
  ]);

  const profiles = (profilesResult.data ?? []) as Profile[];
  const members = (membersResult.data ?? []) as ClusterMember[];
  const clusters = (clustersResult.data ?? []) as Pick<Cluster, "id" | "name">[];

  const clusterMap = new Map(clusters.map((c) => [c.id, c.name]));

  // Build user → cluster names mapping
  const userClusters: Record<string, string[]> = {};
  for (const m of members) {
    if (m.user_id) {
      if (!userClusters[m.user_id]) {
        userClusters[m.user_id] = [];
      }
      const name = clusterMap.get(m.cluster_id);
      if (name) {
        userClusters[m.user_id].push(name);
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">
          Manage user accounts and platform roles.
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No users found.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Clusters</TableHead>
                <TableHead className="w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.full_name || "Unnamed"}
                    <p className="text-xs text-muted-foreground font-normal sm:hidden">
                      {p.email}
                    </p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {p.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        p.role === "platform_admin" ? "default" : "secondary"
                      }
                    >
                      {p.role === "platform_admin" ? "Admin" : "User"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {userClusters[p.id]?.length ? (
                      <span className="text-sm text-muted-foreground">
                        {userClusters[p.id].join(", ")}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <UserActions
                      userId={p.id}
                      currentRole={p.role}
                      isSelf={p.id === user.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
