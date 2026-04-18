import { generateRegistrationOptions } from 'https://esm.sh/@simplewebauthn/server@10.0.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RP_NAME = 'Atleta ID';

const getRpId = (req: Request): string => {
  const origin = req.headers.get('origin') || '';
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch {
    return 'atletaid.com.br';
  }
};

const isEligibleSchool = (nome?: string | null) => {
  if (!nome) return false;
  const n = nome.toLowerCase();
  return n.includes('fluminense') || n.includes('flamengo');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Sessão inválida' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(supabaseUrl, serviceKey);

    // Verifica se o usuário pertence a escola elegível (Fluminense/Flamengo)
    let eligible = false;
    // 1) Admin de escola
    const { data: escolasAdmin } = await admin.from('escolinhas').select('nome').eq('admin_user_id', user.id);
    if (escolasAdmin?.some((e) => isEligibleSchool(e.nome))) eligible = true;
    // 2) Sócio de escola
    if (!eligible) {
      const { data: escolasSocio } = await admin.from('escolinhas').select('nome').eq('socio_user_id', user.id);
      if (escolasSocio?.some((e) => isEligibleSchool(e.nome))) eligible = true;
    }
    // 3) Professor
    if (!eligible) {
      const { data: profs } = await admin.from('professores').select('escolinha_id, escolinhas(nome)').eq('user_id', user.id);
      if (profs?.some((p: any) => isEligibleSchool(p.escolinhas?.nome))) eligible = true;
    }
    // 4) Responsável
    if (!eligible) {
      const { data: resps } = await admin.from('responsaveis').select('id').eq('user_id', user.id).maybeSingle();
      if (resps?.id) {
        const { data: vinc } = await admin
          .from('crianca_responsavel')
          .select('crianca_id, criancas!inner(crianca_escolinha!inner(escolinhas!inner(nome)))')
          .eq('responsavel_id', resps.id);
        if (vinc?.some((v: any) =>
          v.criancas?.crianca_escolinha?.some((ce: any) => isEligibleSchool(ce.escolinhas?.nome))
        )) eligible = true;
      }
    }

    if (!eligible) {
      return new Response(JSON.stringify({ error: 'Login biométrico ainda não disponível para sua escola.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: existing } = await admin.from('user_passkeys').select('credential_id, transports').eq('user_id', user.id);

    const rpID = getRpId(req);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: user.email || user.id,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: (existing || []).map((c: any) => ({ id: c.credential_id, transports: c.transports })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });

    return new Response(JSON.stringify({ options }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('passkey-register-options error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
