import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  BookOrder,
  BookOrderItem,
  ClusterMember,
  PayerInstitution,
  Profile,
  RuhiBook,
  StorageLocation,
} from "@/types/database";
import type { BookWithAvailability } from "@/components/forms/book-picker";
import { OrderDetailClient } from "./order-detail-client";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string; orderId: string }>;
}) {
  const { id, orderId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();
  if (!membership) redirect("/dashboard");

  const [
    orderRes,
    itemsRes,
    booksRes,
    locationsRes,
    profilesRes,
    institutionsRes,
    inventoryRes,
  ] = await Promise.all([
    supabase.from("book_orders").select("*").eq("id", orderId).single(),
    supabase
      .from("book_order_items")
      .select("*")
      .eq("order_id", orderId),
    supabase.from("ruhi_books").select("*").eq("is_active", true),
    supabase
      .from("storage_locations")
      .select("*")
      .eq("cluster_id", id),
    supabase
      .from("cluster_members")
      .select("*, profiles!cluster_members_user_id_fkey(id, full_name, email, role, created_at, updated_at)")
      .eq("cluster_id", id)
      .eq("status", "active"),
    supabase
      .from("payer_institutions")
      .select("*")
      .eq("cluster_id", id),
    supabase
      .from("inventory")
      .select("ruhi_book_id, quantity")
      .eq("cluster_id", id),
  ]);

  if (!orderRes.data) redirect(`/clusters/${id}/orders`);

  const order = orderRes.data as BookOrder;
  if (order.cluster_id !== id) redirect(`/clusters/${id}/orders`);

  const items = (itemsRes.data ?? []) as BookOrderItem[];
  const rawBooks = (booksRes.data ?? []) as RuhiBook[];
  const locations = (locationsRes.data ?? []) as StorageLocation[];
  const profiles = (profilesRes.data ?? [])
    .map((row) => (row as unknown as { profiles: Profile | null }).profiles)
    .filter((p): p is Profile => p !== null);
  const institutions = (institutionsRes.data ?? []) as PayerInstitution[];

  // Aggregate inventory per book so BookPicker can show "N avail." per item.
  const availabilityMap = new Map<string, number>();
  for (const row of (inventoryRes.data ?? []) as {
    ruhi_book_id: string;
    quantity: number;
  }[]) {
    availabilityMap.set(
      row.ruhi_book_id,
      (availabilityMap.get(row.ruhi_book_id) ?? 0) + row.quantity
    );
  }
  const books: BookWithAvailability[] = rawBooks.map((b) => ({
    ...b,
    available: availabilityMap.get(b.id) ?? 0,
  }));

  return (
    <OrderDetailClient
      clusterId={id}
      isAdmin={(membership as unknown as ClusterMember).cluster_role === "admin"}
      order={order}
      items={items}
      books={books}
      locations={locations}
      profiles={profiles}
      institutions={institutions}
    />
  );
}
