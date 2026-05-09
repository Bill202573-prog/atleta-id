import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROJECT_REF = 'vxzktyklzkfqitptzctk';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Validate caller is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Supabase Management API token from secrets (use service role to query analytics)
    const sbToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const sql = `
      select 
        timestamp,
        metadata.path as path,
        metadata.status as status,
        metadata.msg as msg,
        metadata.error as error
      from auth_logs
      cross join unnest(metadata) as metadata
      where metadata.status::int >= 400
        and metadata.path in ('/token', '/otp', '/recover', '/user', '/verify')
      order by timestamp desc
      limit 200
    `;

    const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs.all?sql=${encodeURIComponent(sql)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${sbToken}` },
    });

    if (!res.ok) {
      // Fallback: return empty list with note
      return new Response(JSON.stringify({
        failures: [],
        note: 'Logs de auth não disponíveis via Management API (token não configurado). Use o painel Supabase > Auth > Logs.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const json = await res.json();
    return new Response(JSON.stringify({ failures: json.result || json.data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('admin-auth-failures error', e);
    return new Response(JSON.stringify({ error: (e as Error).message, failures: [] }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
