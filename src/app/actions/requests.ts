'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createRequest(data: {
  cluster_id: string
  ruhi_book_id: string
  quantity_requested: number
  purpose?: string | null
}) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    if (data.quantity_requested <= 0) {
      return { error: 'Quantity must be positive' }
    }

    const { data: request, error } = await supabase
      .from('book_requests')
      .insert({
        cluster_id: data.cluster_id,
        ruhi_book_id: data.ruhi_book_id,
        quantity_requested: data.quantity_requested,
        requested_by: user.id,
        purpose: data.purpose ?? null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${data.cluster_id}`)
    return { data: request }
  } catch {
    return { error: 'Failed to create request' }
  }
}

export async function approveRequest(id: string) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    // Get the request to verify it exists and is pending
    const { data: request, error: fetchError } = await supabase
      .from('book_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !request) return { error: 'Request not found' }
    if (request.status !== 'pending') {
      return { error: `Cannot approve a request with status "${request.status}"` }
    }

    const { data: updated, error } = await supabase
      .from('book_requests')
      .update({ status: 'approved' })
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${request.cluster_id}`)
    return { data: updated }
  } catch {
    return { error: 'Failed to approve request' }
  }
}

export async function denyRequest(id: string, notes?: string | null) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    const { data: request, error: fetchError } = await supabase
      .from('book_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !request) return { error: 'Request not found' }
    if (request.status !== 'pending') {
      return { error: `Cannot deny a request with status "${request.status}"` }
    }

    const { data: updated, error } = await supabase
      .from('book_requests')
      .update({
        status: 'denied',
        notes: notes ?? null,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/clusters/${request.cluster_id}`)
    return { data: updated }
  } catch {
    return { error: 'Failed to deny request' }
  }
}

export async function fulfillRequest(data: {
  request_id: string
  fulfillments: Array<{
    storage_location_id: string
    quantity: number
    notes?: string | null
  }>
}) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    if (!data.fulfillments.length) {
      return { error: 'At least one fulfillment line is required' }
    }

    // Get the request
    const { data: request, error: fetchError } = await supabase
      .from('book_requests')
      .select('*')
      .eq('id', data.request_id)
      .single()

    if (fetchError || !request) return { error: 'Request not found' }
    if (request.status !== 'approved' && request.status !== 'pending') {
      return { error: `Cannot fulfill a request with status "${request.status}"` }
    }

    // Validate all fulfillment lines have positive quantities
    for (const line of data.fulfillments) {
      if (line.quantity <= 0) {
        return { error: 'All fulfillment quantities must be positive' }
      }
    }

    // Validate inventory availability for each location before making changes
    for (const line of data.fulfillments) {
      const { data: inv, error: invError } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('cluster_id', request.cluster_id)
        .eq('storage_location_id', line.storage_location_id)
        .eq('ruhi_book_id', request.ruhi_book_id)
        .single()

      if (invError || !inv) {
        return { error: `No inventory found at the specified location` }
      }
      if (inv.quantity < line.quantity) {
        return { error: `Insufficient stock at location. Available: ${inv.quantity}, Requested: ${line.quantity}` }
      }
    }

    // Process each fulfillment line
    for (const line of data.fulfillments) {
      // Get current inventory (re-fetch to get latest quantity)
      const { data: inv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('cluster_id', request.cluster_id)
        .eq('storage_location_id', line.storage_location_id)
        .eq('ruhi_book_id', request.ruhi_book_id)
        .single()

      if (!inv) return { error: 'Inventory record not found during fulfillment' }

      const newQuantity = inv.quantity - line.quantity

      // Insert fulfillment record
      const { data: fulfillment, error: fulfillError } = await supabase
        .from('request_fulfillments')
        .insert({
          request_id: data.request_id,
          storage_location_id: line.storage_location_id,
          quantity: line.quantity,
          fulfilled_by: user.id,
          notes: line.notes ?? null,
        })
        .select()
        .single()

      if (fulfillError) return { error: fulfillError.message }

      // Decrement inventory
      const { error: decError } = await supabase
        .from('inventory')
        .update({ quantity: newQuantity, updated_by: user.id })
        .eq('id', inv.id)

      if (decError) return { error: decError.message }

      // Log the inventory change
      await supabase.from('inventory_log').insert({
        cluster_id: request.cluster_id,
        storage_location_id: line.storage_location_id,
        ruhi_book_id: request.ruhi_book_id,
        change_type: 'fulfilled' as const,
        quantity_change: -line.quantity,
        previous_quantity: inv.quantity,
        new_quantity: newQuantity,
        related_request_id: data.request_id,
        related_fulfillment_id: fulfillment.id,
        notes: line.notes ?? null,
        performed_by: user.id,
      })
    }

    // Check total fulfillment for this request
    const { data: allFulfillments } = await supabase
      .from('request_fulfillments')
      .select('quantity')
      .eq('request_id', data.request_id)

    const totalFulfilled = (allFulfillments ?? []).reduce(
      (sum, f) => sum + f.quantity,
      0
    )

    // Update request status based on fulfillment
    if (totalFulfilled >= request.quantity_requested) {
      await supabase
        .from('book_requests')
        .update({
          status: 'fulfilled',
          fulfilled_by: user.id,
          fulfilled_at: new Date().toISOString(),
        })
        .eq('id', data.request_id)
    } else if (request.status === 'pending') {
      // If we're partially fulfilling a pending request, move to approved
      await supabase
        .from('book_requests')
        .update({ status: 'approved' })
        .eq('id', data.request_id)
    }

    revalidatePath(`/clusters/${request.cluster_id}`)
    return { data: { success: true, total_fulfilled: totalFulfilled } }
  } catch {
    return { error: 'Failed to fulfill request' }
  }
}
