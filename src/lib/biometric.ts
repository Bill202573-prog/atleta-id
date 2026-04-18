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

const VAULT_PREFIX = 'biometric_vault:'; // biometric_vault:<email_lower>
const PASSKEY_FLAG_PREFIX = 'has_passkey:'; // legado — mantido para compat de UI
const LAST_EMAIL_KEY = 'last_login_email';

interface BiometricVault {
  email: string;
  refresh_token: string;
  credential_id: string; // base64url do rawId WebAuthn
  created_at: number;
}

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

const vaultKey = (email: string) => VAULT_PREFIX + email.trim().toLowerCase();

const readVault = (email: string): BiometricVault | null => {
  try {
    const raw = localStorage.getItem(vaultKey(email));
    if (!raw) return null;
    return JSON.parse(raw) as BiometricVault;
  } catch {
    return null;
  }
};

const writeVault = (vault: BiometricVault) => {
  localStorage.setItem(vaultKey(vault.email), JSON.stringify(vault));
  localStorage.setItem(PASSKEY_FLAG_PREFIX + vault.email.toLowerCase(), '1');
  localStorage.setItem(LAST_EMAIL_KEY, vault.email);
};

const clearVault = (email: string) => {
  localStorage.removeItem(vaultKey(email));
  localStorage.removeItem(PASSKEY_FLAG_PREFIX + email.toLowerCase());
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
  return null;
};

export const canUseBiometricOnCurrentDomain = (): boolean => getBiometricUnavailableReason() === null;

// ----------------- Compat helpers (UI) -----------------

export const hasLocalPasskey = (email: string): boolean => {
  if (!email) return false;
  return !!readVault(email);
};

export const setLocalPasskeyFlag = (email: string, value: boolean) => {
  if (!email) return;
  if (!value) clearVault(email);
};

// ----------------- Token persistence (chamado após login OK) -----------------

/**
 * Atualiza o refresh_token guardado quando uma sessão nova chega (refresh, login, etc.).
 * Chame isto a partir do AuthContext sempre que `onAuthStateChange` retornar um novo token.
 */
export const updateBiometricRefreshToken = (email: string | null | undefined, refreshToken: string | null | undefined) => {
  if (!email || !refreshToken) return;
  const vault = readVault(email);
  if (!vault) return; // só atualizamos se o usuário já ativou a biometria
  if (vault.refresh_token === refreshToken) return;
  writeVault({ ...vault, refresh_token: refreshToken });
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

    // 3) Gravar cofre local
    writeVault({
      email,
      refresh_token: refreshToken,
      credential_id: credentialId,
      created_at: Date.now(),
    });

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

  const vault = readVault(email);
  if (!vault) {
    return { success: false, error: 'Nenhuma biometria ativa para este e-mail neste dispositivo.' };
  }

  try {
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
          id: fromBase64Url(vault.credential_id),
          transports: ['internal', 'hybrid'],
        }],
      },
    }) as PublicKeyCredential | null;

    if (!assertion) return { success: false, error: 'Biometria não confirmada.' };

    // 2) Restaurar a sessão Supabase usando o refresh_token salvo.
    //    setSession aceita um refresh_token e dispara um refresh automático no cliente.
    const { data, error } = await supabase.auth.setSession({
      access_token: '',
      refresh_token: vault.refresh_token,
    });

    if (error || !data.session) {
      log('setSession falhou', error);
      // Se o refresh_token expirou/foi revogado, limpamos o cofre para evitar loop.
      clearVault(email);
      return {
        success: false,
        error: 'Sua sessão expirou. Entre uma vez com email e senha para reativar a biometria.',
      };
    }

    // 3) Atualizar cofre com o token novo (refresh emite um novo refresh_token).
    if (data.session.refresh_token && data.session.refresh_token !== vault.refresh_token) {
      writeVault({ ...vault, refresh_token: data.session.refresh_token });
    }
    localStorage.setItem(LAST_EMAIL_KEY, email);
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
