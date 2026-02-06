import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Users, MapPin, ArrowRight, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Cluster, ClusterMember, Profile } from "@/types/database";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!rawProfile) {
    redirect("/login");
  }

  const profile = rawProfile as unknown as Profile;

  // Get cluster memberships for the user
  const { data: rawMemberships } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active");

  const memberships = (rawMemberships ?? []) as ClusterMember[];

  // Get all clusters the user belongs to
  const clusterIds = memberships.map((m) => m.cluster_id);
  let clusters: Cluster[] = [];
  if (clusterIds.length > 0) {
    const { data } = await supabase
      .from("clusters")
      .select("*")
      .in("id", clusterIds);
    clusters = (data ?? []) as Cluster[];
  }

  // Build cluster map for quick lookup
  const clusterMap = new Map(clusters.map((c) => [c.id, c]));

  // Get inventory totals and pending requests per cluster
  const clusterData = await Promise.all(
    memberships.map(async (membership) => {
      const cluster = clusterMap.get(membership.cluster_id);
      if (!cluster) return null;

      const [inventoryResult, requestsResult, locationsResult] =
        await Promise.all([
          supabase
            .from("inventory")
            .select("quantity")
            .eq("cluster_id", cluster.id),
          supabase
            .from("book_requests")
            .select("id")
            .eq("cluster_id", cluster.id)
            .eq("status", "pending"),
          supabase
            .from("storage_locations")
            .select("id")
            .eq("cluster_id", cluster.id)
            .eq("is_active", true),
        ]);

      const inventoryRows = (inventoryResult.data ?? []) as { quantity: number }[];
      const totalBooks = inventoryRows.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      return {
        membership,
        cluster,
        totalBooks,
        pendingRequests: requestsResult.data?.length ?? 0,
        locationCount: locationsResult.data?.length ?? 0,
      };
    })
  );

  const validClusterData = clusterData.filter(
    (d): d is NonNullable<typeof d> => d !== null
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {profile.full_name || "there"}. Here are your clusters.
        </p>
      </div>

      {validClusterData.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="mb-4 size-12 text-muted-foreground" />
            <h3 className="text-lg font-semibold">No clusters yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              You have not been added to any clusters. Ask your cluster
              administrator for an invitation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {validClusterData.map(
            ({
              membership,
              cluster,
              totalBooks,
              pendingRequests,
              locationCount,
            }) => (
              <Card key={membership.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{cluster.name}</CardTitle>
                      {cluster.region && (
                        <CardDescription>{cluster.region}</CardDescription>
                      )}
                    </div>
                    <Badge
                      variant={
                        membership.cluster_role === "admin"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {membership.cluster_role}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="flex items-center justify-center">
                        <BookOpen className="size-4 text-muted-foreground" />
                      </div>
                      <p className="mt-1 text-2xl font-bold">{totalBooks}</p>
                      <p className="text-xs text-muted-foreground">Books</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center">
                        <MapPin className="size-4 text-muted-foreground" />
                      </div>
                      <p className="mt-1 text-2xl font-bold">
                        {locationCount}
                      </p>
                      <p className="text-xs text-muted-foreground">Locations</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center">
                        <Users className="size-4 text-muted-foreground" />
                      </div>
                      <p className="mt-1 text-2xl font-bold">
                        {pendingRequests}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pending
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <Link href={`/clusters/${cluster.id}`}>
                        View Cluster
                        <ArrowRight className="ml-1 size-3" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}
