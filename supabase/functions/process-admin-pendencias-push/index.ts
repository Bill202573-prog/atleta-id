import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Get all active schools
    const { data: escolinhas, error: escolinhasError } = await supabase
      .from('escolinhas')
      .select('id, nome, admin_user_id')
      .eq('ativo', true)
      .not('admin_user_id', 'is', null);

    if (escolinhasError) throw escolinhasError;
    if (!escolinhas || escolinhas.length === 0) {
      return new Response(JSON.stringify({ message: 'No active schools found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalSent = 0;

    for (const escola of escolinhas) {
      const pendencias: string[] = [];

      // 1. Amistosos em aberto (agendados com data passada)
      const { data: amistosos } = await supabase
        .from('eventos_esportivos')
        .select('id, nome, data')
        .eq('escolinha_id', escola.id)
        .eq('tipo', 'amistoso')
        .in('status', ['agendado'])
        .lt('data', todayStr);

      const amistososAbertos = (amistosos || []).length;
      if (amistososAbertos > 0) {
        pendencias.push(`${amistososAbertos} amistoso${amistososAbertos > 1 ? 's' : ''} sem finalizar`);
      }

      // 2. Aulas sem chamada
      const { data: turmas } = await supabase
        .from('turmas')
        .select('id')
        .eq('escolinha_id', escola.id)
        .eq('ativo', true);

      if (turmas && turmas.length > 0) {
        const turmaIds = turmas.map(t => t.id);

        const { data: aulas } = await supabase
          .from('aulas')
          .select('id, data, turma_id')
          .in('turma_id', turmaIds)
          .in('status', ['normal', 'extra'])
          .lt('data', todayStr)
          .order('data', { ascending: false })
          .limit(100);

        if (aulas && aulas.length > 0) {
          const aulaIds = aulas.map(a => a.id);
          const { data: presencas } = await supabase
            .from('presencas')
            .select('aula_id')
            .in('aula_id', aulaIds);

          const aulasComPresenca = new Set((presencas || []).map(p => p.aula_id));
          const aulasSemChamada = aulas.filter(a => !aulasComPresenca.has(a.id)).length;

          if (aulasSemChamada > 0) {
            pendencias.push(`${aulasSemChamada} aula${aulasSemChamada > 1 ? 's' : ''} sem chamada`);
          }
        }
      }

      // Only send push if there are pendências
      if (pendencias.length === 0) continue;

      // Check if we already sent recently (within 2 days) using push_notifications_log
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const twoDaysAgoStr = twoDaysAgo.toISOString();

      const { data: recentLog } = await supabase
        .from('push_notifications_log')
        .select('id')
        .eq('user_id', escola.admin_user_id)
        .eq('tipo', 'admin_pendencias')
        .eq('referencia_id', escola.id)
        .gte('created_at', twoDaysAgoStr)
        .limit(1);

      if (recentLog && recentLog.length > 0) continue;

      const totalPendencias = (amistosos || []).length + 
        (pendencias.length > 1 ? parseInt(pendencias[1]?.match(/\d+/)?.[0] || '0') : 0);

      const body = `Você tem ${pendencias.join(' e ')} pendentes. Acesse o painel para resolver.`;

      // Send push via existing send-push-notification function
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          user_ids: [escola.admin_user_id],
          title: '📋 Pendências da Escola',
          body,
          url: '/dashboard',
          tag: `admin-pendencias-${escola.id}`,
          tipo: 'admin_pendencias',
          referencia_id: escola.id,
          dias_antes: 0,
          escolinha_id: escola.id,
        }),
      });

      const result = await pushResponse.json();
      totalSent += result.sent || 0;
    }

    return new Response(JSON.stringify({
      message: 'Admin pendencias push processed',
      schools: escolinhas.length,
      totalSent,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Admin pendencias push error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
