'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createCluster(data: {
  name: string
  state_code?: string | null
  sub_region_code?: string | null
  cluster_number?: number | null
  description?: string | null
}) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    // Verify platform admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'platform_admin') {
      return { error: 'Only platform admins can create clusters' }
    }

    const { data: cluster, error } = await supabase
      .from('clusters')
      .insert({
        name: data.name,
        state_code: data.state_code ?? null,
        sub_region_code: data.sub_region_code ?? null,
        cluster_number: data.cluster_number ?? null,
        description: data.description ?? null,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath('/dashboard')
    revalidatePath('/admin/clusters')
    return { data: cluster }
  } catch {
    return { error: 'Failed to create cluster' }
  }
}

export async function updateCluster(
  id: string,
  data: {
    name?: string
    state_code?: string | null
    sub_region_code?: string | null
    cluster_number?: number | null
    description?: string | null
  }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: cluster, error } = await supabase
      .from('clusters')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${id}`)
    revalidatePath('/dashboard')
    revalidatePath('/admin/clusters')
    return { data: cluster }
  } catch {
    return { error: 'Failed to update cluster' }
  }
}

export async function deleteCluster(id: string) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    // Verify platform admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'platform_admin') {
      return { error: 'Only platform admins can delete clusters' }
    }

    const { error } = await supabase
      .from('clusters')
      .delete()
      .eq('id', id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard')
    revalidatePath('/admin/clusters')
    return { data: { success: true } }
  } catch {
    return { error: 'Failed to delete cluster' }
  }
}
