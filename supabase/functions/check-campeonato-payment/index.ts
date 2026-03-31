import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

interface CheckPaymentRequest {
  convocacao_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!ASAAS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Configuração de pagamento não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { convocacao_id }: CheckPaymentRequest = await req.json();

    console.log('Checking campeonato payment for convocacao:', convocacao_id);

    // Fetch convocacao with campeonato -> escolinha
    const { data: convocacao, error: convocacaoError } = await supabase
      .from('campeonato_convocacoes')
      .select('*, campeonato:campeonatos!campeonato_convocacoes_campeonato_id_fkey(escolinha_id)')
      .eq('id', convocacao_id)
      .single();

    if (convocacaoError || !convocacao) {
      return new Response(
        JSON.stringify({ error: 'Convocação não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Already paid?
    if (convocacao.status === 'pago') {
      return new Response(
        JSON.stringify({ success: true, status: 'pago', message: 'Pagamento já confirmado' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!convocacao.asaas_payment_id) {
      return new Response(
        JSON.stringify({ success: false, status: 'sem_cobranca', message: 'Nenhuma cobrança gerada' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API key — prefer school's subconta key from DB
    const campeonatoRaw = convocacao.campeonato as any;
    const escolinhaId = campeonatoRaw?.escolinha_id;
    let activeApiKey = ASAAS_API_KEY;

    if (escolinhaId) {
      const { data: cadastro } = await supabase
        .from('escola_cadastro_bancario')
        .select('asaas_api_key, asaas_account_id')
        .eq('escolinha_id', escolinhaId)
        .single();

      if (cadastro?.asaas_api_key) {
        activeApiKey = cadastro.asaas_api_key;
        console.log("Using school's Asaas API key for escolinha:", escolinhaId);
      } else {
        console.warn('ALERTA: Escola sem API key Asaas, usando master key. Escolinha:', escolinhaId);
      }
    }

    // Check payment status at Asaas
    const paymentResponse = await fetch(`${ASAAS_API_URL}/payments/${convocacao.asaas_payment_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': activeApiKey,
      },
    });

    const paymentData = await paymentResponse.json();
    console.log('Asaas payment status:', paymentData.status);

    if (paymentData.status === 'RECEIVED' || paymentData.status === 'CONFIRMED') {
      // Update to paid
      const { error: updateError } = await supabase
        .from('campeonato_convocacoes')
        .update({
          status: 'pago',
          data_pagamento: new Date().toISOString(),
        })
        .eq('id', convocacao_id);

      if (updateError) {
        console.error('Error updating convocacao:', updateError);
      }

      return new Response(
        JSON.stringify({ success: true, status: 'pago', message: 'Pagamento confirmado!' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Not paid yet
    return new Response(
      JSON.stringify({ 
        success: false, 
        status: paymentData.status?.toLowerCase() || 'pendente',
        message: 'Aguardando pagamento' 
      }),
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
