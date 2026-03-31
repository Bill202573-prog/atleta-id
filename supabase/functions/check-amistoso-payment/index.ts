import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

interface CheckPaymentRequest {
  convocacao_id: string;
  payment_id?: string;
}

interface AsaasPaymentStatus {
  id: string;
  status: string;
  value: number;
  netValue: number;
  confirmedDate?: string;
  paymentDate?: string;
  errors?: Array<{ code: string; description: string }>;
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
      console.error('Missing ASAAS_API_KEY');
      return new Response(
        JSON.stringify({ error: 'Configuração de pagamento não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { convocacao_id, payment_id }: CheckPaymentRequest = await req.json();

    console.log('Checking amistoso payment for convocacao:', convocacao_id, 'payment_id:', payment_id);

    // Fetch convocacao with evento -> escolinha to get the correct API key
    const { data: convocacao, error: convError } = await supabase
      .from('amistoso_convocacoes')
      .select(`
        asaas_payment_id,
        evento:eventos_esportivos!amistoso_convocacoes_evento_id_fkey(
          escolinha_id
        )
      `)
      .eq('id', convocacao_id)
      .single();

    if (convError || !convocacao) {
      console.error('Convocacao not found:', convError);
      return new Response(
        JSON.stringify({ error: 'Convocação não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const asaasPaymentId = payment_id || convocacao.asaas_payment_id;

    if (!asaasPaymentId) {
      return new Response(
        JSON.stringify({ error: 'Nenhuma cobrança PIX encontrada para esta convocação' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine the correct API key — prefer school's subconta key
    const eventoData = convocacao.evento as any;
    const escolinhaId = eventoData?.escolinha_id;
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

    console.log('Checking Asaas payment:', asaasPaymentId);

    // Check payment status with Asaas using the correct API key
    const response = await fetch(`${ASAAS_API_URL}/payments/${asaasPaymentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': activeApiKey,
      },
    });

    const paymentData: AsaasPaymentStatus = await response.json();
    console.log('Asaas payment status response:', JSON.stringify(paymentData));

    if (paymentData.errors) {
      console.error('Asaas error:', paymentData.errors);
      return new Response(
        JSON.stringify({ error: 'Erro ao verificar pagamento', details: paymentData.errors }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paidStatuses = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
    const isPaid = paidStatuses.includes(paymentData.status);

    console.log('Payment status:', paymentData.status, 'isPaid:', isPaid);

    if (isPaid) {
      const paymentDate = paymentData.confirmedDate || paymentData.paymentDate || new Date().toISOString().split('T')[0];
      
      const { error: updateError } = await supabase
        .from('amistoso_convocacoes')
        .update({
          status: 'pago',
          data_pagamento: paymentDate,
        })
        .eq('id', convocacao_id);

      if (updateError) {
        console.error('Error updating convocacao:', updateError);
        return new Response(
          JSON.stringify({ error: 'Erro ao atualizar status da convocação' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('Convocacao marked as pago');
    }

    return new Response(
      JSON.stringify({ 
        status: paymentData.status,
        isPaid,
        data: paymentData
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
