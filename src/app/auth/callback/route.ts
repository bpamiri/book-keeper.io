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
    // PKCE flow — used by magic link login, OAuth, sign up
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    authError = error
  }

  if (!authError && (token_hash || code)) {
    // Get the authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user?.email) {
      // Match pending invites by email using admin client (bypasses RLS)
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
    }

    const forwardedHost = request.headers.get('x-forwarded-host')
    const isLocalEnv = process.env.NODE_ENV === 'development'

    if (isLocalEnv) {
      return NextResponse.redirect(`${origin}${next}`)
    } else if (forwardedHost) {
      return NextResponse.redirect(`https://${forwardedHost}${next}`)
    } else {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth code exchange failed — redirect to landing with error
  return NextResponse.redirect(`${origin}/?error=auth_callback_failed`)
}
