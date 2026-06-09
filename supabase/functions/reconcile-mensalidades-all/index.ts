import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Reconciles mensalidades across all schools for current and previous month.
// Calls audit-mensalidade-payments per school which auto-syncs paid-in-Asaas mensalidades.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const now = new Date();
    const curr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prev = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}-01`;

    // Schools with at least one pending mensalidade with asaas_payment_id in current or previous month
    const { data: rows, error } = await supabase
      .from('mensalidades')
      .select('escolinha_id')
      .in('mes_referencia', [curr, prev])
      .not('asaas_payment_id', 'is', null)
      .in('status', ['a_vencer', 'atrasado']);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const escolaIds = [...new Set((rows || []).map(r => r.escolinha_id))];
    const summaries: any[] = [];
    let totalAutoSynced = 0;
    let totalMismatches = 0;

    for (const escolinha_id of escolaIds) {
      for (const mes of [curr, prev]) {
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/audit-mensalidade-payments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ escolinha_id, mes_referencia: mes }),
          });
          const data = await res.json();
          if (data?.summary) {
            totalAutoSynced += data.summary.auto_synced || 0;
            totalMismatches += data.summary.mismatches || 0;
            if ((data.summary.auto_synced || 0) > 0) {
              summaries.push({ escolinha_id, mes, ...data.summary });
              console.log(`Reconcile ${escolinha_id} ${mes}: synced=${data.summary.auto_synced} mismatches=${data.summary.mismatches}`);
            }
          }
        } catch (e) {
          console.error(`Error reconciling ${escolinha_id} ${mes}:`, e);
        }
      }
    }

    const summary = {
      schools_checked: escolaIds.length,
      total_auto_synced: totalAutoSynced,
      total_mismatches: totalMismatches,
    };
    console.log('Reconcile-all summary:', JSON.stringify(summary));

    return new Response(JSON.stringify({ success: true, summary, details: summaries }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'erro' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
