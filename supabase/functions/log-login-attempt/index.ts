import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function classify(msg: string | null | undefined): string {
  const m = (msg || '').toLowerCase();
  if (!m) return 'desconhecido';
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'senha_incorreta';
  if (m.includes('email not confirmed')) return 'email_nao_confirmado';
  if (m.includes('user not found') || m.includes('no user')) return 'usuario_inexistente';
  if (m.includes('rate limit') || m.includes('too many')) return 'rate_limited';
  if (m.includes('disabled') || m.includes('banned')) return 'usuario_bloqueado';
  if (m.includes('network') || m.includes('fetch')) return 'erro_rede';
  if (m.includes('sem perfil') || m.includes('sem role') || m.includes('no role')) return 'sem_role';
  return 'outro';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email || '').toString().trim().toLowerCase();
    const success = !!body.success;
    const error_message = body.error_message || null;
    const failure_reason = body.failure_reason || (success ? null : classify(error_message));

    if (!email) {
      return new Response(JSON.stringify({ error: 'email obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolve user_id, role e escolinha_id via email
    let user_id: string | null = null;
    let user_role: string | null = null;
    let escolinha_id: string | null = null;

    const { data: userRow } = await admin
      .schema('auth' as any)
      .from('users')
      .select('id')
      .ilike('email', email)
      .maybeSingle();

    if (userRow?.id) {
      user_id = userRow.id;

      const { data: roleRow } = await admin
        .from('user_roles').select('role').eq('user_id', user_id).maybeSingle();
      user_role = roleRow?.role || null;

      // Escolinha por papel
      const { data: esc } = await admin
        .from('escolinhas')
        .select('id')
        .or(`admin_user_id.eq.${user_id},socio_user_id.eq.${user_id}`)
        .maybeSingle();
      if (esc?.id) escolinha_id = esc.id;

      if (!escolinha_id) {
        const { data: prof } = await admin
          .from('professores').select('escolinha_id').eq('user_id', user_id).maybeSingle();
        if (prof?.escolinha_id) escolinha_id = prof.escolinha_id;
      }

      if (!escolinha_id) {
        const { data: resp } = await admin
          .from('responsaveis').select('id').eq('user_id', user_id).maybeSingle();
        if (resp?.id) {
          const { data: link } = await admin
            .from('crianca_responsavel')
            .select('criancas!inner(crianca_escolinha!inner(escolinha_id, ativo))')
            .eq('responsavel_id', resp.id)
            .limit(1);
          const ce = (link?.[0] as any)?.criancas?.crianca_escolinha?.[0];
          if (ce?.escolinha_id) escolinha_id = ce.escolinha_id;
        }
      }
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const user_agent = req.headers.get('user-agent') || null;

    await admin.from('login_attempts').insert({
      email,
      user_id,
      user_role,
      escolinha_id,
      success,
      failure_reason: success ? null : failure_reason,
      error_message: success ? null : error_message,
      ip,
      user_agent,
    });

    return new Response(JSON.stringify({ ok: true, user_id, escolinha_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
