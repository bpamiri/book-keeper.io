import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'

  const supabase = await createClient()
  let authError: Error | null = null

  if (token_hash && type) {
    // Token hash flow — used by invite links and password recovery
    // PKCE is not supported for inviteUserByEmail, so we use verifyOtp
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    authError = error
  } else if (code) {
    // PKCE flow — used by sign-up email confirmation, password recovery, OAuth
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    authError = error
  }

  if (!authError && (token_hash || code)) {
    // Get the authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const forwardedHost = request.headers.get('x-forwarded-host')
    const isLocalEnv = process.env.NODE_ENV === 'development'
    const baseUrl = isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin

    // For invite flows, redirect to the accept page (skip member activation)
    if (type === 'invite') {
      return NextResponse.redirect(`${baseUrl}/invite/accept`)
    }

    // For password recovery, always land on /reset-password so the user
    // gets to pick a new password — never bounce them into the app.
    if (type === 'recovery') {
      return NextResponse.redirect(`${baseUrl}/reset-password`)
    }

    // For non-invite flows (sign-up confirmation, email change),
    // activate pending members and keep profile email in sync with auth email.
    if (user?.email) {
      const admin = createAdminClient()
      await admin
        .from('cluster_members')
        .update({
          user_id: user.id,
          status: 'active',
          joined_at: new Date().toISOString(),
        })
        .eq('email', user.email)
        .eq('status', 'pending')

      const { data: profile } = await admin
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single()

      if (profile && profile.email !== user.email) {
        await admin
          .from('profiles')
          .update({ email: user.email })
          .eq('id', user.id)
      }
    }

    return NextResponse.redirect(`${baseUrl}${next}`)
  }

  // Recovery link failed verification — send the user to /login with a
  // recovery-specific error instead of the generic landing-page error.
  if (type === 'recovery') {
    const forwardedHost = request.headers.get('x-forwarded-host')
    const isLocalEnv = process.env.NODE_ENV === 'development'
    const baseUrl = isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin
    return NextResponse.redirect(`${baseUrl}/login?error=reset_link_invalid`)
  }

  // Auth code exchange failed — redirect to landing with error
  return NextResponse.redirect(`${origin}/?error=auth_callback_failed`)
}
