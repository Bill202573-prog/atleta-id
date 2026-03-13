import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function normalizeName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const carreiraUrl = Deno.env.get('CARREIRA_SUPABASE_URL')
    const carreiraSyncSecret = Deno.env.get('CARREIRA_SYNC_SECRET')

    if (!carreiraUrl || !carreiraSyncSecret) {
      return new Response(JSON.stringify({ error: 'Carreira integration not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify user
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { crianca_id, data_types } = await req.json()
    if (!crianca_id) {
      return new Response(JSON.stringify({ error: 'Missing crianca_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Optional filter: which data types to sync
    const allowedTypes: Set<string> | null = data_types && Array.isArray(data_types)
      ? new Set(data_types as string[])
      : null

    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Get crianca info
    const { data: crianca, error: criancaError } = await serviceClient
      .from('criancas')
      .select('nome, data_nascimento')
      .eq('id', crianca_id)
      .single()

    if (criancaError || !crianca) {
      return new Response(JSON.stringify({ error: 'Criança não encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get responsavel email
    const { data: responsavelData } = await serviceClient
      .from('crianca_responsavel')
      .select('responsavel:responsaveis(user_id)')
      .eq('crianca_id', crianca_id)
      .limit(1)
      .single()

    if (!responsavelData?.responsavel) {
      return new Response(JSON.stringify({ error: 'Responsável não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const responsavelUserId = (responsavelData.responsavel as any).user_id
    const { data: authUser } = await serviceClient.auth.admin.getUserById(responsavelUserId)

    if (!authUser?.user?.email) {
      return new Response(JSON.stringify({ error: 'Email do responsável não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const matching = {
      email_responsavel: authUser.user.email,
      nome_crianca: crianca.nome,
      nome_crianca_normalized: normalizeName(crianca.nome),
      data_nascimento: crianca.data_nascimento,
    }

    const carreiraEndpoint = `${carreiraUrl}/functions/v1/receive-atleta-data`
    const results: { type: string; count: number; errors: number }[] = []

    async function sendItem(type: string, data: Record<string, unknown>) {
      const envelope = {
        tipo: type,
        acao: 'create',
        dados: data,
        email_responsavel: matching.email_responsavel,
        nome_crianca: matching.nome_crianca,
        nome_crianca_normalized: matching.nome_crianca_normalized,
        data_nascimento: matching.data_nascimento,
        atleta_id_crianca_id: crianca_id,
      }
      try {
        console.log(`[sync] Sending ${type} to ${carreiraEndpoint}`)
        const resp = await fetch(carreiraEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-sync-secret': carreiraSyncSecret! },
          body: JSON.stringify(envelope),
        })
        if (!resp.ok) {
          const body = await resp.text()
          console.error(`[sync] ${type} failed: ${resp.status} - ${body}`)
        }
        return resp.ok
      } catch (fetchErr) {
        console.error(`[sync] ${type} fetch error:`, fetchErr)
        return false
      }
    }

    function shouldSync(type: string): boolean {
      return !allowedTypes || allowedTypes.has(type)
    }

    // 0. Histórico de Escolinhas (experiências)
    if (shouldSync('experiencia_escolinha')) {
      const { data: vinculos } = await serviceClient
        .from('crianca_escolinha')
        .select('id, escolinha_id, data_inicio, data_fim, ativo, categoria, escolinha:escolinhas(nome, cidade, estado, bairro)')
        .eq('crianca_id', crianca_id)

      if (vinculos?.length) {
        let ok = 0, err = 0
        for (const v of vinculos) {
          const escola = v.escolinha as any
          const success = await sendItem('experiencia_escolinha', {
            id: v.id,
            escolinha_id: v.escolinha_id,
            nome_escola: escola?.nome,
            data_inicio: v.data_inicio,
            data_fim: v.data_fim,
            atual: v.ativo,
            categoria: v.categoria,
            cidade: escola?.cidade,
            estado: escola?.estado,
            bairro: escola?.bairro,
          })
          success ? ok++ : err++
        }
        results.push({ type: 'experiencia_escolinha', count: ok, errors: err })
      }
    }

    // 1. Atividades Externas
    if (shouldSync('atividade_externa')) {
      const { data: atividades } = await serviceClient
        .from('atividades_externas')
        .select('*')
        .eq('crianca_id', crianca_id)

      if (atividades?.length) {
        let ok = 0, err = 0
        for (const a of atividades) {
          const success = await sendItem('atividade_externa', a)
          success ? ok++ : err++
        }
        results.push({ type: 'atividade_externa', count: ok, errors: err })
      }
    }

    // 2. Gols
    if (shouldSync('evento_gol')) {
      const { data: gols } = await serviceClient
        .from('evento_gols')
        .select('*, evento:eventos_esportivos(nome, data, adversario, placar_time1, placar_time2), time:evento_times(nome)')
        .eq('crianca_id', crianca_id)

      if (gols?.length) {
        let ok = 0, err = 0
        for (const g of gols) {
          const evento = g.evento as any
          const time = g.time as any
          const success = await sendItem('evento_gol', {
            id: g.id, evento_id: g.evento_id, time_id: g.time_id, quantidade: g.quantidade,
            evento_nome: evento?.nome, evento_data: evento?.data, evento_adversario: evento?.adversario,
            evento_placar_time1: evento?.placar_time1, evento_placar_time2: evento?.placar_time2,
            time_nome: time?.nome,
          })
          success ? ok++ : err++
        }
        results.push({ type: 'evento_gol', count: ok, errors: err })
      }
    }

    // 3. Premiações
    if (shouldSync('evento_premiacao')) {
      const { data: premiacoes } = await serviceClient
        .from('evento_premiacoes')
        .select('*, evento:eventos_esportivos(nome, data)')
        .eq('crianca_id', crianca_id)

      if (premiacoes?.length) {
        let ok = 0, err = 0
        for (const p of premiacoes) {
          const evento = p.evento as any
          const success = await sendItem('evento_premiacao', {
            id: p.id, evento_id: p.evento_id, tipo_premiacao: p.tipo_premiacao,
            evento_nome: evento?.nome, evento_data: evento?.data,
          })
          success ? ok++ : err++
        }
        results.push({ type: 'evento_premiacao', count: ok, errors: err })
      }
    }

    // 4. Conquistas Coletivas
    if (shouldSync('conquista_coletiva')) {
      const { data: vinculos } = await serviceClient
        .from('crianca_escolinha')
        .select('escolinha_id')
        .eq('crianca_id', crianca_id)

      if (vinculos?.length) {
        const escolinhaIds = vinculos.map(v => v.escolinha_id)
        const { data: conquistas } = await serviceClient
          .from('conquistas_coletivas')
          .select('*')
          .in('escolinha_id', escolinhaIds)

        if (conquistas?.length) {
          let ok = 0, err = 0
          for (const c of conquistas) {
            const success = await sendItem('conquista_coletiva', c)
            success ? ok++ : err++
          }
          results.push({ type: 'conquista_coletiva', count: ok, errors: err })
        }
      }
    }

    // 5. Amistoso Convocações
    if (shouldSync('amistoso_convocacao')) {
      const { data: amistosoConvs } = await serviceClient
        .from('amistoso_convocacoes')
        .select('id, evento_id, status, presente, evento:eventos_esportivos(nome, data, tipo, adversario, local, placar_time1, placar_time2, status)')
        .eq('crianca_id', crianca_id)

      if (amistosoConvs?.length) {
        let ok = 0, err = 0
        for (const ac of amistosoConvs) {
          const evento = ac.evento as any
          const success = await sendItem('amistoso_convocacao', {
            id: ac.id, evento_nome: evento?.nome, evento_data: evento?.data,
            evento_tipo: evento?.tipo, evento_adversario: evento?.adversario,
            evento_local: evento?.local, evento_placar_time1: evento?.placar_time1,
            evento_placar_time2: evento?.placar_time2, evento_status: evento?.status,
            status: ac.status, presente: ac.presente,
          })
          success ? ok++ : err++
        }
        results.push({ type: 'amistoso_convocacao', count: ok, errors: err })
      }
    }

    // 6. Campeonato Convocações
    if (shouldSync('campeonato_convocacao')) {
      const { data: campConvs } = await serviceClient
        .from('campeonato_convocacoes')
        .select('id, campeonato_id, status, campeonato:campeonatos(nome, ano, categoria, status, nome_time, escolinha:escolinhas(nome))')
        .eq('crianca_id', crianca_id)

      if (campConvs?.length) {
        let ok = 0, err = 0
        for (const cc of campConvs) {
          const camp = cc.campeonato as any
          const success = await sendItem('campeonato_convocacao', {
            id: cc.id, campeonato_nome: camp?.nome, campeonato_ano: camp?.ano,
            campeonato_categoria: camp?.categoria, campeonato_status: camp?.status,
            campeonato_nome_time: camp?.nome_time, escolinha_nome: camp?.escolinha?.nome,
            status: cc.status,
          })
          success ? ok++ : err++
        }
        results.push({ type: 'campeonato_convocacao', count: ok, errors: err })
      }
    }

    const totalSent = results.reduce((sum, r) => sum + r.count, 0)
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0)

    return new Response(JSON.stringify({
      success: true,
      crianca: crianca.nome,
      total_sent: totalSent,
      total_errors: totalErrors,
      details: results,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('sync-all-to-carreira error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
