import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sidebar } from "@/components/sidebar";
import { UserNav } from "@/components/user-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import type { Profile } from "@/types/database";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  // Guard: redirect incomplete invite profiles to /invite/accept
  if (!rawProfile.full_name) {
    const adminClient = createAdminClient();
    const { data: pendingInvites } = await adminClient
      .from("cluster_members")
      .select("id")
      .eq("email", user.email!)
      .eq("status", "pending")
      .limit(1);

    if (pendingInvites && pendingInvites.length > 0) {
      redirect("/invite/accept");
    }
  }

  const typedProfile = rawProfile as unknown as Profile;

  return (
    <div className="flex min-h-svh">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r lg:block">
        <Sidebar profile={typedProfile} />
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b px-4 lg:px-6">
          <MobileNav profile={typedProfile} />
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
            <UserNav profile={typedProfile} />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
