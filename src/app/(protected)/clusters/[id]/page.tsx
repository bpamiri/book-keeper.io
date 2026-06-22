import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  MapPin,
  Users,
  Package,
  ClipboardList,
  History,
  ShoppingCart,
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
import type { Cluster, ClusterMember, RequestStatus } from "@/types/database";
import { clusterDisplayId } from "@/lib/clusters";

export default async function ClusterDetailPage({
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

  // Verify membership
  const { data: rawMembership } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!rawMembership) redirect("/dashboard");
  const membership = rawMembership as unknown as ClusterMember;

  // Get cluster details
  const { data: rawCluster } = await supabase
    .from("clusters")
    .select("*")
    .eq("id", id)
    .single();

  if (!rawCluster) redirect("/dashboard");
  const cluster = rawCluster as unknown as Cluster;

  // Get stats
  const [
    inventoryResult,
    locationsResult,
    requestsResult,
    membersResult,
    ordersResult,
  ] = await Promise.all([
    supabase.from("inventory").select("quantity").eq("cluster_id", id),
    supabase
      .from("storage_locations")
      .select("id")
      .eq("cluster_id", id)
      .eq("is_active", true),
    supabase.from("book_requests").select("status").eq("cluster_id", id),
    supabase
      .from("cluster_members")
      .select("id")
      .eq("cluster_id", id)
      .eq("status", "active"),
    supabase
      .from("book_orders")
      .select("id, reimbursement_status")
      .eq("cluster_id", id),
  ]);

  const totalBooks = (
    (inventoryResult.data ?? []) as { quantity: number }[]
  ).reduce((sum, item) => sum + item.quantity, 0);
  const locationCount = locationsResult.data?.length ?? 0;
  const requestRows = (requestsResult.data ?? []) as { status: RequestStatus }[];
  const totalRequests = requestRows.length;
  const pendingRequests = requestRows.filter(
    (r) => r.status === "pending"
  ).length;
  const pendingFulfillment = requestRows.filter(
    (r) => r.status === "approved"
  ).length;
  const fulfilledRequests = requestRows.filter(
    (r) => r.status === "fulfilled"
  ).length;
  // "Approved" counts every request that has been greenlit, including those
  // already fulfilled — it equals Pending Fulfillment plus Fulfilled.
  const approvedRequests = requestRows.filter(
    (r) => r.status === "approved" || r.status === "fulfilled"
  ).length;
  const memberCount = membersResult.data?.length ?? 0;
  const totalOrders = ordersResult.data?.length ?? 0;
  const owedOrders = (ordersResult.data ?? []).filter(
    (o) => o.reimbursement_status === "owed" || o.reimbursement_status === "partial"
  ).length;

  const isAdmin = membership.cluster_role === "admin";

  const navItems = [
    {
      title: "Manage Inventory",
      description: `${totalBooks} books tracked`,
      href: `/clusters/${id}/inventory`,
      icon: BookOpen,
    },
    {
      title: "Manage Requests",
      description: (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span>Total requests</span>
            <span className="font-medium tabular-nums text-foreground">
              {totalRequests}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Pending Approval</span>
            <span className="font-medium tabular-nums text-foreground">
              {pendingRequests}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Approved</span>
            <span className="font-medium tabular-nums text-foreground">
              {approvedRequests}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Pending Fulfillment</span>
            <span className="font-medium tabular-nums text-foreground">
              {pendingFulfillment}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Fulfilled</span>
            <span className="font-medium tabular-nums text-foreground">
              {fulfilledRequests}
            </span>
          </div>
        </div>
      ),
      href: `/clusters/${id}/requests`,
      icon: ClipboardList,
    },
    {
      title: "Manage Locations",
      description: `${locationCount} storage locations`,
      href: `/clusters/${id}/locations`,
      icon: MapPin,
    },
    {
      title: "Orders",
      description:
        owedOrders > 0
          ? `${totalOrders} total, ${owedOrders} awaiting reimbursement`
          : `${totalOrders} total`,
      href: `/clusters/${id}/orders`,
      icon: ShoppingCart,
    },
    {
      title: "Request Books",
      description: "Submit a new book request",
      href: `/clusters/${id}/request`,
      icon: Package,
    },
    {
      title: "Members",
      description: `${memberCount} members`,
      href: `/clusters/${id}/members`,
      icon: Users,
    },
    {
      title: "Activity Log",
      description: "Recent inventory changes",
      href: `/clusters/${id}/activity`,
      icon: History,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:underline"
            >
              Dashboard
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{cluster.name}</h1>
          {clusterDisplayId(cluster) && (
            <p className="text-muted-foreground">{clusterDisplayId(cluster)}</p>
          )}
          {cluster.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {cluster.description}
            </p>
          )}
        </div>
        <Badge variant={isAdmin ? "default" : "secondary"}>
          {membership.cluster_role}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <item.icon className="size-5 text-muted-foreground" />
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{item.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {isAdmin && (
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/clusters/${id}/members`}>Invite Members</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/clusters/${id}/orders/payer-institutions`}>
              Manage Payer Institutions
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/clusters/${id}/orders/pricing`}>
              Manage Pricing
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
