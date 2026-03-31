import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Batch cancel unpaid amistoso payments on wrong Asaas account and reset convocações
// so parents can regenerate PIX on the correct school account
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const masterApiKey = Deno.env.get('ASAAS_API_KEY')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { escolinha_id, dry_run } = await req.json();

    if (!escolinha_id) {
      return new Response(
        JSON.stringify({ error: 'escolinha_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Batch cancel/reset for escolinha: ${escolinha_id}, dry_run: ${dry_run}`);

    // Find all unpaid convocações with asaas_payment_id for this school's events
    const { data: eventos } = await supabase
      .from('eventos_esportivos')
      .select('id')
      .eq('escolinha_id', escolinha_id);

    if (!eventos || eventos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No events found', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventoIds = eventos.map(e => e.id);

    const { data: convocacoes, error } = await supabase
      .from('amistoso_convocacoes')
      .select('id, asaas_payment_id, valor, status, crianca_id')
      .in('evento_id', eventoIds)
      .not('asaas_payment_id', 'is', null)
      .in('status', ['aguardando_pagamento', 'pendente']);

    if (error) throw error;

    console.log(`Found ${convocacoes?.length || 0} unpaid convocações to reset`);

    if (dry_run) {
      return new Response(
        JSON.stringify({ 
          success: true, dry_run: true,
          count: convocacoes?.length || 0,
          convocacoes: convocacoes?.map(c => ({
            id: c.id, asaas_payment_id: c.asaas_payment_id, valor: c.valor, status: c.status,
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: any[] = [];

    for (const conv of (convocacoes || [])) {
      const result: any = { id: conv.id, asaas_payment_id: conv.asaas_payment_id };

      // Cancel on Asaas master account
      if (conv.asaas_payment_id) {
        try {
          const cancelRes = await fetch(
            `https://api.asaas.com/v3/payments/${conv.asaas_payment_id}`,
            {
              method: 'DELETE',
              headers: { 'accept': 'application/json', 'access_token': masterApiKey },
            }
          );
          result.asaas_cancelled = cancelRes.ok;
          if (!cancelRes.ok) {
            result.asaas_error = await cancelRes.text();
          }
        } catch (e: any) {
          result.asaas_cancelled = false;
          result.asaas_error = e.message;
        }
      }

      // Reset convocação to pendente (keep valor and isento)
      const { error: updateError } = await supabase
        .from('amistoso_convocacoes')
        .update({
          asaas_payment_id: null,
          pix_br_code: null,
          pix_qr_code_url: null,
          pix_expires_at: null,
          status: 'pendente',
        })
        .eq('id', conv.id);

      result.db_reset = !updateError;
      if (updateError) result.db_error = updateError.message;

      results.push(result);
    }

    console.log(`Processed ${results.length} convocações`);

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
