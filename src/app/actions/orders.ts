'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_BOOK_LANGUAGE } from '@/lib/languages'
import type {
  BookLanguage,
  PayerKind,
  PublicationStatus,
  ReimbursementStatus,
} from '@/types/database'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function verifyOrderAdmin(clusterId: string) {
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
      'Only cluster admins or platform admins can create or edit orders' as const,
  }
}

async function getBookPublicationStatus(
  supabase: SupabaseClient,
  bookId: string
): Promise<PublicationStatus | null> {
  const { data } = await supabase
    .from('ruhi_books')
    .select('publication_status')
    .eq('id', bookId)
    .single()
  return (data?.publication_status as PublicationStatus | undefined) ?? null
}

export async function createOrder(data: {
  cluster_id: string
  order_date?: string
  supplier?: string | null
  notes?: string | null
  payer_kind: PayerKind
  paid_by_user_id?: string | null
  paid_by_institution_id?: string | null
  reimbursement_status?: ReimbursementStatus
  reimbursement_notes?: string | null
  items: Array<{
    ruhi_book_id: string
    language: BookLanguage
    storage_location_id: string
    quantity: number
    unit_cost: number
    unit_sale_price: number
    notes?: string | null
  }>
}) {
  try {
    const adminCheck = await verifyOrderAdmin(data.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }
    const { user, supabase } = adminCheck

    // Validate payer fields
    if (data.payer_kind === 'individual') {
      if (!data.paid_by_user_id || data.paid_by_institution_id) {
        return {
          error:
            'Individual orders require paid_by_user_id and must not have paid_by_institution_id',
        }
      }
    } else {
      if (!data.paid_by_institution_id || data.paid_by_user_id) {
        return {
          error:
            'Institutional orders require paid_by_institution_id and must not have paid_by_user_id',
        }
      }
    }

    if (!data.items.length) return { error: 'At least one item is required' }
    for (const item of data.items) {
      if (item.quantity <= 0) return { error: 'Quantities must be positive' }
      if (item.unit_cost < 0) return { error: 'Unit cost must be non-negative' }
      if (item.unit_sale_price < 0)
        return { error: 'Unit sale price must be non-negative' }
    }

    // Snapshot publication_status for each item up-front
    const itemsWithStatus: Array<
      (typeof data.items)[number] & { publication_status: PublicationStatus }
    > = []
    for (const item of data.items) {
      const publication_status = await getBookPublicationStatus(
        supabase,
        item.ruhi_book_id
      )
      if (!publication_status) {
        return { error: `Book not found in catalog: ${item.ruhi_book_id}` }
      }
      itemsWithStatus.push({ ...item, publication_status })
    }

    // Default reimbursement_status: 'owed' for individual, 'not_required' for institution
    const reimbursement_status: ReimbursementStatus =
      data.reimbursement_status ??
      (data.payer_kind === 'individual' ? 'owed' : 'not_required')

    // Insert order header
    const { data: order, error: orderError } = await supabase
      .from('book_orders')
      .insert({
        cluster_id: data.cluster_id,
        order_date: data.order_date ?? new Date().toISOString().slice(0, 10),
        supplier: data.supplier ?? null,
        notes: data.notes ?? null,
        payer_kind: data.payer_kind,
        paid_by_user_id: data.paid_by_user_id ?? null,
        paid_by_institution_id: data.paid_by_institution_id ?? null,
        reimbursement_status,
        reimbursement_notes: data.reimbursement_notes ?? null,
        created_by: user.id,
      })
      .select()
      .single()

    if (orderError || !order) {
      return { error: orderError?.message ?? 'Failed to create order' }
    }

    // Insert items and stock inventory
    for (const item of itemsWithStatus) {
      const { data: inserted, error: itemError } = await supabase
        .from('book_order_items')
        .insert({
          order_id: order.id,
          ruhi_book_id: item.ruhi_book_id,
          language: item.language ?? DEFAULT_BOOK_LANGUAGE,
          publication_status: item.publication_status,
          storage_location_id: item.storage_location_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          unit_sale_price: item.unit_sale_price,
          notes: item.notes ?? null,
        })
        .select()
        .single()

      if (itemError || !inserted) {
        return { error: itemError?.message ?? 'Failed to insert order item' }
      }

      // Increment inventory at the target location
      const { data: existing } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('cluster_id', data.cluster_id)
        .eq('storage_location_id', item.storage_location_id)
        .eq('ruhi_book_id', item.ruhi_book_id)
        .eq('language', item.language)
        .eq('publication_status', item.publication_status)
        .maybeSingle()

      const previousQuantity = existing?.quantity ?? 0
      const newQuantity = previousQuantity + item.quantity

      if (existing) {
        const { error: incError } = await supabase
          .from('inventory')
          .update({ quantity: newQuantity, updated_by: user.id })
          .eq('id', existing.id)
        if (incError) return { error: incError.message }
      } else {
        const { error: insertError } = await supabase.from('inventory').insert({
          cluster_id: data.cluster_id,
          storage_location_id: item.storage_location_id,
          ruhi_book_id: item.ruhi_book_id,
          language: item.language,
          publication_status: item.publication_status,
          quantity: item.quantity,
          updated_by: user.id,
        })
        if (insertError) return { error: insertError.message }
      }

      // Log the change with provenance
      await supabase.from('inventory_log').insert({
        cluster_id: data.cluster_id,
        storage_location_id: item.storage_location_id,
        ruhi_book_id: item.ruhi_book_id,
        language: item.language,
        publication_status: item.publication_status,
        change_type: 'ordered' as const,
        quantity_change: item.quantity,
        previous_quantity: previousQuantity,
        new_quantity: newQuantity,
        related_order_item_id: inserted.id,
        notes: item.notes ?? null,
        performed_by: user.id,
      })
    }

    revalidatePath(`/clusters/${data.cluster_id}/orders`)
    revalidatePath(`/clusters/${data.cluster_id}`)
    return { data: order }
  } catch {
    return { error: 'Failed to create order' }
  }
}

export async function updateOrderHeader(
  id: string,
  data: {
    order_date?: string
    supplier?: string | null
    notes?: string | null
    payer_kind?: PayerKind
    paid_by_user_id?: string | null
    paid_by_institution_id?: string | null
  }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: current, error: fetchError } = await supabase
      .from('book_orders')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !current) return { error: 'Order not found' }

    const adminCheck = await verifyOrderAdmin(current.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }

    // Resolve final payer values
    const payer_kind = data.payer_kind ?? current.payer_kind
    const paid_by_user_id =
      data.paid_by_user_id !== undefined
        ? data.paid_by_user_id
        : current.paid_by_user_id
    const paid_by_institution_id =
      data.paid_by_institution_id !== undefined
        ? data.paid_by_institution_id
        : current.paid_by_institution_id

    // Re-validate the CHECK constraint shape in app code
    if (payer_kind === 'individual') {
      if (!paid_by_user_id || paid_by_institution_id) {
        return {
          error:
            'Individual orders require paid_by_user_id and must not have paid_by_institution_id',
        }
      }
    } else {
      if (!paid_by_institution_id || paid_by_user_id) {
        return {
          error:
            'Institutional orders require paid_by_institution_id and must not have paid_by_user_id',
        }
      }
    }

    const { data: updated, error } = await supabase
      .from('book_orders')
      .update({
        order_date: data.order_date ?? current.order_date,
        supplier: data.supplier !== undefined ? data.supplier : current.supplier,
        notes: data.notes !== undefined ? data.notes : current.notes,
        payer_kind,
        paid_by_user_id,
        paid_by_institution_id,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${current.cluster_id}/orders/${id}`)
    revalidatePath(`/clusters/${current.cluster_id}/orders`)
    return { data: updated }
  } catch {
    return { error: 'Failed to update order' }
  }
}

export async function recordReimbursement(
  id: string,
  data: {
    status: ReimbursementStatus
    amount: number
    notes?: string | null
  }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    if (data.amount < 0) {
      return { error: 'Reimbursed amount cannot be negative' }
    }

    const { data: current, error: fetchError } = await supabase
      .from('book_orders')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !current) return { error: 'Order not found' }

    const adminCheck = await verifyOrderAdmin(current.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }

    // When moving INTO 'reimbursed', set reimbursed_at/_by.
    // When moving OUT of 'reimbursed', clear them.
    const wasReimbursed = current.reimbursement_status === 'reimbursed'
    const nowReimbursed = data.status === 'reimbursed'

    const patch: Record<string, unknown> = {
      reimbursement_status: data.status,
      reimbursed_amount: data.amount,
      reimbursement_notes:
        data.notes !== undefined ? data.notes : current.reimbursement_notes,
    }

    if (nowReimbursed && !wasReimbursed) {
      patch.reimbursed_at = new Date().toISOString()
      patch.reimbursed_by = user.id
    } else if (!nowReimbursed && wasReimbursed) {
      patch.reimbursed_at = null
      patch.reimbursed_by = null
    }

    const { data: updated, error } = await supabase
      .from('book_orders')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${current.cluster_id}/orders/${id}`)
    revalidatePath(`/clusters/${current.cluster_id}/orders`)
    return { data: updated }
  } catch {
    return { error: 'Failed to record reimbursement' }
  }
}
