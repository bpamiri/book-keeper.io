'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function verifyClusterAdmin(clusterId: string) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Not authenticated' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'platform_admin') {
    return { user, supabase }
  }

  const { data: membership } = await supabase
    .from('cluster_members')
    .select('cluster_role')
    .eq('cluster_id', clusterId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (membership?.cluster_role === 'admin') {
    return { user, supabase }
  }

  return {
    error:
      'Only cluster admins or platform admins can manage payer institutions' as const,
  }
}

export async function listInstitutions(clusterId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('payer_institutions')
      .select('*')
      .eq('cluster_id', clusterId)
      .order('sort_order')
      .order('name')

    if (error) return { error: error.message }
    return { data: data ?? [] }
  } catch {
    return { error: 'Failed to list institutions' }
  }
}

export async function createInstitution(
  clusterId: string,
  data: { name: string; description?: string | null; sort_order?: number }
) {
  try {
    if (!data.name.trim()) return { error: 'Name is required' }

    const adminCheck = await verifyClusterAdmin(clusterId)
    if ('error' in adminCheck) return { error: adminCheck.error }
    const { user, supabase } = adminCheck

    const { data: inserted, error } = await supabase
      .from('payer_institutions')
      .insert({
        cluster_id: clusterId,
        name: data.name.trim(),
        description: data.description ?? null,
        sort_order: data.sort_order ?? 0,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${clusterId}/orders/payer-institutions`)
    return { data: inserted }
  } catch {
    return { error: 'Failed to create institution' }
  }
}

export async function updateInstitution(
  id: string,
  data: {
    name?: string
    description?: string | null
    sort_order?: number
    is_active?: boolean
  }
) {
  try {
    if (data.name !== undefined && !data.name.trim()) {
      return { error: 'Name cannot be empty' }
    }

    const supabase = await createClient()

    const { data: current, error: fetchError } = await supabase
      .from('payer_institutions')
      .select('cluster_id')
      .eq('id', id)
      .single()
    if (fetchError || !current) return { error: 'Institution not found' }

    const adminCheck = await verifyClusterAdmin(current.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }

    const patch: Record<string, unknown> = {}
    if (data.name !== undefined) patch.name = data.name.trim()
    if (data.description !== undefined) patch.description = data.description
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order
    if (data.is_active !== undefined) patch.is_active = data.is_active

    const { data: updated, error } = await supabase
      .from('payer_institutions')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${current.cluster_id}/orders/payer-institutions`)
    return { data: updated }
  } catch {
    return { error: 'Failed to update institution' }
  }
}

export async function deactivateInstitution(id: string) {
  return updateInstitution(id, { is_active: false })
}
