'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAppUrl } from '@/lib/utils'

export async function loginWithMagicLink(email: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function signup(email: string, fullName: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth/callback`,
      data: {
        full_name: fullName,
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
