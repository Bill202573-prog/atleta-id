import { verifyRegistrationResponse } from 'https://esm.sh/@simplewebauthn/server@10.0.1';
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

const b64 = (buf: Uint8Array | ArrayBuffer): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

    const { response, expectedChallenge, deviceLabel } = await req.json();
    if (!response || !expectedChallenge) {
      return new Response(JSON.stringify({ error: 'Dados incompletos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpId(req),
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return new Response(JSON.stringify({ error: 'Verificação falhou' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const registrationInfo = verification.registrationInfo as any;
    const credentialId: string = registrationInfo.credential?.id ?? registrationInfo.credentialID;
    const publicKey: string = b64(registrationInfo.credential?.publicKey ?? registrationInfo.credentialPublicKey);
    const counter: number = registrationInfo.credential?.counter ?? registrationInfo.counter ?? 0;
    const transports: string[] | undefined = response.response?.transports;

    if (!credentialId || !publicKey) {
      return new Response(JSON.stringify({ error: 'Credencial inválida para ativação da biometria' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { error: insErr } = await admin.from('user_passkeys').insert({
      user_id: user.id,
      credential_id: credentialId,
      public_key: publicKey,
      counter,
      device_label: deviceLabel || null,
      transports: transports || null,
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ verified: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('passkey-register-verify error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
