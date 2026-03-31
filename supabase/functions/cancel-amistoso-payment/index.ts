import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CancelPaymentRequest {
  convocacao_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const masterApiKey = Deno.env.get('ASAAS_API_KEY');
    if (!masterApiKey) {
      throw new Error('ASAAS_API_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { convocacao_id }: CancelPaymentRequest = await req.json();

    if (!convocacao_id) {
      return new Response(
        JSON.stringify({ error: 'convocacao_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Cancelling participation for convocacao: ${convocacao_id}`);

    // Get the convocacao with evento -> escolinha for proper API key
    const { data: convocacao, error: fetchError } = await supabase
      .from('amistoso_convocacoes')
      .select(`
        id, asaas_payment_id, status, evento_id,
        evento:eventos_esportivos!amistoso_convocacoes_evento_id_fkey(
          escolinha_id
        )
      `)
      .eq('id', convocacao_id)
      .single();

    if (fetchError || !convocacao) {
      console.error('Convocacao not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Convocação não encontrada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // If there's an Asaas payment, cancel it using the correct API key
    if (convocacao.asaas_payment_id) {
      const eventoData = convocacao.evento as any;
      const escolinhaId = eventoData?.escolinha_id;

      // Get school's API key
      let apiKeyToUse = masterApiKey;
      if (escolinhaId) {
        const { data: cadastro } = await supabase
          .from('escola_cadastro_bancario')
          .select('asaas_api_key')
          .eq('escolinha_id', escolinhaId)
          .single();

        if (cadastro?.asaas_api_key) {
          apiKeyToUse = cadastro.asaas_api_key;
          console.log("Using school's API key for cancellation");
        }
      }

      console.log(`Cancelling Asaas payment: ${convocacao.asaas_payment_id}`);
      
      try {
        // Try with school's key first
        let asaasResponse = await fetch(
          `https://api.asaas.com/v3/payments/${convocacao.asaas_payment_id}`,
          {
            method: 'DELETE',
            headers: { 'accept': 'application/json', 'access_token': apiKeyToUse },
          }
        );

        // If school key fails, try master key (payment might have been created on master)
        if (!asaasResponse.ok && apiKeyToUse !== masterApiKey) {
          console.log('School key failed, trying master key for cancellation');
          asaasResponse = await fetch(
            `https://api.asaas.com/v3/payments/${convocacao.asaas_payment_id}`,
            {
              method: 'DELETE',
              headers: { 'accept': 'application/json', 'access_token': masterApiKey },
            }
          );
        }

        if (!asaasResponse.ok) {
          const errorText = await asaasResponse.text();
          console.warn(`Asaas cancellation warning (continuing anyway): ${errorText}`);
        } else {
          console.log('Asaas payment cancelled successfully');
        }
      } catch (asaasError) {
        console.warn('Error calling Asaas API (continuing anyway):', asaasError);
      }
    }

    // Update the convocacao status to 'recusado'
    const { error: updateError } = await supabase
      .from('amistoso_convocacoes')
      .update({
        status: 'recusado',
        pix_br_code: null,
        pix_qr_code_url: null,
        pix_expires_at: null,
        asaas_payment_id: null,
      })
      .eq('id', convocacao_id);

    if (updateError) {
      console.error('Error updating convocacao:', updateError);
      throw new Error('Erro ao atualizar convocação');
    }

    console.log('Convocacao cancelled successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Participação cancelada com sucesso' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in cancel-amistoso-payment:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro ao cancelar participação' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
