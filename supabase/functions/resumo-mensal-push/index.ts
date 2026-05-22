// Envia push de "Resumo Mensal" para responsáveis das crianças das escolas habilitadas.
// As escolas habilitadas são gerenciadas pelo admin via resumo_mensal_escolas_habilitadas.
// Disparado por cron no dia 01 às 12:00 (referência: mês anterior).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MENSAGENS = [
  (n: string) => `O resumo esportivo já está disponível ⚽`,
  (n: string) => `Veja como foi o mês de ${n} na escolinha.`,
  (n: string) => `Mais um mês registrado na jornada esportiva de ${n}.`,
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Mês de referência = mês anterior ao atual (UTC-3 aprox; usamos data corrente)
    const now = new Date();
    let mesRef = now.getMonth(); // 0..11 -> mês anterior 0-index
    let anoRef = now.getFullYear();
    if (mesRef === 0) {
      mesRef = 12;
      anoRef -= 1;
    }
    // mesRef agora é 1..12 representando mês anterior

    // Permitir override por body (testes)
    let body: any = {};
    try { body = await req.json(); } catch {}
    if (body?.ano) anoRef = Number(body.ano);
    if (body?.mes) mesRef = Number(body.mes);
    const dryRun = !!body?.dry_run;

    // Escolas habilitadas (gerenciadas pelo admin)
    const { data: escolasHab, error: ehErr } = await admin
      .from('resumo_mensal_escolas_habilitadas')
      .select('escolinha_id');
    if (ehErr) throw ehErr;
    const escolinhaIds = (escolasHab || []).map((e: any) => e.escolinha_id);
    if (escolinhaIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'Nenhuma escola habilitada' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Crianças ativas das escolas habilitadas
    const { data: vinculos, error: vErr } = await admin
      .from('crianca_escolinha')
      .select('crianca_id, escolinha_id')
      .in('escolinha_id', escolinhaIds)
      .eq('ativo', true);
    if (vErr) throw vErr;
    const escolaDaCrianca = new Map<string, string>();
    for (const v of vinculos || []) {
      if (!escolaDaCrianca.has((v as any).crianca_id)) {
        escolaDaCrianca.set((v as any).crianca_id, (v as any).escolinha_id);
      }
    }
    const criancaIds = [...escolaDaCrianca.keys()];
    if (criancaIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'Nenhuma criança ativa' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Já enviadas neste mês
    const { data: enviados } = await admin
      .from('resumo_mensal_envios')
      .select('crianca_id')
      .eq('ano', anoRef)
      .eq('mes', mesRef);
    const jaEnviado = new Set((enviados || []).map((e: any) => e.crianca_id));
    const pendentes = criancaIds.filter((id) => !jaEnviado.has(id));

    // Nomes das crianças
    const { data: criancas } = await admin
      .from('criancas')
      .select('id, nome')
      .in('id', pendentes);
    const nomeMap = new Map((criancas || []).map((c: any) => [c.id, c.nome]));

    // Para cada criança, descobrir responsáveis e enviar
    let totalSent = 0;
    let totalFailed = 0;

    for (const criancaId of pendentes) {
      const nome = String(nomeMap.get(criancaId) || 'seu atleta').split(' ')[0];

      const { data: links } = await admin
        .from('crianca_responsavel')
        .select('responsavel_id')
        .eq('crianca_id', criancaId);
      const respIds = [...new Set((links || []).map((l: any) => l.responsavel_id))];
      if (respIds.length === 0) continue;

      const { data: resps } = await admin
        .from('responsaveis')
        .select('user_id')
        .in('id', respIds);
      const userIds = [...new Set((resps || []).map((r: any) => r.user_id).filter(Boolean))];
      if (userIds.length === 0) continue;

      const msg = MENSAGENS[Math.floor(Math.random() * MENSAGENS.length)](nome);
      const deepLink = `/dashboard/jornada/resumo/${criancaId}/${anoRef}/${mesRef}`;

      if (dryRun) {
        totalSent += userIds.length;
        continue;
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          user_ids: userIds,
          title: 'Resumo do mês ⚽',
          body: msg,
          url: deepLink,
          tag: `resumo-${anoRef}-${mesRef}-${criancaId}`,
          tipo: 'resumo_mensal',
          referencia_id: criancaId,
          escolinha_id: escolaDaCrianca.get(criancaId),
        }),
      });

      if (resp.ok) {
        const json = await resp.json().catch(() => ({}));
        totalSent += json?.sent || 0;
        totalFailed += json?.failed || 0;
        await admin.from('resumo_mensal_envios').insert({
          crianca_id: criancaId,
          ano: anoRef,
          mes: mesRef,
        });
      } else {
        totalFailed += userIds.length;
        console.error('send-push falhou', criancaId, await resp.text());
      }
    }

    return new Response(
      JSON.stringify({
        ano: anoRef,
        mes: mesRef,
        criancas_processadas: pendentes.length,
        sent: totalSent,
        failed: totalFailed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('resumo-mensal-push erro:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
