import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

interface AuditResult {
  crianca_id: string;
  crianca_nome: string;
  mensalidade_id: string;
  local_status: string;
  asaas_status: string | null;
  asaas_payment_id: string | null;
  mismatch: boolean;
  action_taken: string | null;
  double_entry: boolean;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { escolinha_id, mes_referencia } = await req.json();

    if (!escolinha_id) {
      return new Response(JSON.stringify({ error: 'escolinha_id é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Audit starting for escola:', escolinha_id, 'mes:', mes_referencia || 'all');

    // Get school's Asaas API key
    const { data: cadastroBancario } = await supabase
      .from('escola_cadastro_bancario')
      .select('asaas_api_key, asaas_account_id')
      .eq('escolinha_id', escolinha_id)
      .maybeSingle();

    const activeApiKey = cadastroBancario?.asaas_api_key || Deno.env.get('ASAAS_API_KEY');

    if (!activeApiKey) {
      return new Response(JSON.stringify({ error: 'Nenhuma chave API Asaas configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Using API key from:', cadastroBancario?.asaas_api_key ? 'school subconta' : 'master account');

    // Fetch all mensalidades for this school (optionally filtered by month)
    let query = supabase
      .from('mensalidades')
      .select('id, crianca_id, mes_referencia, valor, status, data_pagamento, forma_pagamento, asaas_payment_id, observacoes')
      .eq('escolinha_id', escolinha_id);

    if (mes_referencia) {
      query = query.eq('mes_referencia', mes_referencia);
    }

    const { data: mensalidades, error: mensError } = await query;

    if (mensError) {
      return new Response(JSON.stringify({ error: `Erro ao buscar mensalidades: ${mensError.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get criança names
    const criancaIds = [...new Set(mensalidades?.map(m => m.crianca_id) || [])];
    const { data: criancas } = await supabase
      .from('criancas')
      .select('id, nome')
      .in('id', criancaIds);

    const criancaMap = new Map(criancas?.map(c => [c.id, c.nome]) || []);

    const results: AuditResult[] = [];
    let autoSynced = 0;
    let mismatches = 0;
    let doubleEntries = 0;

    const paidStatuses = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

    for (const m of mensalidades || []) {
      const criancaNome = criancaMap.get(m.crianca_id) || 'Desconhecido';

      // If no asaas_payment_id, nothing to check against Asaas
      if (!m.asaas_payment_id) {
        results.push({
          crianca_id: m.crianca_id,
          crianca_nome: criancaNome,
          mensalidade_id: m.id,
          local_status: m.status,
          asaas_status: null,
          asaas_payment_id: null,
          mismatch: false,
          action_taken: null,
          double_entry: false,
        });
        continue;
      }

      // Check Asaas status
      try {
        const response = await fetch(`${ASAAS_API_URL}/payments/${m.asaas_payment_id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'access_token': activeApiKey,
          },
        });

        const paymentData = await response.json();

        if (paymentData.errors) {
          results.push({
            crianca_id: m.crianca_id,
            crianca_nome: criancaNome,
            mensalidade_id: m.id,
            local_status: m.status,
            asaas_status: null,
            asaas_payment_id: m.asaas_payment_id,
            mismatch: false,
            action_taken: null,
            double_entry: false,
            error: paymentData.errors[0]?.description || 'Erro ao consultar Asaas',
          });
          continue;
        }

        const asaasStatus = paymentData.status;
        const isPaidInAsaas = paidStatuses.includes(asaasStatus);
        const isPaidLocally = m.status === 'pago';
        const isMismatch = isPaidInAsaas !== isPaidLocally;

        // Detect double entry: paid manually AND paid in Asaas
        const isDoubleEntry = isPaidLocally && isPaidInAsaas && m.forma_pagamento === 'manual';

        let actionTaken: string | null = null;

        // Auto-sync: paid in Asaas but not locally
        if (isPaidInAsaas && !isPaidLocally) {
          const paymentDate = paymentData.confirmedDate || paymentData.paymentDate || new Date().toISOString().split('T')[0];

          const { error: updateError } = await supabase
            .from('mensalidades')
            .update({
              status: 'pago',
              data_pagamento: paymentDate,
              forma_pagamento: 'pix',
              valor_pago: paymentData.netValue || paymentData.value,
              observacoes: `${m.observacoes ? m.observacoes + ' | ' : ''}Sync automático: pago no Asaas em ${paymentDate}`,
            })
            .eq('id', m.id);

          if (!updateError) {
            actionTaken = `Auto-sincronizado: pago em ${paymentDate} (R$ ${(paymentData.netValue || paymentData.value).toFixed(2)})`;
            autoSynced++;
          } else {
            actionTaken = `Erro ao sincronizar: ${updateError.message}`;
          }
        }

        if (isMismatch) mismatches++;
        if (isDoubleEntry) doubleEntries++;

        results.push({
          crianca_id: m.crianca_id,
          crianca_nome: criancaNome,
          mensalidade_id: m.id,
          local_status: isPaidInAsaas && !isPaidLocally ? 'pago' : m.status,
          asaas_status: asaasStatus,
          asaas_payment_id: m.asaas_payment_id,
          mismatch: isMismatch,
          action_taken: actionTaken,
          double_entry: isDoubleEntry,
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (err) {
        results.push({
          crianca_id: m.crianca_id,
          crianca_nome: criancaNome,
          mensalidade_id: m.id,
          local_status: m.status,
          asaas_status: null,
          asaas_payment_id: m.asaas_payment_id,
          mismatch: false,
          action_taken: null,
          double_entry: false,
          error: err instanceof Error ? err.message : 'Erro desconhecido',
        });
      }
    }

    // Update child financial status for auto-synced payments
    if (autoSynced > 0) {
      for (const result of results.filter(r => r.action_taken?.startsWith('Auto-sincronizado'))) {
        const { data: pendingPayments } = await supabase
          .from('mensalidades')
          .select('id')
          .eq('crianca_id', result.crianca_id)
          .in('status', ['a_vencer', 'atrasado']);

        if (!pendingPayments || pendingPayments.length === 0) {
          await supabase
            .from('criancas')
            .update({ status_financeiro: 'ativo' })
            .eq('id', result.crianca_id);
        }
      }
    }

    const summary = {
      total: results.length,
      auto_synced: autoSynced,
      mismatches,
      double_entries: doubleEntries,
      errors: results.filter(r => r.error).length,
      paid_in_asaas: results.filter(r => paidStatuses.includes(r.asaas_status || '')).length,
      pending_in_asaas: results.filter(r => r.asaas_status === 'PENDING').length,
      no_asaas_id: results.filter(r => !r.asaas_payment_id).length,
    };

    console.log('Audit complete:', JSON.stringify(summary));

    return new Response(
      JSON.stringify({ success: true, summary, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
