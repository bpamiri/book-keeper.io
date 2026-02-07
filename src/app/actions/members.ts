'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClusterRole } from '@/types/database'

export async function inviteMember(data: {
  cluster_id: string
  email: string
  cluster_role: ClusterRole
}) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const email = data.email.toLowerCase().trim()

    // Check if this email is already a member of this cluster
    const { data: existingMember } = await supabase
      .from('cluster_members')
      .select('id, status')
      .eq('cluster_id', data.cluster_id)
      .eq('email', email)
      .single()

    if (existingMember) {
      return { error: 'This email is already a member or has a pending invite for this cluster' }
    }

    // Check if the user already exists in profiles by email
    const adminClient = createAdminClient()
    const { data: existingProfiles } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    // Insert cluster member record
    const memberData: {
      cluster_id: string
      email: string
      cluster_role: ClusterRole
      status: 'pending' | 'active'
      invited_by: string
      user_id?: string
      joined_at?: string
    } = {
      cluster_id: data.cluster_id,
      email,
      cluster_role: data.cluster_role,
      status: 'pending',
      invited_by: user.id,
    }

    // If user already has an account, link them directly
    if (existingProfiles) {
      memberData.user_id = existingProfiles.id
      memberData.status = 'active'
      memberData.joined_at = new Date().toISOString()
    }

    const { data: member, error: insertError } = await supabase
      .from('cluster_members')
      .insert(memberData)
      .select()
      .single()

    if (insertError) return { error: insertError.message }

    // Send invite email via admin client if user doesn't already exist
    if (!existingProfiles) {
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        }
      )

      if (inviteError) {
        // Don't fail the whole operation — the member record is created
        // The user can still sign up via magic link later
        console.error('Failed to send invite email:', inviteError.message)
      }
    }

    revalidatePath(`/clusters/${data.cluster_id}`)
    return { data: member }
  } catch {
    return { error: 'Failed to invite member' }
  }
}

export async function resendInvite(memberId: string) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const adminClient = createAdminClient()
    const { data: member, error: fetchError } = await adminClient
      .from('cluster_members')
      .select('id, email, status, cluster_id')
      .eq('id', memberId)
      .single()

    if (fetchError || !member) return { error: 'Member not found' }
    if (member.status !== 'pending') return { error: 'Invite can only be resent to pending members' }

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      member.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      }
    )

    if (inviteError) return { error: inviteError.message }

    revalidatePath(`/clusters/${member.cluster_id}`)
    return { data: { success: true } }
  } catch {
    return { error: 'Failed to resend invite' }
  }
}

export async function updateMemberRole(id: string, cluster_role: ClusterRole) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: member, error } = await supabase
      .from('cluster_members')
      .update({ cluster_role })
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${member.cluster_id}`)
    return { data: member }
  } catch {
    return { error: 'Failed to update member role' }
  }
}

export async function removeMember(id: string) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    // Get member info before deleting for revalidation
    const { data: member, error: fetchError } = await supabase
      .from('cluster_members')
      .select('cluster_id')
      .eq('id', id)
      .single()

    if (fetchError || !member) return { error: 'Member not found' }

    const { error } = await supabase
      .from('cluster_members')
      .delete()
      .eq('id', id)

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${member.cluster_id}`)
    return { data: { success: true } }
  } catch {
    return { error: 'Failed to remove member' }
  }
}
