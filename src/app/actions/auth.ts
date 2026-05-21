'use server'

import { redirect } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getAppUrl } from '@/lib/utils'

export async function loginWithPassword(email: string, password: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}

export async function signupWithPassword(
  email: string,
  password: string,
  fullName: string,
) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
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

  // If no session is returned, Supabase is requiring email confirmation
  if (!data.session) {
    return { needsConfirmation: true }
  }

  redirect('/dashboard')
}

export async function requestPasswordReset(email: string) {
  const supabase = await createClient()

  // Route via /auth/callback (already in the Supabase redirect allow-list
  // for sign-up/invite/email-change). The next + type=recovery params make
  // the callback land the user on /reset-password instead of /dashboard.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getAppUrl()}/auth/callback?next=/reset-password&type=recovery`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function updatePassword(password: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.email) {
    return { error: 'Not authenticated' }
  }

  if (newPassword.length < 6) {
    return { error: 'New password must be at least 6 characters' }
  }

  if (currentPassword === newPassword) {
    return { error: 'New password must differ from current password' }
  }

  // Verify current password against a throwaway client so we don't
  // overwrite the active session cookies.
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (verifyError) {
    return { error: 'Current password is incorrect' }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) {
    return { error: updateError.message }
  }

  return { success: true }
}

export async function requestEmailChange(newEmail: string) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  const trimmed = newEmail.trim().toLowerCase()
  if (!trimmed) {
    return { error: 'Email is required' }
  }

  if (trimmed === user.email?.toLowerCase()) {
    return { error: 'New email is the same as your current email' }
  }

  const { error } = await supabase.auth.updateUser(
    { email: trimmed },
    { emailRedirectTo: `${getAppUrl()}/auth/callback?next=/account` },
  )

  if (error) {
    return { error: error.message }
  }

  return { success: true, pendingEmail: trimmed }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
