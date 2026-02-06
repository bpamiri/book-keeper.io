import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Users, BookOpen, Library, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/types/database";

export default async function AdminDashboardPage() {
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

  const [clustersResult, profilesResult, inventoryResult, booksResult] =
    await Promise.all([
      adminClient.from("clusters").select("id", { count: "exact", head: true }),
      adminClient.from("profiles").select("id", { count: "exact", head: true }),
      adminClient.from("inventory").select("quantity"),
      adminClient
        .from("ruhi_books")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ]);

  const totalClusters = clustersResult.count ?? 0;
  const totalUsers = profilesResult.count ?? 0;
  const totalBooks = booksResult.count ?? 0;
  const inventoryRows = (inventoryResult.data ?? []) as { quantity: number }[];
  const totalInventory = inventoryRows.reduce(
    (sum, row) => sum + row.quantity,
    0
  );

  const stats = [
    {
      title: "Clusters",
      value: totalClusters,
      icon: Building2,
      href: "/admin/clusters",
      description: "Active clusters",
    },
    {
      title: "Users",
      value: totalUsers,
      icon: Users,
      href: "/admin/users",
      description: "Registered users",
    },
    {
      title: "Book Titles",
      value: totalBooks,
      icon: Library,
      href: "/admin/books",
      description: "Active in catalog",
    },
    {
      title: "Total Inventory",
      value: totalInventory,
      icon: BookOpen,
      href: "/admin/clusters",
      description: "Books across all clusters",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground">
          Platform overview and management tools.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage Clusters</CardTitle>
            <CardDescription>
              Create and manage geographic clusters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/clusters">
                Go to Clusters
                <ArrowRight className="ml-1 size-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage Users</CardTitle>
            <CardDescription>
              View users and manage admin roles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/users">
                Go to Users
                <ArrowRight className="ml-1 size-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Book Catalog</CardTitle>
            <CardDescription>
              Manage the Ruhi book catalog.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/books">
                Go to Books
                <ArrowRight className="ml-1 size-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
