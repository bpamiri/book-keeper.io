# Invite Flow Optimization

## Problem

When a user receives a cluster invite email and clicks the link, they land on a generic login/signup page with no invite context. They don't know whether to sign in or sign up. The flow also never collects the user's name, resulting in profiles with `full_name = ''` and a dashboard that greets them with "Welcome back, there."

## Solution

Replace the current invite landing experience with a dedicated `/invite/accept` page. When a user clicks an invite link, the auth callback creates their session and redirects them to a purpose-built page that:

1. Shows which cluster(s) invited them
2. Collects their full name (single input, minimal friction)
3. Activates their cluster membership(s)
4. Redirects them into the cluster they were invited to

The user never sees the login/signup choice. Their email is already verified by clicking the invite link. The only missing piece is their name.

## Current Flow

1. Admin calls `inviteMember` server action
2. For new users: inserts `cluster_members` row with `status: 'pending'`, calls `adminClient.auth.admin.inviteUserByEmail`
3. Supabase sends email with link to `<supabase>/auth/v1/verify?token=...&type=invite&redirect_to=<app>/auth/callback`
4. User clicks link -> Supabase verifies token -> redirects to `/auth/callback?token_hash=...&type=invite`
5. Callback calls `verifyOtp`, bulk-activates all pending `cluster_members`, redirects to `/dashboard`
6. User lands on dashboard with no name on their profile and no invite context

## New Flow

1. Steps 1-4 are unchanged
2. Callback calls `verifyOtp` to create the session
3. Callback detects `type === 'invite'` and redirects to `/invite/accept` (does NOT activate members yet)
4. `/invite/accept` page loads: fetches pending invites with cluster names, shows welcome card
5. User enters their full name, clicks "Get Started"
6. Server action `acceptInvite`: updates `profiles.full_name`, bulk-activates pending `cluster_members`, returns cluster ID
7. User is redirected to `/clusters/[id]` for the cluster they were invited to

## Detailed Design

### Callback Route Changes

**File:** `src/app/auth/callback/route.ts`

Current behavior after `verifyOtp`:
- Bulk-activate all pending `cluster_members` for the user's email
- Redirect to `/dashboard`

New behavior after `verifyOtp`:
- If `type === 'invite'`: skip member activation, redirect to `/invite/accept`
- If any other type (magic link, recovery): keep current behavior (activate members, redirect to `/dashboard`)

### `/invite/accept` Page

**Route:** `src/app/(protected)/invite/accept/page.tsx` (server component)

**On load:**
1. Get authenticated user from session
2. Fetch profile to check if `full_name` is already set
3. Query `cluster_members` where `email = user.email` and `status = 'pending'`, join with `clusters` to get cluster names
4. If no pending invites: redirect to `/dashboard`
5. If `full_name` already set: skip name input, show cluster welcome + confirm button

**Client component:** `src/app/(protected)/invite/accept/invite-accept-client.tsx`

**UI:** Single centered card matching existing auth page aesthetic:
- Heading: "You've been invited!"
- Subtext: "You've been invited to join **[Cluster Name]**" (or list multiple)
- Full Name input (pre-filled if profile already has one)
- "Get Started" button

### New Server Action: `acceptInvite`

**File:** `src/app/actions/members.ts`

**Signature:** `acceptInvite(fullName: string)`

**Steps:**
1. Get authenticated user
2. Update `profiles.full_name` where `id = user.id`
3. Bulk-update `cluster_members`: set `user_id = user.id`, `status = 'active'`, `joined_at = now()` where `email = user.email` and `status = 'pending'`
4. Return the `cluster_id` of the first activated membership (for redirect)

### Protected Layout Guard

**File:** `src/app/(protected)/layout.tsx`

Add check: if `profile.full_name === ''` and user has pending `cluster_members` rows, redirect to `/invite/accept`. This catches:
- User who navigated away mid-invite
- User who bookmarked `/dashboard` and came back
- Browser back button after callback

### Edge Cases

**Expired invite tokens:** Supabase rejects at the `verifyOtp` step. Callback redirects to `/?error=auth_callback_failed`. No change needed.

**Multiple pending invites:** All activated at once on form submit. Welcome page lists all cluster names. Redirect goes to the first cluster.

**Returning user invited to new cluster:** The existing `inviteMember` fast-path sets them to `active` immediately (no email sent). This flow is unchanged.

**Direct navigation to `/invite/accept`:** Page checks for pending invites on load. If none, redirects to `/dashboard`.

## Files Changed

| File | Change |
|------|--------|
| `src/app/auth/callback/route.ts` | Branch on `type === 'invite'`: skip member activation, redirect to `/invite/accept` |
| `src/app/(protected)/invite/accept/page.tsx` | New server component: fetch pending invites + cluster names |
| `src/app/(protected)/invite/accept/invite-accept-client.tsx` | New client component: name input form |
| `src/app/actions/members.ts` | New `acceptInvite(fullName)` action |
| `src/app/(protected)/layout.tsx` | Add guard for incomplete invite profiles |

## Files NOT Changed

- Login page (`src/app/(auth)/login/page.tsx`) -- untouched
- Middleware (`src/lib/supabase/middleware.ts`) -- no changes needed
- `inviteMember` / `resendInvite` actions -- unchanged
- Database schema -- no migrations needed
- `handle_new_user` trigger -- still creates profile with empty name; `/invite/accept` fills it in
