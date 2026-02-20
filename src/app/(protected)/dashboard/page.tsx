import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Users,
  MapPin,
  ArrowRight,
  Package,
  AlertTriangle,
  ClipboardList,
  TrendingUp,
} from "lucide-react";
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
import { clusterDisplayId } from "@/lib/clusters";

const LOW_STOCK_THRESHOLD = 5;

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

  // Get inventory totals, pending requests, low stock, and unique book titles per cluster
  const clusterData = await Promise.all(
    memberships.map(async (membership) => {
      const cluster = clusterMap.get(membership.cluster_id);
      if (!cluster) return null;

      const [inventoryResult, requestsResult, locationsResult, membersResult] =
        await Promise.all([
          supabase
            .from("inventory")
            .select("quantity, ruhi_book_id")
            .eq("cluster_id", cluster.id),
          supabase
            .from("book_requests")
            .select("id, status")
            .eq("cluster_id", cluster.id),
          supabase
            .from("storage_locations")
            .select("id")
            .eq("cluster_id", cluster.id)
            .eq("is_active", true),
          supabase
            .from("cluster_members")
            .select("id")
            .eq("cluster_id", cluster.id)
            .eq("status", "active"),
        ]);

      const inventoryRows = (inventoryResult.data ?? []) as {
        quantity: number;
        ruhi_book_id: string;
      }[];
      const totalBooks = inventoryRows.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
      const uniqueTitles = new Set(inventoryRows.map((i) => i.ruhi_book_id))
        .size;
      const lowStockCount = inventoryRows.filter(
        (i) => i.quantity > 0 && i.quantity <= LOW_STOCK_THRESHOLD
      ).length;

      const requests = (requestsResult.data ?? []) as {
        id: string;
        status: string;
      }[];
      const pendingRequests = requests.filter(
        (r) => r.status === "pending"
      ).length;
      const fulfilledRequests = requests.filter(
        (r) => r.status === "fulfilled"
      ).length;

      return {
        membership,
        cluster,
        totalBooks,
        uniqueTitles,
        lowStockCount,
        pendingRequests,
        fulfilledRequests,
        totalRequests: requests.length,
        locationCount: locationsResult.data?.length ?? 0,
        memberCount: membersResult.data?.length ?? 0,
      };
    })
  );

  const validClusterData = clusterData.filter(
    (d): d is NonNullable<typeof d> => d !== null
  );

  // Aggregate stats across all clusters
  const totalBooksAll = validClusterData.reduce(
    (sum, d) => sum + d.totalBooks,
    0
  );
  const totalPendingAll = validClusterData.reduce(
    (sum, d) => sum + d.pendingRequests,
    0
  );
  const totalLowStockAll = validClusterData.reduce(
    (sum, d) => sum + d.lowStockCount,
    0
  );
  const totalFulfilledAll = validClusterData.reduce(
    (sum, d) => sum + d.fulfilledRequests,
    0
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
        <>
          {/* Aggregate stats */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Inventory
                </CardTitle>
                <BookOpen className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalBooksAll}</div>
                <p className="text-xs text-muted-foreground">
                  Across {validClusterData.length} cluster
                  {validClusterData.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Pending Requests
                </CardTitle>
                <ClipboardList className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalPendingAll}</div>
                <p className="text-xs text-muted-foreground">
                  Awaiting review
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Fulfilled
                </CardTitle>
                <TrendingUp className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalFulfilledAll}</div>
                <p className="text-xs text-muted-foreground">
                  Requests completed
                </p>
              </CardContent>
            </Card>
            {totalLowStockAll > 0 ? (
              <Card className="border-yellow-300 dark:border-yellow-700">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    Low Stock
                  </CardTitle>
                  <AlertTriangle className="size-4 text-yellow-600 dark:text-yellow-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {totalLowStockAll}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Items at {LOW_STOCK_THRESHOLD} or fewer
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    Low Stock
                  </CardTitle>
                  <AlertTriangle className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-xs text-muted-foreground">
                    All items well stocked
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Cluster cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {validClusterData.map(
              ({
                membership,
                cluster,
                totalBooks,
                uniqueTitles,
                lowStockCount,
                pendingRequests,
                locationCount,
                memberCount,
              }) => (
                <Card key={membership.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {cluster.name}
                        </CardTitle>
                        {clusterDisplayId(cluster) && (
                          <CardDescription>
                            {clusterDisplayId(cluster)}
                          </CardDescription>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {lowStockCount > 0 && (
                          <Badge
                            variant="outline"
                            className="border-yellow-400 text-yellow-600 dark:text-yellow-400 text-[10px] px-1.5 py-0"
                          >
                            {lowStockCount} low
                          </Badge>
                        )}
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
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-4 gap-3 text-center">
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
                        <p className="text-xs text-muted-foreground">
                          Locations
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center justify-center">
                          <Users className="size-4 text-muted-foreground" />
                        </div>
                        <p className="mt-1 text-2xl font-bold">
                          {memberCount}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Members
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center justify-center">
                          <ClipboardList className="size-4 text-muted-foreground" />
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
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
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
        </>
      )}
    </div>
  );
}
