'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { BookLanguage } from '@/types/database'

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
      'Only cluster admins or platform admins can manage pricing' as const,
  }
}

export async function listPricing(clusterId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('cluster_book_pricing')
      .select('*')
      .eq('cluster_id', clusterId)

    if (error) return { error: error.message }
    return { data: data ?? [] }
  } catch {
    return { error: 'Failed to list pricing' }
  }
}

export async function upsertPricing(
  clusterId: string,
  data: {
    ruhi_book_id: string
    language: BookLanguage
    default_cost: number
    default_sale_price: number
    notes?: string | null
  }
) {
  try {
    if (data.default_cost < 0) {
      return { error: 'Default cost must be non-negative' }
    }
    if (data.default_sale_price < 0) {
      return { error: 'Default sale price must be non-negative' }
    }

    const adminCheck = await verifyClusterAdmin(clusterId)
    if ('error' in adminCheck) return { error: adminCheck.error }
    const { user, supabase } = adminCheck

    const { data: upserted, error } = await supabase
      .from('cluster_book_pricing')
      .upsert(
        {
          cluster_id: clusterId,
          ruhi_book_id: data.ruhi_book_id,
          language: data.language,
          default_cost: data.default_cost,
          default_sale_price: data.default_sale_price,
          notes: data.notes ?? null,
          updated_by: user.id,
        },
        { onConflict: 'cluster_id,ruhi_book_id,language' }
      )
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${clusterId}/orders/pricing`)
    revalidatePath(`/clusters/${clusterId}/orders/new`)
    return { data: upserted }
  } catch {
    return { error: 'Failed to save pricing' }
  }
}

export async function deletePricing(id: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: current, error: fetchError } = await supabase
      .from('cluster_book_pricing')
      .select('cluster_id')
      .eq('id', id)
      .single()

    if (fetchError || !current) return { error: 'Pricing row not found' }

    const adminCheck = await verifyClusterAdmin(current.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }

    const { error: deleteError } = await supabase
      .from('cluster_book_pricing')
      .delete()
      .eq('id', id)

    if (deleteError) return { error: deleteError.message }

    revalidatePath(`/clusters/${current.cluster_id}/orders/pricing`)
    revalidatePath(`/clusters/${current.cluster_id}/orders/new`)
    return { data: { success: true } }
  } catch {
    return { error: 'Failed to delete pricing row' }
  }
}
