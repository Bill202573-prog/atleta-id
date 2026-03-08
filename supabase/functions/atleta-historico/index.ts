import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const criancaId = url.searchParams.get("crianca_id");

    if (!criancaId) {
      return new Response(
        JSON.stringify({ error: "crianca_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Validate public profile exists and check visibility flags
    const { data: perfil, error: perfilError } = await supabase
      .from("perfil_atleta")
      .select("id, is_public, dados_publicos, crianca_id")
      .eq("crianca_id", criancaId)
      .eq("is_public", true)
      .maybeSingle();

    if (perfilError) throw perfilError;

    if (!perfil) {
      return new Response(
        JSON.stringify({ error: "Perfil não encontrado ou não é público" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const flags = (perfil.dados_publicos as Record<string, boolean>) || {};

    // 2. Get school enrollments (always public for context)
    const { data: vinculos } = await supabase
      .from("crianca_escolinha")
      .select("escolinha_id, data_inicio, data_fim, ativo, categoria")
      .eq("crianca_id", criancaId);

    // Get school names via public view
    const escolinhaIds = [...new Set(vinculos?.map((v) => v.escolinha_id) || [])];
    const { data: escolinhas } = await supabase
      .from("escolinhas_publico")
      .select("id, nome, logo_url")
      .in("id", escolinhaIds);

    const escolinhasMap: Record<string, { nome: string; logo_url: string | null }> = {};
    escolinhas?.forEach((e: any) => {
      escolinhasMap[e.id] = { nome: e.nome, logo_url: e.logo_url };
    });

    const vinculosEnriquecidos = vinculos?.map((v) => ({
      ...v,
      escolinha_nome: escolinhasMap[v.escolinha_id]?.nome || "Escola",
      escolinha_logo: escolinhasMap[v.escolinha_id]?.logo_url || null,
    })) || [];

    // 3. Get event participations via teams
    const { data: participacoes } = await supabase
      .from("evento_time_alunos")
      .select(`
        id,
        time_id,
        time:evento_times(
          id,
          nome,
          evento_id,
          evento:eventos_esportivos!evento_times_evento_id_fkey(
            id,
            nome,
            tipo,
            categoria,
            data,
            status,
            placar_time1,
            placar_time2,
            adversario,
            time1_id,
            escolinha_id
          )
        )
      `)
      .eq("crianca_id", criancaId);

    // 4. Get goals (if flag enabled)
    let golsData: any[] = [];
    if (flags.gols !== false) {
      const { data } = await supabase
        .from("evento_gols")
        .select("evento_id, quantidade, time_id")
        .eq("crianca_id", criancaId);
      golsData = data || [];
    }

    // 5. Get awards (if flag enabled)
    let premiacoesData: any[] = [];
    if (flags.premiacoes !== false) {
      const { data } = await supabase
        .from("evento_premiacoes")
        .select("id, evento_id, tipo_premiacao")
        .eq("crianca_id", criancaId);
      premiacoesData = data || [];
    }

    // 6. Get amistoso convocations (if flag enabled)
    let convocacoesAmistoso: any[] = [];
    if (flags.amistosos !== false) {
      const { data } = await supabase
        .from("amistoso_convocacoes")
        .select("evento_id, presente, motivo_ausencia, destaque")
        .eq("crianca_id", criancaId);
      convocacoesAmistoso = data || [];
    }

    // 7. Get campeonato convocations (if flag enabled)
    let convocacoesCampeonato: any[] = [];
    if (flags.campeonatos !== false) {
      const { data } = await supabase
        .from("campeonato_convocacoes")
        .select("campeonato_id, status")
        .eq("crianca_id", criancaId);
      convocacoesCampeonato = data || [];
    }

    // 8. Get collective achievements (if flag enabled)
    let conquistasData: any[] = [];
    if (flags.conquistas !== false) {
      // Get achievements from schools the child belongs to
      const { data } = await supabase
        .from("conquistas_coletivas")
        .select("id, nome_campeonato, colocacao, ano, categoria, escolinha_id, evento_id")
        .in("escolinha_id", escolinhaIds);
      conquistasData = data || [];
    }

    // === Build consolidated response ===

    // Build maps
    const golsByEvento: Record<string, number> = {};
    golsData.forEach((g) => {
      golsByEvento[g.evento_id] = (golsByEvento[g.evento_id] || 0) + g.quantidade;
    });

    const premiacoesByEvento: Record<string, { id: string; tipo: string }[]> = {};
    premiacoesData.forEach((p) => {
      if (!premiacoesByEvento[p.evento_id]) premiacoesByEvento[p.evento_id] = [];
      premiacoesByEvento[p.evento_id].push({ id: p.id, tipo: p.tipo_premiacao });
    });

    const convocacoesByEvento: Record<string, any> = {};
    convocacoesAmistoso.forEach((c) => {
      convocacoesByEvento[c.evento_id] = {
        presente: c.presente,
        motivo_ausencia: c.motivo_ausencia,
        destaque: c.destaque ?? false,
      };
    });

    // Build events list
    const eventos: any[] = [];
    const seenEventos = new Set<string>();

    participacoes?.forEach((p: any) => {
      const time = p.time;
      const evento = time?.evento;
      if (!evento || evento.status === "agendado" || seenEventos.has(evento.id)) return;
      seenEventos.add(evento.id);

      const isTime1 = time.id === evento.time1_id;
      let resultado: string | null = null;

      if (evento.placar_time1 !== null && evento.placar_time2 !== null) {
        if (isTime1) {
          if (evento.placar_time1 > evento.placar_time2) resultado = "vitoria";
          else if (evento.placar_time1 < evento.placar_time2) resultado = "derrota";
          else resultado = "empate";
        } else {
          if (evento.placar_time2 > evento.placar_time1) resultado = "vitoria";
          else if (evento.placar_time2 < evento.placar_time1) resultado = "derrota";
          else resultado = "empate";
        }
      }

      const convInfo = convocacoesByEvento[evento.id];

      eventos.push({
        id: evento.id,
        nome: evento.nome,
        tipo: evento.tipo,
        categoria: evento.categoria,
        data: evento.data,
        time_nome: time.nome,
        time_id: time.id,
        placar_time1: evento.placar_time1,
        placar_time2: evento.placar_time2,
        adversario: evento.adversario,
        gols_marcados: golsByEvento[evento.id] || 0,
        premiacoes: premiacoesByEvento[evento.id] || [],
        resultado,
        escolinha_id: evento.escolinha_id,
        escolinha_nome: escolinhasMap[evento.escolinha_id]?.nome || "Escola",
        presente: convInfo?.presente ?? null,
        motivo_ausencia: convInfo?.motivo_ausencia ?? null,
        destaque: convInfo?.destaque ?? false,
      });
    });

    // Sort by date descending
    eventos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    // Calculate stats
    const stats = {
      total_eventos: eventos.length,
      total_amistosos: eventos.filter((e) => e.tipo === "amistoso").length,
      total_campeonatos: eventos.filter((e) => e.tipo === "campeonato").length,
      total_gols: eventos.reduce((acc, e) => acc + e.gols_marcados, 0),
      gols_amistosos: eventos.filter((e) => e.tipo === "amistoso").reduce((acc, e) => acc + e.gols_marcados, 0),
      gols_campeonatos: eventos.filter((e) => e.tipo === "campeonato").reduce((acc, e) => acc + e.gols_marcados, 0),
      total_premiacoes: eventos.reduce((acc, e) => acc + e.premiacoes.length, 0),
      vitorias: eventos.filter((e) => e.resultado === "vitoria").length,
      derrotas: eventos.filter((e) => e.resultado === "derrota").length,
      empates: eventos.filter((e) => e.resultado === "empate").length,
      presencas: eventos.filter((e) => e.presente === true).length,
      faltas: eventos.filter((e) => e.presente === false).length,
    };

    const response = {
      crianca_id: criancaId,
      perfil_publico: true,
      flags_visibilidade: flags,
      vinculos: vinculosEnriquecidos,
      eventos,
      conquistas: conquistasData.map((c) => ({
        ...c,
        escolinha_nome: escolinhasMap[c.escolinha_id]?.nome || "Escola",
      })),
      stats,
      generated_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro na atleta-historico:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao buscar histórico" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
