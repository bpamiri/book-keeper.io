import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  BookOrder,
  BookOrderItem,
  ClusterMember,
  PayerInstitution,
  Profile,
} from "@/types/database";
import { OrdersClient } from "./orders-client";

export default async function OrdersPage({
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

  const [ordersRes, itemsRes, membersRes, institutionsRes] = await Promise.all([
    supabase
      .from("book_orders")
      .select("*")
      .eq("cluster_id", id)
      .order("order_date", { ascending: false }),
    supabase
      .from("book_order_items")
      .select("*, book_orders!inner(cluster_id)")
      .eq("book_orders.cluster_id", id),
    supabase
      .from("cluster_members")
      .select("*, profiles!cluster_members_user_id_fkey(id, full_name, email, role, created_at, updated_at)")
      .eq("cluster_id", id)
      .eq("status", "active"),
    supabase
      .from("payer_institutions")
      .select("*")
      .eq("cluster_id", id),
  ]);

  const orders = (ordersRes.data ?? []) as unknown as BookOrder[];
  const items = (itemsRes.data ?? []) as unknown as (BookOrderItem & {
    book_orders: { cluster_id: string };
  })[];
  const profiles = (membersRes.data ?? [])
    .map((row) => (row as unknown as { profiles: Profile | null }).profiles)
    .filter((p): p is Profile => p !== null);
  const institutions = (institutionsRes.data ?? []) as unknown as PayerInstitution[];

  return (
    <OrdersClient
      clusterId={id}
      isAdmin={membership.cluster_role === "admin"}
      orders={orders}
      items={items}
      profiles={profiles}
      institutions={institutions}
    />
  );
}
