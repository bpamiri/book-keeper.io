import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClusterMember, PayerInstitution } from "@/types/database";
import { InstitutionsClient } from "./institutions-client";

export default async function PayerInstitutionsPage({
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

  const { data } = await supabase
    .from("payer_institutions")
    .select("*")
    .eq("cluster_id", id)
    .order("sort_order")
    .order("name");

  const institutions = (data ?? []) as PayerInstitution[];

  return <InstitutionsClient clusterId={id} institutions={institutions} />;
}
