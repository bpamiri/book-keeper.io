'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BookCategory, PublicationStatus } from '@/types/database'

async function verifyPlatformAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Not authenticated' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'platform_admin') {
    return { error: 'Only platform admins can perform this action' as const }
  }

  return { user, supabase }
}

export async function promoteToAdmin(userId: string) {
  try {
    const result = await verifyPlatformAdmin()
    if ('error' in result) return { error: result.error }

    const adminClient = createAdminClient()
    const { data: profile, error } = await adminClient
      .from('profiles')
      .update({ role: 'platform_admin' })
      .eq('id', userId)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath('/admin/users')
    return { data: profile }
  } catch {
    return { error: 'Failed to promote user to admin' }
  }
}

export async function demoteFromAdmin(userId: string) {
  try {
    const result = await verifyPlatformAdmin()
    if ('error' in result) return { error: result.error }

    // Prevent self-demotion
    if (result.user.id === userId) {
      return { error: 'You cannot demote yourself' }
    }

    const adminClient = createAdminClient()
    const { data: profile, error } = await adminClient
      .from('profiles')
      .update({ role: 'user' })
      .eq('id', userId)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath('/admin/users')
    return { data: profile }
  } catch {
    return { error: 'Failed to demote user from admin' }
  }
}

export async function createRuhiBook(data: {
  title: string
  book_number?: number | null
  category: BookCategory
  publication_status: PublicationStatus
  unit?: string | null
  language?: string
  description?: string | null
  is_active?: boolean
  sort_order: number
}) {
  try {
    const result = await verifyPlatformAdmin()
    if ('error' in result) return { error: result.error }

    const { data: book, error } = await result.supabase
      .from('ruhi_books')
      .insert({
        title: data.title,
        book_number: data.book_number ?? null,
        category: data.category,
        publication_status: data.publication_status,
        unit: data.unit ?? null,
        language: data.language ?? 'English',
        description: data.description ?? null,
        is_active: data.is_active ?? true,
        sort_order: data.sort_order,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath('/admin/books')
    return { data: book }
  } catch {
    return { error: 'Failed to create book' }
  }
}

export async function updateRuhiBook(
  id: string,
  data: {
    title?: string
    book_number?: number | null
    category?: BookCategory
    publication_status?: PublicationStatus
    unit?: string | null
    language?: string
    description?: string | null
    is_active?: boolean
    sort_order?: number
  }
) {
  try {
    const result = await verifyPlatformAdmin()
    if ('error' in result) return { error: result.error }

    const { data: book, error } = await result.supabase
      .from('ruhi_books')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath('/admin/books')
    return { data: book }
  } catch {
    return { error: 'Failed to update book' }
  }
}

export async function toggleBookActive(id: string, is_active: boolean) {
  try {
    const result = await verifyPlatformAdmin()
    if ('error' in result) return { error: result.error }

    const { data: book, error } = await result.supabase
      .from('ruhi_books')
      .update({ is_active })
      .eq('id', id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath('/admin/books')
    return { data: book }
  } catch {
    return { error: 'Failed to toggle book status' }
  }
}
