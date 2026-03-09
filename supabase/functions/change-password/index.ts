import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[change-password] No authorization header')
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate JWT using getClaims
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token)

    if (claimsError || !claimsData?.claims) {
      console.error('[change-password] Claims error:', claimsError?.message || 'No claims')
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userId = claimsData.claims.sub as string
    const userEmail = claimsData.claims.email as string
    console.log('[change-password] Processing for user:', userId, userEmail)

    const { new_password } = await req.json()

    if (!new_password || new_password.length < 6) {
      console.error('[change-password] Invalid password length')
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Service role client - bypasses RLS for admin operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Update user password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: new_password }
    )

    if (updateError) {
      console.error('[change-password] Update error:', updateError.message)
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('[change-password] Password updated successfully')

    // Clear password_needs_change flag
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ password_needs_change: false })
      .eq('user_id', user.id)

    if (profileError) {
      console.error('[change-password] Profile update error:', profileError.message)
    }

    // Clear temporary passwords from ALL tables to minimize exposure
    // 1. Responsaveis
    await supabaseAdmin
      .from('responsaveis')
      .update({ senha_temporaria: null, senha_temporaria_ativa: false })
      .eq('user_id', user.id)

    // 2. Professores
    await supabaseAdmin
      .from('professores')
      .update({ senha_temporaria: null, senha_temporaria_ativa: false })
      .eq('user_id', user.id)

    // 3. Escolinhas (admin principal)
    await supabaseAdmin
      .from('escolinhas')
      .update({ senha_temporaria: null, senha_temporaria_ativa: false })
      .eq('admin_user_id', user.id)

    // 4. Escolinhas (sócio)
    await supabaseAdmin
      .from('escolinhas')
      .update({ senha_temporaria_socio: null, senha_temporaria_socio_ativa: false })
      .eq('socio_user_id', user.id)

    console.log('[change-password] All cleanup done for user:', user.email)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[change-password] Unexpected error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
