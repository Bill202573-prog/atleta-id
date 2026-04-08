import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

interface CheckPaymentRequest {
  pix_id: string;
  mensalidade_id: string;
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
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { pix_id, mensalidade_id }: CheckPaymentRequest = await req.json();

    console.log('Checking payment for Asaas payment:', pix_id, 'Mensalidade:', mensalidade_id);

    // Get the mensalidade to find the school
    const { data: mensalidade, error: mensalidadeError } = await supabase
      .from('mensalidades')
      .select('escolinha_id, crianca_id')
      .eq('id', mensalidade_id)
      .single();

    if (mensalidadeError || !mensalidade) {
      console.error('Mensalidade not found:', mensalidadeError);
      return new Response(
        JSON.stringify({ error: 'Mensalidade não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: Get the school's own Asaas API key
    const { data: cadastroBancario } = await supabase
      .from('escola_cadastro_bancario')
      .select('asaas_api_key')
      .eq('escolinha_id', mensalidade.escolinha_id)
      .maybeSingle();

    // Use school's API key, fallback to master key
    const activeApiKey = cadastroBancario?.asaas_api_key || Deno.env.get('ASAAS_API_KEY');

    if (!activeApiKey) {
      console.error('No API key available for school:', mensalidade.escolinha_id);
      return new Response(
        JSON.stringify({ error: 'Configuração de pagamento não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Using API key from:', cadastroBancario?.asaas_api_key ? 'school subconta' : 'master account',
      'for escola:', mensalidade.escolinha_id);

    // Check payment status with Asaas
    const response = await fetch(`${ASAAS_API_URL}/payments/${pix_id}`, {
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
        JSON.stringify({ error: 'Erro ao verificar pagamento' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paidStatuses = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
    const isPaid = paidStatuses.includes(paymentData.status);

    console.log('Payment status:', paymentData.status, 'isPaid:', isPaid);

    if (isPaid) {
      const paymentDate = paymentData.confirmedDate || paymentData.paymentDate || new Date().toISOString().split('T')[0];
      
      const { error: updateError } = await supabase
        .from('mensalidades')
        .update({
          status: 'pago',
          data_pagamento: paymentDate,
          forma_pagamento: 'pix',
          valor_pago: paymentData.netValue || paymentData.value,
        })
        .eq('id', mensalidade_id);

      if (updateError) {
        console.error('Error updating mensalidade:', updateError);
      } else {
        console.log('Mensalidade marked as pago');
        
        // Check if there are any pending payments
        const { data: pendingPayments } = await supabase
          .from('mensalidades')
          .select('id')
          .eq('crianca_id', mensalidade.crianca_id)
          .in('status', ['a_vencer', 'atrasado']);
            
        if (!pendingPayments || pendingPayments.length === 0) {
          await supabase
            .from('criancas')
            .update({ status_financeiro: 'ativo' })
            .eq('id', mensalidade.crianca_id);
        }
      }
    }

    return new Response(
      JSON.stringify({ data: { isPaid, asaasStatus: paymentData.status } }),
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
