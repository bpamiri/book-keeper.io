'use server'

import { createClient } from '@/lib/supabase/server'
import type { BookRequest, RuhiBook, Profile, InventoryLog } from '@/types/database'

export interface Notification {
  id: string
  type: 'request_approved' | 'request_denied' | 'request_fulfilled' | 'request_pending' | 'low_stock' | 'inventory_change'
  title: string
  description: string
  timestamp: string
  read: boolean
}

export async function getNotifications(): Promise<{ data: Notification[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { data: [], error: 'Not authenticated' }

    // Get clusters the user is a member of
    const { data: memberships } = await supabase
      .from('cluster_members')
      .select('cluster_id, cluster_role')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (!memberships || memberships.length === 0) return { data: [] }

    const clusterIds = memberships.map(m => m.cluster_id)
    const isAdminOf = new Set(memberships.filter(m => m.cluster_role === 'admin').map(m => m.cluster_id))

    const notifications: Notification[] = []

    // For admins: show pending requests in their clusters
    const adminClusterIds = [...isAdminOf]
    if (adminClusterIds.length > 0) {
      const { data: pendingRequests } = await supabase
        .from('book_requests')
        .select('*')
        .in('cluster_id', adminClusterIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5)

      const requests = (pendingRequests ?? []) as unknown as BookRequest[]

      // Get requester profiles and books
      const requesterIds = [...new Set(requests.map(r => r.requested_by))]
      const bookIds = [...new Set(requests.map(r => r.ruhi_book_id))]

      const [profilesRes, booksRes] = await Promise.all([
        requesterIds.length > 0
          ? supabase.from('profiles').select('*').in('id', requesterIds)
          : { data: [] },
        bookIds.length > 0
          ? supabase.from('ruhi_books').select('*').in('id', bookIds)
          : { data: [] },
      ])

      const profileMap = new Map(
        ((profilesRes.data ?? []) as unknown as Profile[]).map(p => [p.id, p])
      )
      const bookMap = new Map(
        ((booksRes.data ?? []) as unknown as RuhiBook[]).map(b => [b.id, b])
      )

      for (const req of requests) {
        const requester = profileMap.get(req.requested_by)
        const book = bookMap.get(req.ruhi_book_id)
        notifications.push({
          id: `req-pending-${req.id}`,
          type: 'request_pending',
          title: 'New Book Request',
          description: `${requester?.full_name || 'Someone'} requested ${req.quantity_requested} copies of ${book?.book_number ? `Book ${book.book_number}` : book?.title ?? 'a book'}`,
          timestamp: req.created_at,
          read: false,
        })
      }
    }

    // For all users: show status updates on their own requests
    const { data: myRequests } = await supabase
      .from('book_requests')
      .select('*')
      .eq('requested_by', user.id)
      .in('status', ['approved', 'denied', 'fulfilled'])
      .order('updated_at', { ascending: false })
      .limit(5)

    const myReqs = (myRequests ?? []) as unknown as BookRequest[]

    if (myReqs.length > 0) {
      const bookIds = [...new Set(myReqs.map(r => r.ruhi_book_id))]
      const { data: booksData } = await supabase
        .from('ruhi_books')
        .select('*')
        .in('id', bookIds)

      const bookMap = new Map(
        ((booksData ?? []) as unknown as RuhiBook[]).map(b => [b.id, b])
      )

      for (const req of myReqs) {
        const book = bookMap.get(req.ruhi_book_id)
        const bookName = book?.book_number ? `Book ${book.book_number}` : book?.title ?? 'a book'

        if (req.status === 'approved') {
          notifications.push({
            id: `req-approved-${req.id}`,
            type: 'request_approved',
            title: 'Request Approved',
            description: `Your request for ${req.quantity_requested} copies of ${bookName} was approved`,
            timestamp: req.updated_at,
            read: false,
          })
        } else if (req.status === 'denied') {
          notifications.push({
            id: `req-denied-${req.id}`,
            type: 'request_denied',
            title: 'Request Denied',
            description: `Your request for ${bookName} was denied${req.notes ? `: ${req.notes}` : ''}`,
            timestamp: req.updated_at,
            read: false,
          })
        } else if (req.status === 'fulfilled') {
          notifications.push({
            id: `req-fulfilled-${req.id}`,
            type: 'request_fulfilled',
            title: 'Request Fulfilled',
            description: `Your request for ${req.quantity_requested} copies of ${bookName} has been fulfilled`,
            timestamp: req.fulfilled_at ?? req.updated_at,
            read: false,
          })
        }
      }
    }

    // Sort by timestamp descending
    notifications.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    return { data: notifications.slice(0, 10) }
  } catch {
    return { data: [], error: 'Failed to fetch notifications' }
  }
}
