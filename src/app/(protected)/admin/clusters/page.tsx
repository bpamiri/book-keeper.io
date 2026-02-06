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
import type { Cluster, Profile } from "@/types/database";
import { CreateClusterDialog } from "./create-cluster-dialog";

export default async function AdminClustersPage() {
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

  const profile = rawProfile as unknown as Pick<Profile, "role"> | null;

  if (!profile || profile.role !== "platform_admin") {
    redirect("/dashboard");
  }

  const adminClient = createAdminClient();

  const { data: rawClusters } = await adminClient
    .from("clusters")
    .select("*")
    .order("created_at", { ascending: false });

  const clusters = (rawClusters ?? []) as Cluster[];

  // Get member counts per cluster
  const clusterIds = clusters.map((c) => c.id);
  let memberCounts: Record<string, number> = {};
  if (clusterIds.length > 0) {
    const { data: rawMembers } = await adminClient
      .from("cluster_members")
      .select("cluster_id");

    const members = (rawMembers ?? []) as { cluster_id: string }[];
    memberCounts = members.reduce(
      (acc, m) => {
        acc[m.cluster_id] = (acc[m.cluster_id] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clusters</h1>
          <p className="text-muted-foreground">
            Manage geographic clusters and their members.
          </p>
        </div>
        <CreateClusterDialog />
      </div>

      {clusters.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No clusters yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-normal">Name</TableHead>
                <TableHead className="hidden sm:table-cell">Region</TableHead>
                <TableHead>Members</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clusters.map((cluster) => (
                <TableRow key={cluster.id}>
                  <TableCell className="font-medium whitespace-normal">
                    {cluster.name}
                    {cluster.description && (
                      <p className="text-xs text-muted-foreground font-normal">
                        {cluster.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {cluster.region ? (
                      <Badge variant="secondary">{cluster.region}</Badge>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {memberCounts[cluster.id] ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {new Date(cluster.created_at).toLocaleDateString()}
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
