import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  ClusterBookPricing,
  ClusterMember,
  PayerInstitution,
  Profile,
  RuhiBook,
  StorageLocation,
} from "@/types/database";
import type { BookWithAvailability } from "@/components/forms/book-picker";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage({
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

  const { data: membership } = await supabase
    .from("cluster_members")
    .select("*")
    .eq("cluster_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!membership) redirect("/dashboard");
  const m = membership as unknown as ClusterMember;
  if (m.cluster_role !== "admin") {
    redirect(`/clusters/${id}/orders`);
  }

  const [
    booksRes,
    locationsRes,
    membersRes,
    institutionsRes,
    pricingRes,
    inventoryRes,
  ] = await Promise.all([
    supabase.from("ruhi_books").select("*").eq("is_active", true),
    supabase
      .from("storage_locations")
      .select("*")
      .eq("cluster_id", id)
      .eq("is_active", true),
    supabase
      .from("cluster_members")
      .select("*, profiles!cluster_members_user_id_fkey(id, full_name, email)")
      .eq("cluster_id", id)
      .eq("status", "active"),
    supabase
      .from("payer_institutions")
      .select("*")
      .eq("cluster_id", id)
      .eq("is_active", true),
    supabase
      .from("cluster_book_pricing")
      .select("*")
      .eq("cluster_id", id),
    supabase
      .from("inventory")
      .select("ruhi_book_id, quantity")
      .eq("cluster_id", id),
  ]);

  const rawBooks = (booksRes.data ?? []) as RuhiBook[];
  const locations = (locationsRes.data ?? []) as StorageLocation[];
  const memberProfiles = (membersRes.data ?? [])
    .map((row) => (row as unknown as { profiles: Profile | null }).profiles)
    .filter((p): p is Profile => p !== null);
  const institutions = (institutionsRes.data ?? []) as PayerInstitution[];
  const pricing = (pricingRes.data ?? []) as ClusterBookPricing[];

  // Aggregate inventory per book (across all locations / languages / statuses)
  // so the book dropdown can show "N avail." next to each title.
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
    <NewOrderForm
      clusterId={id}
      books={books}
      locations={locations}
      profiles={memberProfiles}
      institutions={institutions}
      pricing={pricing}
    />
  );
}
