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
