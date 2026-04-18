import { generateAuthenticationOptions } from 'https://esm.sh/@simplewebauthn/server@10.0.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const getRpId = (req: Request): string => {
  const origin = req.headers.get('origin') || '';
  try { return new URL(origin).hostname; } catch { return 'atletaid.com.br'; }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { email } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: 'Email obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const normalizedEmail = email.trim().toLowerCase();
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('user_id, email')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (profileError || !profile?.user_id) {
      return new Response(JSON.stringify({ error: 'Nenhum dispositivo registrado para este e-mail.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: passkeys } = await admin.from('user_passkeys').select('credential_id, transports').eq('user_id', profile.user_id);
    if (!passkeys || passkeys.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma biometria cadastrada para este usuário.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const options = await generateAuthenticationOptions({
      rpID: getRpId(req),
      allowCredentials: passkeys.map((p: any) => ({ id: p.credential_id, transports: p.transports })),
      userVerification: 'preferred',
    });

    return new Response(JSON.stringify({ options }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('passkey-login-options error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
