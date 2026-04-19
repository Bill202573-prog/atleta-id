/**
 * Biometria como CAMADA ADICIONAL (cofre local)
 * --------------------------------------------------
 * - NÃO autentica no Supabase. NÃO depende de Edge Function. NÃO depende de domínio oficial.
 * - Após login com email/senha bem-sucedido, salvamos `access_token` + `refresh_token` (e `expires_at`)
 *   criptografados no cofre local (IndexedDB / AES-GCM).
 * - O usuário ativa a biometria → criamos uma credencial WebAuthn "platform" local (sem servidor)
 *   apenas como prova de presença/posse do dispositivo. O ID dela vira a "chave do cofre".
 * - Próximos acessos:
 *     1) pedimos a biometria local
 *     2) se aprovada, lemos os tokens do cofre
 *     3) se o `access_token` ainda for válido, restauramos via `setSession`
 *     4) caso contrário, chamamos `refreshSession({ refresh_token })`
 *     5) regravamos imediatamente os tokens rotacionados no cofre
 * - Se algo falhar, o usuário simplesmente faz login normal por email/senha. NUNCA desativamos a
 *   biometria por uma falha pontual de refresh.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  disableBiometricPersistence,
  enableBiometricPersistence,
  getMaskedBiometricDiagnostics,
  getStoredCredentialId,
  getStoredTokens,
  hasStoredBiometricSetup,
  storeBiometricSessionTokens,
  updateStoredRefreshToken,
} from '@/lib/biometric-storage';

const log = (...args: unknown[]) => {
  try { console.log('[biometric]', ...args); } catch { /* noop */ }
};

const toBase64Url = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (str: string): ArrayBuffer => {
  const norm = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 ? norm + '='.repeat(4 - (norm.length % 4)) : norm;
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

// ----------------- Capabilities -----------------

export const isBiometricSupported = (): boolean => {
  try {
    return typeof window !== 'undefined'
      && typeof window.PublicKeyCredential !== 'undefined'
      && typeof navigator !== 'undefined'
      && !!navigator.credentials;
  } catch {
    return false;
  }
};

export const getBiometricUnavailableReason = (): string | null => {
  if (typeof window === 'undefined') return 'Ambiente sem suporte a biometria.';
  if (!isBiometricSupported()) return 'Seu dispositivo não suporta biometria.';
  if (!window.isSecureContext) return 'A biometria exige conexão segura (HTTPS).';
  if (typeof indexedDB === 'undefined' || !window.crypto?.subtle) {
    return 'Seu navegador não oferece armazenamento seguro local para a biometria.';
  }
  return null;
};

export const canUseBiometricOnCurrentDomain = (): boolean => getBiometricUnavailableReason() === null;

// ----------------- Compat helpers (UI) -----------------

export const hasLocalPasskey = (email: string): boolean => {
  if (!email) return false;
  return hasStoredBiometricSetup(email);
};

export const setLocalPasskeyFlag = async (email: string, value: boolean) => {
  if (!email) return;
  if (!value) await disableBiometricPersistence(email);
};

// ----------------- Token persistence (chamado pelo AuthContext) -----------------

/**
 * Atualiza os tokens guardados quando uma sessão nova chega.
 * Chame isto a partir do AuthContext em SIGNED_IN, TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED.
 */
export const syncBiometricSession = async (
  email: string | null | undefined,
  session: { access_token?: string | null; refresh_token?: string | null; expires_at?: number | null } | null | undefined,
) => {
  if (!email || !session?.refresh_token) return;
  if (!hasStoredBiometricSetup(email)) return;
  await storeBiometricSessionTokens(email, {
    access_token: session.access_token ?? '',
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? undefined,
  });
  log('cofre sincronizado com nova sessão');
};

/** Compat: mantém função antiga apontando para a nova. */
export const updateBiometricRefreshToken = async (
  email: string | null | undefined,
  refreshToken: string | null | undefined,
) => {
  if (!email || !refreshToken) return;
  if (!hasStoredBiometricSetup(email)) return;
  await updateStoredRefreshToken(email, refreshToken);
};

// ----------------- Activation -----------------

export const registerPasskey = async (deviceLabel?: string): Promise<{ success: boolean; error?: string }> => {
  const reason = getBiometricUnavailableReason();
  if (reason) return { success: false, error: reason };

  try {
    const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr || !sessionData.session?.refresh_token || !sessionData.session.user?.email) {
      return { success: false, error: 'Sessão não encontrada. Entre com email e senha primeiro.' };
    }
    const email = sessionData.session.user.email;
    const refreshToken = sessionData.session.refresh_token;
    const accessToken = sessionData.session.access_token;
    const expiresAt = sessionData.session.expires_at ? sessionData.session.expires_at * 1000 : null;

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Atleta ID', id: window.location.hostname },
        user: {
          id: userId,
          name: email,
          displayName: deviceLabel || email,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
          requireResidentKey: false,
        },
        timeout: 60_000,
        attestation: 'none',
      },
    }) as PublicKeyCredential | null;

    if (!cred) return { success: false, error: 'Não foi possível registrar a biometria.' };

    const credentialId = toBase64Url(cred.rawId);

    await enableBiometricPersistence(email, credentialId, refreshToken, accessToken, expiresAt);

    log('cofre criado para', email, '— diagnóstico:', await getMaskedBiometricDiagnostics(email));
    return { success: true };
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    log('registerPasskey error', err);
    if (err?.name === 'NotAllowedError') {
      return { success: false, error: 'A ativação da biometria foi cancelada no dispositivo.' };
    }
    if (err?.name === 'NotSupportedError') {
      return { success: false, error: 'Este dispositivo não tem biometria configurada.' };
    }
    if (err?.name === 'SecurityError') {
      return { success: false, error: 'Permissão de biometria negada pelo navegador (verifique HTTPS e domínio).' };
    }
    return { success: false, error: err?.message || 'Erro inesperado ao ativar biometria.' };
  }
};

// ----------------- Login (desbloqueio do cofre + restauração da sessão) -----------------

const ACCESS_TOKEN_SAFETY_MS = 30_000; // considera expirado 30s antes do limite real

const restoreSupabaseSession = async (email: string): Promise<{ success: boolean; error?: string }> => {
  const tokens = await getStoredTokens(email);

  if (!tokens.refreshToken) {
    log('cofre sem refresh_token disponível para', email);
    return {
      success: false,
      error: 'Faça login com email e senha uma vez para renovar o acesso biométrico neste dispositivo.',
    };
  }

  const accessUsable =
    !!tokens.accessToken &&
    !!tokens.expiresAt &&
    Date.now() < tokens.expiresAt - ACCESS_TOKEN_SAFETY_MS;

  // 1) Tenta usar o access_token direto, se ainda válido — evita gastar refresh_token desnecessariamente.
  if (accessUsable) {
    log('tentando setSession com access_token ainda válido', { email, expiresAt: new Date(tokens.expiresAt!).toISOString() });
    const { data, error } = await supabase.auth.setSession({
      access_token: tokens.accessToken!,
      refresh_token: tokens.refreshToken,
    });

    if (!error && data.session) {
      log('setSession OK; sincronizando cofre com sessão restaurada');
      await storeBiometricSessionTokens(email, {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      });
      return { success: true };
    }
    log('setSession falhou, tentando refreshSession', { errorName: error?.name, errorMsg: error?.message });
  }

  // 2) Fallback: usar refresh_token para renovar a sessão.
  log('tentando refreshSession com refresh_token do cofre', { email });
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: tokens.refreshToken });

  if (error || !data.session) {
    const errMsg = error?.message || 'erro desconhecido';
    log('refreshSession falhou', { errMsg, status: (error as { status?: number } | null)?.status });

    // Mensagens específicas para diagnóstico — NÃO desativamos a biometria.
    const lower = errMsg.toLowerCase();
    if (lower.includes('invalid_grant') || lower.includes('refresh token') || lower.includes('not found')) {
      return {
        success: false,
        error: 'Seu acesso salvo expirou ou foi revogado. Entre com email e senha uma vez para reativar a biometria.',
      };
    }
    if (lower.includes('network') || lower.includes('failed to fetch')) {
      return {
        success: false,
        error: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
      };
    }
    return {
      success: false,
      error: 'Não foi possível renovar sua sessão automaticamente. Entre com email e senha uma vez neste dispositivo.',
    };
  }

  // 3) Sucesso → regravar imediatamente os tokens rotacionados.
  log('refreshSession OK; rotacionando tokens no cofre');
  await storeBiometricSessionTokens(email, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
  return { success: true };
};

export const loginWithPasskey = async (email: string): Promise<{ success: boolean; error?: string }> => {
  const reason = getBiometricUnavailableReason();
  if (reason) return { success: false, error: reason };

  if (!email) return { success: false, error: 'Informe o e-mail para entrar com biometria.' };

  if (!hasStoredBiometricSetup(email)) {
    return { success: false, error: 'Nenhuma biometria ativa para este e-mail neste dispositivo.' };
  }

  try {
    const diagnostics = await getMaskedBiometricDiagnostics(email);
    const credentialId = getStoredCredentialId(email);
    log('diagnóstico antes do desbloqueio biométrico', diagnostics);

    if (!credentialId) {
      return { success: false, error: 'A biometria deste dispositivo precisa ser reconfigurada.' };
    }

    // 1) Pedir a biometria local. Se aprovada, "abrimos o cadeado" do cofre.
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60_000,
        rpId: window.location.hostname,
        userVerification: 'required',
        allowCredentials: [{
          type: 'public-key',
          id: fromBase64Url(credentialId),
          transports: ['internal', 'hybrid'],
        }],
      },
    }) as PublicKeyCredential | null;

    if (!assertion) return { success: false, error: 'Biometria não confirmada.' };

    // 2) Restaurar sessão Supabase a partir dos tokens do cofre (sem desativar biometria em caso de falha).
    const restoreResult = await restoreSupabaseSession(email);
    if (!restoreResult.success) {
      return restoreResult;
    }

    localStorage.setItem('last_login_email', email);
    log('login por biometria OK');
    return { success: true };
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    log('loginWithPasskey error', err);
    if (err?.name === 'NotAllowedError') {
      return { success: false, error: 'A autenticação biométrica foi cancelada.' };
    }
    if (err?.name === 'InvalidStateError') {
      return { success: false, error: 'Biometria não reconhecida neste dispositivo.' };
    }
    return { success: false, error: err?.message || 'Erro inesperado na biometria.' };
  }
};
