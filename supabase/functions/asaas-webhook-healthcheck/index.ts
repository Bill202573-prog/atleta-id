import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

interface SchoolResult {
  escolinha_id: string;
  escolinha_nome: string;
  webhook_id: string | null;
  was_interrupted: boolean;
  was_disabled: boolean;
  reactivated: boolean;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const expectedWebhookUrl = `${SUPABASE_URL}/functions/v1/asaas-webhook`;
    const webhookToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN') || 'atleta-id-webhook-2024';

    // Fetch all schools with active Asaas subaccounts
    const { data: cadastros, error: cadErr } = await supabase
      .from('escola_cadastro_bancario')
      .select('escolinha_id, asaas_api_key, asaas_status, escolinhas(nome)')
      .not('asaas_api_key', 'is', null);

    if (cadErr) {
      return new Response(JSON.stringify({ error: cadErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: SchoolResult[] = [];
    let reactivatedCount = 0;
    let healthyCount = 0;
    let errorCount = 0;

    for (const c of cadastros || []) {
      const escolinhaNome = (c as any).escolinhas?.nome || 'Desconhecida';
      const result: SchoolResult = {
        escolinha_id: c.escolinha_id,
        escolinha_nome: escolinhaNome,
        webhook_id: null,
        was_interrupted: false,
        was_disabled: false,
        reactivated: false,
      };

      try {
        const listRes = await fetch(`${ASAAS_API_URL}/webhooks`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'access_token': c.asaas_api_key },
        });

        if (!listRes.ok) {
          result.error = `GET /webhooks ${listRes.status}`;
          errorCount++;
          results.push(result);
          continue;
        }

        const listData = await listRes.json();
        const webhook = (listData.data || []).find((w: any) =>
          w.url === expectedWebhookUrl || (w.url && w.url.includes('asaas-webhook'))
        );

        if (!webhook) {
          result.error = 'webhook não encontrado';
          errorCount++;
          results.push(result);
          continue;
        }

        result.webhook_id = webhook.id;
        result.was_interrupted = !!webhook.interrupted;
        result.was_disabled = webhook.enabled === false;

        if (webhook.interrupted || webhook.enabled === false) {
          const upRes = await fetch(`${ASAAS_API_URL}/webhooks/${webhook.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'access_token': c.asaas_api_key },
            body: JSON.stringify({
              url: expectedWebhookUrl,
              enabled: true,
              interrupted: false,
              authToken: webhookToken,
              apiVersion: 3,
            }),
          });

          if (upRes.ok) {
            result.reactivated = true;
            reactivatedCount++;
            console.log(`REACTIVATED webhook for escola ${escolinhaNome} (${c.escolinha_id}) - interrupted=${result.was_interrupted} disabled=${result.was_disabled}`);
          } else {
            result.error = `PUT /webhooks ${upRes.status}`;
            errorCount++;
          }
        } else {
          healthyCount++;
        }

        results.push(result);
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
        errorCount++;
        results.push(result);
      }

      // Rate limit: 1 req/s per school
      await new Promise(r => setTimeout(r, 1000));
    }

    const summary = {
      total: results.length,
      healthy: healthyCount,
      reactivated: reactivatedCount,
      errors: errorCount,
    };

    console.log('Webhook healthcheck:', JSON.stringify(summary));

    return new Response(JSON.stringify({ success: true, summary, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'erro' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
