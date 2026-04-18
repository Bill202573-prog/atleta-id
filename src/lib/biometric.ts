/**
 * Biometria como CAMADA ADICIONAL (cofre local)
 * --------------------------------------------------
 * - NÃO autentica no Supabase. NÃO depende de Edge Function. NÃO depende de domínio oficial.
 * - Após login com email/senha bem-sucedido, salvamos o `refresh_token` (e email) no localStorage.
 * - O usuário ativa a biometria → criamos uma credencial WebAuthn "platform" local (sem servidor)
 *   apenas como prova de presença/posse do dispositivo. O ID dela vira a "chave do cofre".
 * - Próximos acessos: o app pede a biometria local; se aprovada, restauramos a sessão chamando
 *   `supabase.auth.setSession({ access_token, refresh_token })` com o token guardado.
 * - Se algo falhar, o usuário simplesmente faz login normal por email/senha.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  disableBiometricPersistence,
  enableBiometricPersistence,
  getBiometricStorageDiagnostics,
  getStoredCredentialId,
  getStoredRefreshToken,
  hasStoredBiometricSetup,
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

// ----------------- Token persistence (chamado após login OK) -----------------

/**
 * Atualiza o refresh_token guardado quando uma sessão nova chega (refresh, login, etc.).
 * Chame isto a partir do AuthContext sempre que `onAuthStateChange` retornar um novo token.
 */
export const updateBiometricRefreshToken = async (email: string | null | undefined, refreshToken: string | null | undefined) => {
  if (!email || !refreshToken) return;
  if (!hasStoredBiometricSetup(email)) return;
  await updateStoredRefreshToken(email, refreshToken);
  log('refresh_token atualizado no cofre');
};

// ----------------- Activation -----------------

export const registerPasskey = async (deviceLabel?: string): Promise<{ success: boolean; error?: string }> => {
  const reason = getBiometricUnavailableReason();
  if (reason) return { success: false, error: reason };

  try {
    // 1) Garantir sessão atual + refresh_token (precisamos guardar isso no cofre)
    const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr || !sessionData.session?.refresh_token || !sessionData.session.user?.email) {
      return { success: false, error: 'Sessão não encontrada. Entre com email e senha primeiro.' };
    }
    const email = sessionData.session.user.email;
    const refreshToken = sessionData.session.refresh_token;

    // 2) Criar credencial WebAuthn "platform" LOCAL (não enviamos a ninguém).
    //    Serve apenas como cadeado: para abrir o cofre o usuário precisa apresentar a biometria.
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
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }, // RS256
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

    // 3) Gravar cofre local seguro
    await enableBiometricPersistence(email, credentialId, refreshToken);

    log('cofre criado para', email);
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

// ----------------- Login (desbloqueio do cofre) -----------------

export const loginWithPasskey = async (email: string): Promise<{ success: boolean; error?: string }> => {
  const reason = getBiometricUnavailableReason();
  if (reason) return { success: false, error: reason };

  if (!email) return { success: false, error: 'Informe o e-mail para entrar com biometria.' };

  if (!hasStoredBiometricSetup(email)) {
    return { success: false, error: 'Nenhuma biometria ativa para este e-mail neste dispositivo.' };
  }

  try {
    const diagnostics = await getBiometricStorageDiagnostics(email);
    const credentialId = getStoredCredentialId(email);
    log('diagnóstico antes da biometria', { email, ...diagnostics });

    if (!credentialId) {
      return { success: false, error: 'A biometria deste dispositivo precisa ser reconfigurada.' };
    }

    // 1) Pedir a biometria local. Se aprovada, o usuário "abriu o cadeado" do cofre.
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

    const refreshToken = await getStoredRefreshToken(email);
    log('resultado da leitura do token local', { email, hasRefreshToken: !!refreshToken });

    if (!refreshToken) {
      return {
        success: false,
        error: 'Faça login com email e senha uma vez para renovar o acesso biométrico neste dispositivo.',
      };
    }

    // 2) Restaurar a sessão Supabase usando o refresh_token salvo no cofre local.
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      log('refreshSession falhou', error);
      return {
        success: false,
        error: 'Não foi possível renovar sua sessão automaticamente. Faça login com email e senha uma vez neste dispositivo.',
      };
    }

    // 3) Atualizar cofre com o token novo (refresh emite um novo refresh_token).
    if (data.session.refresh_token && data.session.refresh_token !== refreshToken) {
      await updateStoredRefreshToken(email, data.session.refresh_token);
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
