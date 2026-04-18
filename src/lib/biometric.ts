import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { supabase } from '@/integrations/supabase/client';

const PASSKEY_FLAG_PREFIX = 'has_passkey:';
const EDGE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const invokeEdgeFunction = async <T>(
  functionName: string,
  body: Record<string, unknown>,
  requireSession = false,
): Promise<{ data?: T; error?: string; status: number }> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_PUBLISHABLE_KEY,
  };

  if (requireSession) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      return { error: 'Sessão expirada. Faça login novamente.', status: 401 };
    }

    headers.Authorization = `Bearer ${accessToken}`;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  let response: Response;

  try {
    response = await fetch(`${EDGE_FUNCTIONS_URL}/${functionName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (error: any) {
    window.clearTimeout(timeoutId);
    if (error?.name === 'AbortError') {
      return { error: 'A biometria demorou mais do que o esperado. Tente novamente.', status: 408 };
    }

    return {
      error: 'Não foi possível conectar ao serviço de biometria. Tente novamente em instantes.',
      status: 0,
    };
  }

  window.clearTimeout(timeoutId);

  let payload: any = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      error: payload?.error || payload?.message || 'Não foi possível concluir a biometria.',
      status: response.status,
    };
  }

  return { data: payload as T, status: response.status };
};

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
    const { data: optionsRes, error: optionsError } = await invokeEdgeFunction<{ options?: any }>(
      'passkey-register-options',
      { deviceLabel },
      true,
    );

    if (optionsError || !optionsRes?.options) {
      return { success: false, error: optionsError || 'Falha ao iniciar registro da biometria.' };
    }

    const attResp = await startRegistration({ optionsJSON: optionsRes.options });

    const { data: verifyRes, error: verifyError } = await invokeEdgeFunction<{ verified?: boolean }>(
      'passkey-register-verify',
      { response: attResp, deviceLabel, expectedChallenge: optionsRes.options.challenge },
      true,
    );

    if (verifyError || !verifyRes?.verified) {
      return { success: false, error: verifyError || 'Não foi possível concluir a ativação da biometria.' };
    }

    return { success: true };
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') {
      return { success: false, error: 'A ativação da biometria foi cancelada ou não concluída no dispositivo.' };
    }
    return { success: false, error: e?.message || 'Erro inesperado' };
  }
};

export const loginWithPasskey = async (email: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: optionsRes, error: optionsError, status: optionsStatus } = await invokeEdgeFunction<{ options?: any }>(
      'passkey-login-options',
      { email },
    );

    if (optionsError || !optionsRes?.options) {
      if (optionsStatus === 404) {
        setLocalPasskeyFlag(email, false);
      }
      return { success: false, error: optionsError || 'Falha ao iniciar login com biometria.' };
    }

    const authResp = await startAuthentication({ optionsJSON: optionsRes.options });

    const { data: verifyRes, error: verifyError, status: verifyStatus } = await invokeEdgeFunction<{
      session?: { access_token: string; refresh_token: string };
    }>('passkey-login-verify', {
      email,
      response: authResp,
      expectedChallenge: optionsRes.options.challenge,
    });

    if (verifyError || !verifyRes?.session) {
      if (verifyStatus === 404) {
        setLocalPasskeyFlag(email, false);
      }
      return { success: false, error: verifyError || 'Falha na validação da biometria.' };
    }

    // Set session locally
    const { access_token, refresh_token } = verifyRes.session;
    const { error: sessErr } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessErr) return { success: false, error: sessErr.message };
    return { success: true };
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') {
      return { success: false, error: 'A autenticação biométrica foi cancelada ou não concluída.' };
    }
    return { success: false, error: e?.message || 'Erro inesperado' };
  }
};
