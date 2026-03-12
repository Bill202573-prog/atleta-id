import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

type SyncType = 
  | 'atividade_externa'
  | 'evento_gol'
  | 'evento_premiacao'
  | 'conquista_coletiva'
  | 'evento_esportivo'

type SyncAction = 'create' | 'update' | 'delete'

interface SyncPayload {
  type: SyncType
  action: SyncAction
  crianca_id: string
  data: Record<string, unknown>
}

// Normalize name for matching: lowercase, no accents, trim
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const carreiraUrl = Deno.env.get('CARREIRA_SUPABASE_URL')
    const carreiraSyncSecret = Deno.env.get('CARREIRA_SYNC_SECRET')

    if (!carreiraUrl || !carreiraSyncSecret) {
      return new Response(JSON.stringify({ error: 'Carreira integration not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify user
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = claimsData.claims.sub as string

    const { type, action, crianca_id, data: syncData }: SyncPayload = await req.json()

    if (!type || !action || !crianca_id || !syncData) {
      return new Response(JSON.stringify({ error: 'Missing required fields: type, action, crianca_id, data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service role to fetch cross-table data
    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 1. Get crianca name + data_nascimento
    const { data: crianca, error: criancaError } = await serviceClient
      .from('criancas')
      .select('nome, data_nascimento')
      .eq('id', crianca_id)
      .single()

    if (criancaError || !crianca) {
      return new Response(JSON.stringify({ error: 'Criança não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Get responsavel email
    const { data: responsavelData, error: respError } = await serviceClient
      .from('crianca_responsavel')
      .select('responsavel:responsaveis(user_id)')
      .eq('crianca_id', crianca_id)
      .limit(1)
      .single()

    if (respError || !responsavelData?.responsavel) {
      return new Response(JSON.stringify({ error: 'Responsável não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const responsavelUserId = (responsavelData.responsavel as any).user_id

    // 3. Get email from auth.users via service role
    const { data: authUser, error: authError } = await serviceClient.auth.admin.getUserById(responsavelUserId)

    if (authError || !authUser?.user?.email) {
      return new Response(JSON.stringify({ error: 'Email do responsável não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Build envelope and send to Carreira ID
    const envelope = {
      sync_secret: carreiraSyncSecret,
      matching: {
        email_responsavel: authUser.user.email,
        nome_crianca: crianca.nome,
        nome_crianca_normalized: normalizeName(crianca.nome),
        data_nascimento: crianca.data_nascimento,
      },
      payload: {
        type,
        action,
        atleta_id_crianca_id: crianca_id,
        data: syncData,
      },
    }

    const carreiraEndpoint = `${carreiraUrl}/functions/v1/receive-atleta-data`

    const response = await fetch(carreiraEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    })

    const responseData = await response.text()

    if (!response.ok) {
      console.error('Carreira sync failed:', response.status, responseData)
      // Don't fail the main operation - log and return warning
      return new Response(JSON.stringify({
        success: false,
        warning: 'Sync to Carreira failed but main operation succeeded',
        status: response.status,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('send-to-carreira error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
