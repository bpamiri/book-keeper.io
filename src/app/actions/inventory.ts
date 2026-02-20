'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function addStock(data: {
  cluster_id: string
  storage_location_id: string
  ruhi_book_id: string
  quantity: number
  notes?: string | null
}) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    if (data.quantity <= 0) return { error: 'Quantity must be positive' }

    // Check if inventory record already exists for this book at this location
    const { data: existing } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('cluster_id', data.cluster_id)
      .eq('storage_location_id', data.storage_location_id)
      .eq('ruhi_book_id', data.ruhi_book_id)
      .single()

    let inventoryRecord
    const previousQuantity = existing?.quantity ?? 0
    const newQuantity = previousQuantity + data.quantity

    if (existing) {
      // Increment existing inventory
      const { data: updated, error } = await supabase
        .from('inventory')
        .update({
          quantity: newQuantity,
          notes: data.notes ?? undefined,
          updated_by: user.id,
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) return { error: error.message }
      inventoryRecord = updated
    } else {
      // Create new inventory record
      const { data: inserted, error } = await supabase
        .from('inventory')
        .insert({
          cluster_id: data.cluster_id,
          storage_location_id: data.storage_location_id,
          ruhi_book_id: data.ruhi_book_id,
          quantity: data.quantity,
          notes: data.notes ?? null,
          updated_by: user.id,
        })
        .select()
        .single()

      if (error) return { error: error.message }
      inventoryRecord = inserted
    }

    // Create inventory log entry
    await supabase.from('inventory_log').insert({
      cluster_id: data.cluster_id,
      storage_location_id: data.storage_location_id,
      ruhi_book_id: data.ruhi_book_id,
      change_type: 'added' as const,
      quantity_change: data.quantity,
      previous_quantity: previousQuantity,
      new_quantity: newQuantity,
      notes: data.notes ?? null,
      performed_by: user.id,
    })

    revalidatePath(`/clusters/${data.cluster_id}`)
    return { data: inventoryRecord }
  } catch {
    return { error: 'Failed to add stock' }
  }
}

export async function updateQuantity(
  id: string,
  newQuantity: number,
  notes?: string | null
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    if (newQuantity < 0) return { error: 'Quantity cannot be negative' }

    // Get current inventory record
    const { data: current, error: fetchError } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !current) return { error: 'Inventory record not found' }

    const previousQuantity = current.quantity
    const quantityChange = newQuantity - previousQuantity

    const { data: updated, error } = await supabase
      .from('inventory')
      .update({
        quantity: newQuantity,
        notes: notes ?? undefined,
        updated_by: user.id,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    // Log the adjustment
    await supabase.from('inventory_log').insert({
      cluster_id: current.cluster_id,
      storage_location_id: current.storage_location_id,
      ruhi_book_id: current.ruhi_book_id,
      change_type: 'adjustment' as const,
      quantity_change: quantityChange,
      previous_quantity: previousQuantity,
      new_quantity: newQuantity,
      notes: notes ?? null,
      performed_by: user.id,
    })

    revalidatePath(`/clusters/${current.cluster_id}`)
    return { data: updated }
  } catch {
    return { error: 'Failed to update quantity' }
  }
}

export async function transferStock(data: {
  cluster_id: string
  from_location_id: string
  to_location_id: string
  ruhi_book_id: string
  quantity: number
  notes?: string | null
}) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    if (data.quantity <= 0) return { error: 'Transfer quantity must be positive' }
    if (data.from_location_id === data.to_location_id) {
      return { error: 'Source and destination locations must be different' }
    }

    // Get source inventory
    const { data: source, error: sourceError } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('cluster_id', data.cluster_id)
      .eq('storage_location_id', data.from_location_id)
      .eq('ruhi_book_id', data.ruhi_book_id)
      .single()

    if (sourceError || !source) return { error: 'Source inventory not found' }
    if (source.quantity < data.quantity) {
      return { error: `Insufficient stock. Available: ${source.quantity}` }
    }

    const sourceNewQuantity = source.quantity - data.quantity

    // Decrement source
    const { error: decError } = await supabase
      .from('inventory')
      .update({ quantity: sourceNewQuantity, updated_by: user.id })
      .eq('id', source.id)

    if (decError) return { error: decError.message }

    // Get or create destination inventory
    const { data: dest } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('cluster_id', data.cluster_id)
      .eq('storage_location_id', data.to_location_id)
      .eq('ruhi_book_id', data.ruhi_book_id)
      .single()

    const destPrevQuantity = dest?.quantity ?? 0
    const destNewQuantity = destPrevQuantity + data.quantity

    if (dest) {
      const { error: incError } = await supabase
        .from('inventory')
        .update({ quantity: destNewQuantity, updated_by: user.id })
        .eq('id', dest.id)

      if (incError) return { error: incError.message }
    } else {
      const { error: insertError } = await supabase
        .from('inventory')
        .insert({
          cluster_id: data.cluster_id,
          storage_location_id: data.to_location_id,
          ruhi_book_id: data.ruhi_book_id,
          quantity: data.quantity,
          updated_by: user.id,
        })

      if (insertError) return { error: insertError.message }
    }

    // Log both sides of the transfer
    const transferNote = data.notes ?? 'Stock transfer'

    await supabase.from('inventory_log').insert([
      {
        cluster_id: data.cluster_id,
        storage_location_id: data.from_location_id,
        ruhi_book_id: data.ruhi_book_id,
        change_type: 'transferred' as const,
        quantity_change: -data.quantity,
        previous_quantity: source.quantity,
        new_quantity: sourceNewQuantity,
        notes: `Transferred out: ${transferNote}`,
        performed_by: user.id,
      },
      {
        cluster_id: data.cluster_id,
        storage_location_id: data.to_location_id,
        ruhi_book_id: data.ruhi_book_id,
        change_type: 'transferred' as const,
        quantity_change: data.quantity,
        previous_quantity: destPrevQuantity,
        new_quantity: destNewQuantity,
        notes: `Transferred in: ${transferNote}`,
        performed_by: user.id,
      },
    ])

    revalidatePath(`/clusters/${data.cluster_id}`)
    return { data: { success: true } }
  } catch {
    return { error: 'Failed to transfer stock' }
  }
}

export async function bulkAddStock(data: {
  cluster_id: string
  items: Array<{
    storage_location_id: string
    ruhi_book_id: string
    quantity: number
  }>
  notes?: string | null
}) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Not authenticated' }

    if (!data.items.length) return { error: 'No items provided' }

    for (const item of data.items) {
      if (item.quantity <= 0) return { error: 'All quantities must be positive' }
    }

    let processed = 0

    for (const item of data.items) {
      const { data: existing } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('cluster_id', data.cluster_id)
        .eq('storage_location_id', item.storage_location_id)
        .eq('ruhi_book_id', item.ruhi_book_id)
        .single()

      const previousQuantity = existing?.quantity ?? 0
      const newQuantity = previousQuantity + item.quantity

      if (existing) {
        const { error } = await supabase
          .from('inventory')
          .update({
            quantity: newQuantity,
            notes: data.notes ?? undefined,
            updated_by: user.id,
          })
          .eq('id', existing.id)

        if (error) return { error: `Failed on item ${processed + 1}: ${error.message}` }
      } else {
        const { error } = await supabase
          .from('inventory')
          .insert({
            cluster_id: data.cluster_id,
            storage_location_id: item.storage_location_id,
            ruhi_book_id: item.ruhi_book_id,
            quantity: item.quantity,
            notes: data.notes ?? null,
            updated_by: user.id,
          })

        if (error) return { error: `Failed on item ${processed + 1}: ${error.message}` }
      }

      await supabase.from('inventory_log').insert({
        cluster_id: data.cluster_id,
        storage_location_id: item.storage_location_id,
        ruhi_book_id: item.ruhi_book_id,
        change_type: 'added' as const,
        quantity_change: item.quantity,
        previous_quantity: previousQuantity,
        new_quantity: newQuantity,
        notes: data.notes ?? 'Bulk add',
        performed_by: user.id,
      })

      processed++
    }

    revalidatePath(`/clusters/${data.cluster_id}`)
    return { data: { success: true, processed } }
  } catch {
    return { error: 'Failed to bulk add stock' }
  }
}
