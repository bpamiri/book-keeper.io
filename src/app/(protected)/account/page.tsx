import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountClient } from "./account-client";

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const pendingEmail =
    typeof user.new_email === "string" && user.new_email
      ? user.new_email
      : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your email address and password.
        </p>
      </div>
      <AccountClient
        currentEmail={user.email ?? ""}
        pendingEmail={pendingEmail}
      />
    </div>
  );
}
