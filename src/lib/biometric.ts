import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { supabase } from '@/integrations/supabase/client';

const PASSKEY_FLAG_PREFIX = 'has_passkey:';

export const isBiometricSupported = (): boolean => {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
};

export const hasLocalPasskey = (email: string): boolean => {
  if (!email) return false;
  return localStorage.getItem(PASSKEY_FLAG_PREFIX + email.toLowerCase()) === '1';
};

export const setLocalPasskeyFlag = (email: string, value: boolean) => {
  const key = PASSKEY_FLAG_PREFIX + email.toLowerCase();
  if (value) localStorage.setItem(key, '1');
  else localStorage.removeItem(key);
};

export const registerPasskey = async (deviceLabel?: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: optionsRes, error: optErr } = await supabase.functions.invoke('passkey-register-options', {
      body: { deviceLabel },
    });
    if (optErr || !optionsRes?.options) {
      return { success: false, error: optErr?.message || optionsRes?.error || 'Falha ao iniciar registro' };
    }
    const attResp = await startRegistration({ optionsJSON: optionsRes.options });
    const { data: verifyRes, error: verErr } = await supabase.functions.invoke('passkey-register-verify', {
      body: { response: attResp, deviceLabel, expectedChallenge: optionsRes.options.challenge },
    });
    if (verErr || !verifyRes?.verified) {
      return { success: false, error: verErr?.message || verifyRes?.error || 'Verificação falhou' };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro inesperado' };
  }
};

export const loginWithPasskey = async (email: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: optionsRes, error: optErr } = await supabase.functions.invoke('passkey-login-options', {
      body: { email },
    });
    if (optErr || !optionsRes?.options) {
      return { success: false, error: optErr?.message || optionsRes?.error || 'Falha ao iniciar login' };
    }
    const authResp = await startAuthentication({ optionsJSON: optionsRes.options });
    const { data: verifyRes, error: verErr } = await supabase.functions.invoke('passkey-login-verify', {
      body: { email, response: authResp, expectedChallenge: optionsRes.options.challenge },
    });
    if (verErr || !verifyRes?.session) {
      return { success: false, error: verErr?.message || verifyRes?.error || 'Verificação falhou' };
    }
    // Set session locally
    const { access_token, refresh_token } = verifyRes.session;
    const { error: sessErr } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessErr) return { success: false, error: sessErr.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro inesperado' };
  }
};
