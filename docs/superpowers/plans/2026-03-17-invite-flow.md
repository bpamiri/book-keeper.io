# Invite Flow Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing login/signup landing for invited users with a dedicated `/invite/accept` page that collects their name and redirects them into the cluster they were invited to.

**Architecture:** The auth callback route branches on `type === 'invite'` to redirect new invited users to a standalone accept page (outside the `(protected)` layout group). That page fetches pending invites via admin client, collects the user's name, activates memberships, and redirects into the cluster.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Auth + admin client, TypeScript, Tailwind, shadcn/ui components (Card, Input, Button, Label), sonner for toasts.

**Spec:** `docs/superpowers/specs/2026-03-17-invite-flow-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/app/actions/members.ts` | Add `acceptInvite` server action (admin client for RLS bypass) |
| `src/app/auth/callback/route.ts` | Branch invite flows to `/invite/accept` |
| `src/app/invite/accept/page.tsx` | Server component: auth check, fetch pending invites, render client component |
| `src/app/invite/accept/invite-accept-client.tsx` | Client component: name form, submit, redirect |
| `src/app/(protected)/layout.tsx` | Guard: redirect incomplete invite profiles to `/invite/accept` |

---

## Task 1: Add `acceptInvite` Server Action

**Files:**
- Modify: `src/app/actions/members.ts` (append after `removeMember` at line 177)

- [ ] **Step 1: Add the `acceptInvite` action**

Append to `src/app/actions/members.ts` after the `removeMember` function:

```typescript
export async function acceptInvite(fullName: string) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const trimmedName = fullName.trim()
    if (!trimmedName) return { error: 'Name is required' }

    // Update the user's profile name
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: trimmedName })
      .eq('id', user.id)

    if (profileError) return { error: profileError.message }

    // Activate all pending cluster memberships (admin client bypasses RLS)
    const adminClient = createAdminClient()
    const { data: activated, error: activateError } = await adminClient
      .from('cluster_members')
      .update({
        user_id: user.id,
        status: 'active',
        joined_at: new Date().toISOString(),
      })
      .eq('email', user.email!)
      .eq('status', 'pending')
      .select('cluster_id')

    if (activateError) return { error: activateError.message }

    // Return first cluster ID for redirect, or null if none activated
    const clusterId = activated && activated.length > 0 ? activated[0].cluster_id : null
    if (clusterId) revalidatePath(`/clusters/${clusterId}`)

    return { data: { clusterId } }
  } catch {
    return { error: 'Failed to accept invite' }
  }
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds (compiled successfully)

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/members.ts
git commit -m "feat: add acceptInvite server action"
```

---

## Task 2: Create `/invite/accept` Page and Client Component

**Files:**
- Create: `src/app/invite/accept/page.tsx`
- Create: `src/app/invite/accept/invite-accept-client.tsx`

Both files must be created together since the server component imports the client component.

- [ ] **Step 1: Create the server component**

Create `src/app/invite/accept/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { InviteAcceptClient } from './invite-accept-client'

export default async function InviteAcceptPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch profile to check if name is already set
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // Fetch pending invites with cluster names (admin client bypasses RLS)
  const adminClient = createAdminClient()
  const { data: pendingInvites } = await adminClient
    .from('cluster_members')
    .select('id, cluster_id, clusters(name)')
    .eq('email', user.email!)
    .eq('status', 'pending')

  // No pending invites — nothing to accept
  if (!pendingInvites || pendingInvites.length === 0) {
    redirect('/dashboard')
  }

  const clusterNames = pendingInvites
    .map((invite) => (invite.clusters as unknown as { name: string })?.name)
    .filter(Boolean)

  return (
    <InviteAcceptClient
      clusterNames={clusterNames}
      existingName={profile?.full_name || ''}
    />
  )
}
```

- [ ] **Step 2: Create the client component**

**Reference for styling patterns:** `src/app/(auth)/login/page.tsx` (centered card layout, Loader2 spinner, sonner toasts)

Create `src/app/invite/accept/invite-accept-client.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { acceptInvite } from '@/app/actions/members'

interface InviteAcceptClientProps {
  clusterNames: string[]
  existingName: string
}

export function InviteAcceptClient({ clusterNames, existingName }: InviteAcceptClientProps) {
  const router = useRouter()
  const [fullName, setFullName] = useState(existingName)
  const [loading, setLoading] = useState(false)
  const hasName = !!existingName

  const clusterList = clusterNames.length === 1
    ? clusterNames[0]
    : clusterNames.slice(0, -1).join(', ') + ' and ' + clusterNames[clusterNames.length - 1]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = fullName.trim()
    if (!trimmed) return

    setLoading(true)
    const result = await acceptInvite(trimmed)
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    const clusterId = result.data?.clusterId
    if (clusterId) {
      router.push(`/clusters/${clusterId}`)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="size-8" />
            <span className="text-2xl font-bold">BookKeeper</span>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">You&apos;ve been invited!</CardTitle>
            <CardDescription>
              You&apos;ve been invited to join <strong>{clusterList}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!hasName && (
                <div className="space-y-2">
                  <Label htmlFor="full-name">Full Name</Label>
                  <Input
                    id="full-name"
                    type="text"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !fullName.trim()}
              >
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Get Started
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/invite/accept/
git commit -m "feat: add /invite/accept page with name collection"
```

---

## Task 3: Branch Invite Flows in Auth Callback

**Files:**
- Modify: `src/app/auth/callback/route.ts` (lines 27-56)

- [ ] **Step 1: Update the callback to branch on invite type**

In `src/app/auth/callback/route.ts`, replace lines 27-56 (the success block after auth verification) with:

```typescript
  if (!authError && (token_hash || code)) {
    // Get the authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // For invite flows, redirect to the accept page (skip member activation)
    if (type === 'invite') {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      const baseUrl = isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin

      return NextResponse.redirect(`${baseUrl}/invite/accept`)
    }

    // For non-invite flows (magic link, OAuth), activate pending members as before
    if (user?.email) {
      const admin = createAdminClient()
      await admin
        .from('cluster_members')
        .update({
          user_id: user.id,
          status: 'active',
          joined_at: new Date().toISOString(),
        })
        .eq('email', user.email)
        .eq('status', 'pending')
    }

    const forwardedHost = request.headers.get('x-forwarded-host')
    const isLocalEnv = process.env.NODE_ENV === 'development'

    if (isLocalEnv) {
      return NextResponse.redirect(`${origin}${next}`)
    } else if (forwardedHost) {
      return NextResponse.redirect(`https://${forwardedHost}${next}`)
    } else {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }
```

- [ ] **Step 2: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "feat: redirect invite flows to /invite/accept"
```

---

## Task 4: Add Protected Layout Guard

**Files:**
- Modify: `src/app/(protected)/layout.tsx` (lines 1-33)

- [ ] **Step 1: Add the incomplete invite profile guard**

In `src/app/(protected)/layout.tsx`, add the `createAdminClient` import and the guard check after the profile fetch. Replace lines 1-33 with:

```tsx
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
```

The rest of the file (lines 37-58, the JSX return) stays the same.

- [ ] **Step 2: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/layout.tsx
git commit -m "feat: guard incomplete invite profiles in protected layout"
```

---

## Task 5: Integration Verification

- [ ] **Step 1: Full build verification**

Run: `npx next build 2>&1 | tail -20`
Expected: All routes compile, no errors. `/invite/accept` appears as a dynamic route.

- [ ] **Step 2: Verify route structure**

Confirm the build output shows:
- `ƒ /invite/accept` — dynamic (server-rendered)
- All existing routes still present and unchanged

- [ ] **Step 3: Final commit and push**

```bash
git push origin main
```

This triggers a Vercel deployment. After deploy completes, test the full invite flow end-to-end via the Supabase dashboard (once the project is unpaused).
