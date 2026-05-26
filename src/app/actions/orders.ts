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
  already_stocked?: boolean
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

    // Validate the institution (if any) belongs to this cluster
    if (data.payer_kind === 'institution' && data.paid_by_institution_id) {
      const { data: inst } = await supabase
        .from('payer_institutions')
        .select('cluster_id')
        .eq('id', data.paid_by_institution_id)
        .single()
      if (!inst || inst.cluster_id !== data.cluster_id) {
        return { error: 'Institution does not belong to this cluster' }
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
        is_backfill: data.already_stocked ?? false,
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

      if (!data.already_stocked) {
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
          const { error: insertError } = await supabase
            .from('inventory')
            .insert({
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

    // Validate the institution (if any) belongs to this cluster
    if (payer_kind === 'institution' && paid_by_institution_id) {
      const { data: inst } = await supabase
        .from('payer_institutions')
        .select('cluster_id')
        .eq('id', paid_by_institution_id)
        .single()
      if (!inst || inst.cluster_id !== current.cluster_id) {
        return { error: 'Institution does not belong to this cluster' }
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
    if (data.amount < 0) {
      return { error: 'Reimbursed amount cannot be negative' }
    }

    const supabase = await createClient()

    const { data: current, error: fetchError } = await supabase
      .from('book_orders')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !current) return { error: 'Order not found' }

    const adminCheck = await verifyOrderAdmin(current.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }
    const { user } = adminCheck

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

export async function addOrderItem(
  orderId: string,
  data: {
    ruhi_book_id: string
    language: BookLanguage
    storage_location_id: string
    quantity: number
    unit_cost: number
    unit_sale_price: number
    notes?: string | null
  }
) {
  try {
    if (data.quantity <= 0) return { error: 'Quantity must be positive' }
    if (data.unit_cost < 0) return { error: 'Unit cost must be non-negative' }
    if (data.unit_sale_price < 0)
      return { error: 'Unit sale price must be non-negative' }

    const supabase = await createClient()

    const { data: order, error: orderError } = await supabase
      .from('book_orders')
      .select('id, cluster_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) return { error: 'Order not found' }

    const adminCheck = await verifyOrderAdmin(order.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }
    const { user } = adminCheck

    const publication_status = await getBookPublicationStatus(
      supabase,
      data.ruhi_book_id
    )
    if (!publication_status) return { error: 'Book not found in catalog' }

    const { data: inserted, error: insertError } = await supabase
      .from('book_order_items')
      .insert({
        order_id: orderId,
        ruhi_book_id: data.ruhi_book_id,
        language: data.language ?? DEFAULT_BOOK_LANGUAGE,
        publication_status,
        storage_location_id: data.storage_location_id,
        quantity: data.quantity,
        unit_cost: data.unit_cost,
        unit_sale_price: data.unit_sale_price,
        notes: data.notes ?? null,
      })
      .select()
      .single()

    if (insertError || !inserted) {
      return { error: insertError?.message ?? 'Failed to add item' }
    }

    // Increment inventory at the target location (same shape as createOrder)
    const { data: existing } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('cluster_id', order.cluster_id)
      .eq('storage_location_id', data.storage_location_id)
      .eq('ruhi_book_id', data.ruhi_book_id)
      .eq('language', data.language)
      .eq('publication_status', publication_status)
      .maybeSingle()

    const previousQuantity = existing?.quantity ?? 0
    const newQuantity = previousQuantity + data.quantity

    if (existing) {
      const { error: incError } = await supabase
        .from('inventory')
        .update({ quantity: newQuantity, updated_by: user.id })
        .eq('id', existing.id)
      if (incError) return { error: incError.message }
    } else {
      const { error: createInvError } = await supabase.from('inventory').insert(
        {
          cluster_id: order.cluster_id,
          storage_location_id: data.storage_location_id,
          ruhi_book_id: data.ruhi_book_id,
          language: data.language,
          publication_status,
          quantity: data.quantity,
          updated_by: user.id,
        }
      )
      if (createInvError) return { error: createInvError.message }
    }

    await supabase.from('inventory_log').insert({
      cluster_id: order.cluster_id,
      storage_location_id: data.storage_location_id,
      ruhi_book_id: data.ruhi_book_id,
      language: data.language,
      publication_status,
      change_type: 'ordered' as const,
      quantity_change: data.quantity,
      previous_quantity: previousQuantity,
      new_quantity: newQuantity,
      related_order_item_id: inserted.id,
      notes: data.notes ?? null,
      performed_by: user.id,
    })

    revalidatePath(`/clusters/${order.cluster_id}/orders/${orderId}`)
    revalidatePath(`/clusters/${order.cluster_id}/orders`)
    revalidatePath(`/clusters/${order.cluster_id}`)
    return { data: inserted }
  } catch {
    return { error: 'Failed to add order item' }
  }
}

export async function updateOrderItem(
  itemId: string,
  data: {
    ruhi_book_id?: string
    language?: BookLanguage
    storage_location_id?: string
    quantity?: number
    unit_cost?: number
    unit_sale_price?: number
    notes?: string | null
  }
) {
  try {
    const supabase = await createClient()

    const { data: current, error: fetchError } = await supabase
      .from('book_order_items')
      .select('*, book_orders!inner(cluster_id)')
      .eq('id', itemId)
      .single()

    if (fetchError || !current) return { error: 'Order item not found' }

    const order = current.book_orders as unknown as { cluster_id: string }
    const adminCheck = await verifyOrderAdmin(order.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }
    const { user } = adminCheck

    // Resolve new values
    const newRuhiBookId = data.ruhi_book_id ?? current.ruhi_book_id
    const newLanguage = (data.language ?? current.language) as BookLanguage
    const newLocationId =
      data.storage_location_id ?? current.storage_location_id
    const newQuantity =
      data.quantity !== undefined ? data.quantity : current.quantity
    const newUnitCost =
      data.unit_cost !== undefined ? data.unit_cost : current.unit_cost
    const newUnitSalePrice =
      data.unit_sale_price !== undefined
        ? data.unit_sale_price
        : current.unit_sale_price

    if (newQuantity <= 0) return { error: 'Quantity must be positive' }
    if (newUnitCost < 0) return { error: 'Unit cost must be non-negative' }
    if (newUnitSalePrice < 0)
      return { error: 'Unit sale price must be non-negative' }

    // Snapshot new publication_status if book changed
    const newPublicationStatus: PublicationStatus | null =
      data.ruhi_book_id && data.ruhi_book_id !== current.ruhi_book_id
        ? await getBookPublicationStatus(supabase, newRuhiBookId)
        : (current.publication_status as PublicationStatus)

    if (!newPublicationStatus) return { error: 'Book not found in catalog' }

    // Determine whether the inventory key changed
    const oldKey = `${current.ruhi_book_id}|${current.language}|${current.publication_status}|${current.storage_location_id}`
    const newKey = `${newRuhiBookId}|${newLanguage}|${newPublicationStatus}|${newLocationId}`
    const keyChanged = oldKey !== newKey

    if (keyChanged) {
      // Reverse old inventory, apply new inventory
      // 1. Validate old location has enough to subtract
      const { data: oldInv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('cluster_id', order.cluster_id)
        .eq('storage_location_id', current.storage_location_id)
        .eq('ruhi_book_id', current.ruhi_book_id)
        .eq('language', current.language)
        .eq('publication_status', current.publication_status)
        .maybeSingle()
      if (!oldInv || oldInv.quantity < current.quantity) {
        return {
          error: `Insufficient stock at old location to reverse (have ${oldInv?.quantity ?? 0}, need ${current.quantity})`,
        }
      }

      const oldNewQty = oldInv.quantity - current.quantity
      const { error: oldErr } = await supabase
        .from('inventory')
        .update({ quantity: oldNewQty, updated_by: user.id })
        .eq('id', oldInv.id)
      if (oldErr) return { error: oldErr.message }

      await supabase.from('inventory_log').insert({
        cluster_id: order.cluster_id,
        storage_location_id: current.storage_location_id,
        ruhi_book_id: current.ruhi_book_id,
        language: current.language,
        publication_status: current.publication_status,
        change_type: 'adjustment' as const,
        quantity_change: -current.quantity,
        previous_quantity: oldInv.quantity,
        new_quantity: oldNewQty,
        related_order_item_id: current.id,
        notes: 'Order item edited (reversed from previous location/book)',
        performed_by: user.id,
      })

      // 2. Apply to new location/book
      const { data: newInv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('cluster_id', order.cluster_id)
        .eq('storage_location_id', newLocationId)
        .eq('ruhi_book_id', newRuhiBookId)
        .eq('language', newLanguage)
        .eq('publication_status', newPublicationStatus)
        .maybeSingle()

      const newPrevQty = newInv?.quantity ?? 0
      const newNewQty = newPrevQty + newQuantity

      if (newInv) {
        const { error: incErr } = await supabase
          .from('inventory')
          .update({ quantity: newNewQty, updated_by: user.id })
          .eq('id', newInv.id)
        if (incErr) return { error: incErr.message }
      } else {
        const { error: insErr } = await supabase.from('inventory').insert({
          cluster_id: order.cluster_id,
          storage_location_id: newLocationId,
          ruhi_book_id: newRuhiBookId,
          language: newLanguage,
          publication_status: newPublicationStatus,
          quantity: newQuantity,
          updated_by: user.id,
        })
        if (insErr) return { error: insErr.message }
      }

      await supabase.from('inventory_log').insert({
        cluster_id: order.cluster_id,
        storage_location_id: newLocationId,
        ruhi_book_id: newRuhiBookId,
        language: newLanguage,
        publication_status: newPublicationStatus,
        change_type: 'adjustment' as const,
        quantity_change: newQuantity,
        previous_quantity: newPrevQty,
        new_quantity: newNewQty,
        related_order_item_id: current.id,
        notes: 'Order item edited (applied to new location/book)',
        performed_by: user.id,
      })
    } else if (newQuantity !== current.quantity) {
      // Same inventory key, but quantity changed
      const delta = newQuantity - current.quantity
      const { data: inv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('cluster_id', order.cluster_id)
        .eq('storage_location_id', current.storage_location_id)
        .eq('ruhi_book_id', current.ruhi_book_id)
        .eq('language', current.language)
        .eq('publication_status', current.publication_status)
        .maybeSingle()
      if (!inv) return { error: 'Inventory row missing for this item' }

      if (delta < 0 && inv.quantity + delta < 0) {
        return {
          error: `Insufficient stock at location to reduce quantity (have ${inv.quantity}, would need to subtract ${-delta})`,
        }
      }

      const newInvQty = inv.quantity + delta
      const { error: updErr } = await supabase
        .from('inventory')
        .update({ quantity: newInvQty, updated_by: user.id })
        .eq('id', inv.id)
      if (updErr) return { error: updErr.message }

      await supabase.from('inventory_log').insert({
        cluster_id: order.cluster_id,
        storage_location_id: current.storage_location_id,
        ruhi_book_id: current.ruhi_book_id,
        language: current.language,
        publication_status: current.publication_status,
        change_type: 'adjustment' as const,
        quantity_change: delta,
        previous_quantity: inv.quantity,
        new_quantity: newInvQty,
        related_order_item_id: current.id,
        notes: 'Order item quantity edited',
        performed_by: user.id,
      })
    }

    // Persist the item row changes
    const { data: updated, error: updateErr } = await supabase
      .from('book_order_items')
      .update({
        ruhi_book_id: newRuhiBookId,
        language: newLanguage,
        publication_status: newPublicationStatus,
        storage_location_id: newLocationId,
        quantity: newQuantity,
        unit_cost: newUnitCost,
        unit_sale_price: newUnitSalePrice,
        notes: data.notes !== undefined ? data.notes : current.notes,
      })
      .eq('id', itemId)
      .select()
      .single()

    if (updateErr) return { error: updateErr.message }

    revalidatePath(`/clusters/${order.cluster_id}/orders/${current.order_id}`)
    revalidatePath(`/clusters/${order.cluster_id}/orders`)
    revalidatePath(`/clusters/${order.cluster_id}`)
    return { data: updated }
  } catch {
    return { error: 'Failed to update order item' }
  }
}

export async function deleteOrderItem(itemId: string) {
  try {
    const supabase = await createClient()

    const { data: current, error: fetchError } = await supabase
      .from('book_order_items')
      .select('*, book_orders!inner(cluster_id)')
      .eq('id', itemId)
      .single()

    if (fetchError || !current) return { error: 'Order item not found' }

    const order = current.book_orders as unknown as { cluster_id: string }
    const adminCheck = await verifyOrderAdmin(order.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }
    const { user } = adminCheck

    // Subtract the item's quantity from inventory
    const { data: inv } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('cluster_id', order.cluster_id)
      .eq('storage_location_id', current.storage_location_id)
      .eq('ruhi_book_id', current.ruhi_book_id)
      .eq('language', current.language)
      .eq('publication_status', current.publication_status)
      .maybeSingle()

    if (!inv || inv.quantity < current.quantity) {
      return {
        error: `Insufficient stock at location to delete this item (have ${inv?.quantity ?? 0}, need ${current.quantity})`,
      }
    }

    const newInvQty = inv.quantity - current.quantity
    const { error: updErr } = await supabase
      .from('inventory')
      .update({ quantity: newInvQty, updated_by: user.id })
      .eq('id', inv.id)
    if (updErr) return { error: updErr.message }

    await supabase.from('inventory_log').insert({
      cluster_id: order.cluster_id,
      storage_location_id: current.storage_location_id,
      ruhi_book_id: current.ruhi_book_id,
      language: current.language,
      publication_status: current.publication_status,
      change_type: 'adjustment' as const,
      quantity_change: -current.quantity,
      previous_quantity: inv.quantity,
      new_quantity: newInvQty,
      related_order_item_id: current.id,
      notes: 'Order item deleted',
      performed_by: user.id,
    })

    const { error: deleteErr } = await supabase
      .from('book_order_items')
      .delete()
      .eq('id', itemId)

    if (deleteErr) return { error: deleteErr.message }

    revalidatePath(`/clusters/${order.cluster_id}/orders/${current.order_id}`)
    revalidatePath(`/clusters/${order.cluster_id}/orders`)
    revalidatePath(`/clusters/${order.cluster_id}`)
    return { data: { success: true } }
  } catch {
    return { error: 'Failed to delete order item' }
  }
}

export async function deleteOrder(orderId: string) {
  try {
    const supabase = await createClient()

    // Load the order header and all its items in parallel.
    const [orderRes, itemsRes] = await Promise.all([
      supabase.from('book_orders').select('*').eq('id', orderId).single(),
      supabase.from('book_order_items').select('*').eq('order_id', orderId),
    ])

    if (orderRes.error || !orderRes.data) {
      return { error: 'Order not found' }
    }
    const order = orderRes.data
    const items = itemsRes.data ?? []

    const adminCheck = await verifyOrderAdmin(order.cluster_id)
    if ('error' in adminCheck) return { error: adminCheck.error }
    const { user } = adminCheck

    // Backfill orders never touched inventory, so deletion is a row delete
    // only — no validation or reversal needed.
    if (!order.is_backfill) {
      // Phase 1: validate that every line item can be reversed from inventory.
      // We collect the inventory rows up front so phase 2 doesn't have to
      // re-fetch (and so we don't make any writes if any line is invalid).
      const inventoryPlan: Array<{
        item: (typeof items)[number]
        invId: string
        currentQuantity: number
      }> = []

      for (const item of items) {
        const { data: inv } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('cluster_id', order.cluster_id)
          .eq('storage_location_id', item.storage_location_id)
          .eq('ruhi_book_id', item.ruhi_book_id)
          .eq('language', item.language)
          .eq('publication_status', item.publication_status)
          .maybeSingle()

        if (!inv || inv.quantity < item.quantity) {
          return {
            error: `Cannot delete this order: insufficient stock to reverse line for "${item.language}" at one of the storage locations (have ${inv?.quantity ?? 0}, need ${item.quantity}). The stock may have been sold or transferred since the order was placed.`,
          }
        }

        inventoryPlan.push({
          item,
          invId: inv.id,
          currentQuantity: inv.quantity,
        })
      }

      // Phase 2: apply the inventory decrements and log entries.
      for (const planned of inventoryPlan) {
        const newQty = planned.currentQuantity - planned.item.quantity
        const { error: updErr } = await supabase
          .from('inventory')
          .update({ quantity: newQty, updated_by: user.id })
          .eq('id', planned.invId)
        if (updErr) return { error: updErr.message }

        await supabase.from('inventory_log').insert({
          cluster_id: order.cluster_id,
          storage_location_id: planned.item.storage_location_id,
          ruhi_book_id: planned.item.ruhi_book_id,
          language: planned.item.language,
          publication_status: planned.item.publication_status,
          change_type: 'adjustment' as const,
          quantity_change: -planned.item.quantity,
          previous_quantity: planned.currentQuantity,
          new_quantity: newQty,
          related_order_item_id: planned.item.id,
          notes: 'Order deleted (line reversed)',
          performed_by: user.id,
        })
      }
    }

    // Delete the order. ON DELETE CASCADE on book_order_items removes the
    // line rows; ON DELETE SET NULL on inventory_log.related_order_item_id
    // preserves the audit trail with the FK nulled out.
    const { error: deleteErr } = await supabase
      .from('book_orders')
      .delete()
      .eq('id', orderId)

    if (deleteErr) return { error: deleteErr.message }

    revalidatePath(`/clusters/${order.cluster_id}/orders`)
    revalidatePath(`/clusters/${order.cluster_id}`)
    return { data: { success: true } }
  } catch {
    return { error: 'Failed to delete order' }
  }
}
