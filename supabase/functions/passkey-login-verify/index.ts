import { verifyAuthenticationResponse } from 'https://esm.sh/@simplewebauthn/server@10.0.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const getRpId = (req: Request): string => {
  const origin = req.headers.get('origin') || '';
  try { return new URL(origin).hostname; } catch { return 'atletaid.com.br'; }
};
const getOrigin = (req: Request): string => req.headers.get('origin') || 'https://atletaid.com.br';

const b64ToBytes = (b64: string): Uint8Array => {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 ? norm + '='.repeat(4 - (norm.length % 4)) : norm;
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { email, response, expectedChallenge } = await req.json();
    if (!email || !response || !expectedChallenge) {
      return new Response(JSON.stringify({ error: 'Dados incompletos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userList } = await admin.auth.admin.listUsers();
    const user = userList?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) return new Response(JSON.stringify({ error: 'Usuário não encontrado' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const credentialId = response.id;
    const { data: pk } = await admin.from('user_passkeys').select('*').eq('user_id', user.id).eq('credential_id', credentialId).maybeSingle();
    if (!pk) return new Response(JSON.stringify({ error: 'Credencial não encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpId(req),
      credential: {
        id: pk.credential_id,
        publicKey: b64ToBytes(pk.public_key),
        counter: Number(pk.counter),
        transports: pk.transports || undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return new Response(JSON.stringify({ error: 'Biometria não verificada' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Atualiza counter / last_used_at
    await admin.from('user_passkeys').update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    }).eq('id', pk.id);

    // Gera magic link e troca por sessão
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email!,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return new Response(JSON.stringify({ error: 'Falha ao gerar sessão' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
      type: 'magiclink',
      token_hash: linkData.properties.hashed_token,
    });
    if (verifyErr || !verifyData?.session) {
      return new Response(JSON.stringify({ error: 'Falha ao criar sessão' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      session: {
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('passkey-login-verify error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
