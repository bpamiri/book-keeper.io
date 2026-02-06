'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createLocation(data: {
  cluster_id: string
  name: string
  address?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  notes?: string | null
}) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: location, error } = await supabase
      .from('storage_locations')
      .insert({
        cluster_id: data.cluster_id,
        name: data.name,
        address: data.address ?? null,
        contact_name: data.contact_name ?? null,
        contact_phone: data.contact_phone ?? null,
        contact_email: data.contact_email ?? null,
        notes: data.notes ?? null,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${data.cluster_id}`)
    return { data: location }
  } catch {
    return { error: 'Failed to create location' }
  }
}

export async function updateLocation(
  id: string,
  data: {
    name?: string
    address?: string | null
    contact_name?: string | null
    contact_phone?: string | null
    contact_email?: string | null
    notes?: string | null
  }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: location, error } = await supabase
      .from('storage_locations')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${location.cluster_id}`)
    return { data: location }
  } catch {
    return { error: 'Failed to update location' }
  }
}

export async function toggleLocationActive(id: string, is_active: boolean) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: location, error } = await supabase
      .from('storage_locations')
      .update({ is_active })
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${location.cluster_id}`)
    return { data: location }
  } catch {
    return { error: 'Failed to toggle location status' }
  }
}
