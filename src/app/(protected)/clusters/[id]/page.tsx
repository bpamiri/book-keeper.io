import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  MapPin,
  Users,
  Package,
  ClipboardList,
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
import type { Cluster, ClusterMember } from "@/types/database";
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
  const [inventoryResult, locationsResult, requestsResult, membersResult] =
    await Promise.all([
      supabase.from("inventory").select("quantity").eq("cluster_id", id),
      supabase
        .from("storage_locations")
        .select("id")
        .eq("cluster_id", id)
        .eq("is_active", true),
      supabase
        .from("book_requests")
        .select("id")
        .eq("cluster_id", id)
        .eq("status", "pending"),
      supabase
        .from("cluster_members")
        .select("id")
        .eq("cluster_id", id)
        .eq("status", "active"),
    ]);

  const totalBooks = (
    (inventoryResult.data ?? []) as { quantity: number }[]
  ).reduce((sum, item) => sum + item.quantity, 0);
  const locationCount = locationsResult.data?.length ?? 0;
  const pendingRequests = requestsResult.data?.length ?? 0;
  const memberCount = membersResult.data?.length ?? 0;

  const isAdmin = membership.cluster_role === "admin";

  const navItems = [
    {
      title: "Inventory",
      description: `${totalBooks} books tracked`,
      href: `/clusters/${id}/inventory`,
      icon: BookOpen,
    },
    {
      title: "Locations",
      description: `${locationCount} storage locations`,
      href: `/clusters/${id}/locations`,
      icon: MapPin,
    },
    {
      title: "Requests",
      description: `${pendingRequests} pending`,
      href: `/clusters/${id}/requests`,
      icon: ClipboardList,
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
        </div>
      )}
    </div>
  );
}
