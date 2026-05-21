import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EmailOtpType } from '@supabase/supabase-js'

// Dedicated recovery callback: a clean, query-string-free URL that's
// easy to add to the Supabase redirect allow-list. Verifies the
// recovery token/code, then always lands the user on /reset-password
// so they can pick a new password.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = (searchParams.get('type') as EmailOtpType | null) ?? 'recovery'

  const supabase = await createClient()
  let authError: Error | null = null

  if (token_hash) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    authError = error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    authError = error
  }

  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const baseUrl = isLocalEnv
    ? origin
    : forwardedHost
      ? `https://${forwardedHost}`
      : origin

  if (!authError && (token_hash || code)) {
    return NextResponse.redirect(`${baseUrl}/reset-password`)
  }

  return NextResponse.redirect(`${baseUrl}/login?error=reset_link_invalid`)
}
