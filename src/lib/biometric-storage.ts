/**
 * Cofre local da biometria.
 * - Mantém access_token + refresh_token criptografados no IndexedDB (AES-GCM)
 * - Mantém metadados (expires_at, updatedAt) para diagnóstico e decisão de refresh
 * - Não depende de nenhuma sessão Supabase ativa para existir
 */
import type { Session } from '@supabase/supabase-js';

const DB_NAME = 'atletaid-biometric';
const STORE_NAME = 'vaults';
const BIOMETRY_FLAG_PREFIX = 'biometry_enabled:';
const CREDENTIAL_PREFIX = 'biometric_credential:';
const LAST_EMAIL_KEY = 'last_login_email';

interface StoredBiometricVault {
  email: string;
  ciphertext: ArrayBuffer;          // refresh_token criptografado
  iv: ArrayBuffer;                  // iv do refresh_token
  accessCiphertext?: ArrayBuffer;   // access_token criptografado
  accessIv?: ArrayBuffer;           // iv do access_token
  expiresAt?: number;               // timestamp (ms) de expiração do access_token
  key: CryptoKey;
  createdAt: number;
  updatedAt: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const enabledKey = (email: string) => `${BIOMETRY_FLAG_PREFIX}${normalizeEmail(email)}`;
const credentialKey = (email: string) => `${CREDENTIAL_PREFIX}${normalizeEmail(email)}`;

const requestToPromise = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Falha ao acessar o armazenamento biométrico.'));
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao concluir o armazenamento biométrico.'));
  transaction.onabort = () => reject(transaction.error ?? new Error('Armazenamento biométrico abortado.'));
});

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);

  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'email' });
    }
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o armazenamento biométrico.'));
});

const getVaultRecord = async (email: string): Promise<StoredBiometricVault | null> => {
  const normalizedEmail = normalizeEmail(email);
  const db = await openDb();

  try {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const record = await requestToPromise(store.get(normalizedEmail) as IDBRequest<StoredBiometricVault | undefined>);
    await transactionDone(transaction);
    return record ?? null;
  } finally {
    db.close();
  }
};

const putVaultRecord = async (record: StoredBiometricVault) => {
  const db = await openDb();

  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
};

const deleteVaultRecord = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  const db = await openDb();

  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(normalizedEmail);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
};

const generateVaultKey = async () => crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt'],
);

const encryptString = async (plain: string, key: CryptoKey) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plain));
  return { iv: iv.slice().buffer, ciphertext };
};

const decryptString = async (key: CryptoKey, iv: ArrayBuffer, ciphertext: ArrayBuffer) => {
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, ciphertext);
  return decoder.decode(decrypted);
};

// ---------------- Public API ----------------

export const isBiometricEnabledLocally = (email: string): boolean => {
  if (typeof window === 'undefined' || !email) return false;
  return localStorage.getItem(enabledKey(email)) === '1';
};

export const getStoredCredentialId = (email: string): string | null => {
  if (typeof window === 'undefined' || !email) return null;
  return localStorage.getItem(credentialKey(email));
};

export const hasStoredBiometricSetup = (email: string): boolean => {
  if (!email) return false;
  return isBiometricEnabledLocally(email) && !!getStoredCredentialId(email);
};

export const hasBiometricVault = async (email: string): Promise<boolean> => {
  if (!email) return false;
  const record = await getVaultRecord(email);
  return !!record;
};

export const setLastBiometricEmail = (email: string) => {
  if (typeof window === 'undefined' || !email) return;
  localStorage.setItem(LAST_EMAIL_KEY, normalizeEmail(email));
};

export const getLastBiometricEmail = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LAST_EMAIL_KEY) || '';
};

/**
 * Cria/atualiza o cofre com a sessão atual no momento da ATIVAÇÃO.
 * Reutiliza a key existente se já houver cofre.
 */
export const enableBiometricPersistence = async (
  email: string,
  credentialId: string,
  refreshToken: string,
  accessToken?: string | null,
  expiresAt?: number | null,
) => {
  const normalizedEmail = normalizeEmail(email);
  const existingRecord = await getVaultRecord(normalizedEmail);
  const key = existingRecord?.key ?? await generateVaultKey();

  const refresh = await encryptString(refreshToken, key);
  const access = accessToken ? await encryptString(accessToken, key) : null;

  await putVaultRecord({
    email: normalizedEmail,
    ciphertext: refresh.ciphertext,
    iv: refresh.iv,
    accessCiphertext: access?.ciphertext,
    accessIv: access?.iv,
    expiresAt: expiresAt ?? undefined,
    key,
    createdAt: existingRecord?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });

  localStorage.setItem(enabledKey(normalizedEmail), '1');
  localStorage.setItem(credentialKey(normalizedEmail), credentialId);
  setLastBiometricEmail(normalizedEmail);
};

/**
 * Atualiza apenas os tokens (e expires) do cofre existente, sem mexer em flag/credencial.
 * Usado para manter o cofre sempre com o último refresh_token rotacionado pelo Supabase.
 */
export const storeBiometricSessionTokens = async (
  email: string,
  session: Pick<Session, 'access_token' | 'refresh_token' | 'expires_at'>,
) => {
  const normalizedEmail = normalizeEmail(email);
  if (!hasStoredBiometricSetup(normalizedEmail)) return;
  if (!session?.refresh_token) return;

  const existingRecord = await getVaultRecord(normalizedEmail);
  if (!existingRecord) return;

  const key = existingRecord.key;
  const refresh = await encryptString(session.refresh_token, key);
  const access = session.access_token ? await encryptString(session.access_token, key) : null;

  await putVaultRecord({
    ...existingRecord,
    ciphertext: refresh.ciphertext,
    iv: refresh.iv,
    accessCiphertext: access?.ciphertext,
    accessIv: access?.iv,
    expiresAt: session.expires_at ? session.expires_at * 1000 : undefined,
    updatedAt: Date.now(),
  });
};

/** Compat: atualiza só o refresh_token (sem dados de access). */
export const updateStoredRefreshToken = async (email: string, refreshToken: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (!hasStoredBiometricSetup(normalizedEmail)) return;

  const existingRecord = await getVaultRecord(normalizedEmail);
  if (!existingRecord) return;

  const refresh = await encryptString(refreshToken, existingRecord.key);
  await putVaultRecord({
    ...existingRecord,
    ciphertext: refresh.ciphertext,
    iv: refresh.iv,
    updatedAt: Date.now(),
  });
};

export interface VaultTokens {
  refreshToken: string | null;
  accessToken: string | null;
  expiresAt: number | null;
  updatedAt: number | null;
}

export const getStoredTokens = async (email: string): Promise<VaultTokens> => {
  const record = await getVaultRecord(email);
  if (!record) return { refreshToken: null, accessToken: null, expiresAt: null, updatedAt: null };

  let refreshToken: string | null = null;
  let accessToken: string | null = null;

  try {
    refreshToken = await decryptString(record.key, record.iv, record.ciphertext);
  } catch {
    refreshToken = null;
  }

  if (record.accessCiphertext && record.accessIv) {
    try {
      accessToken = await decryptString(record.key, record.accessIv, record.accessCiphertext);
    } catch {
      accessToken = null;
    }
  }

  return {
    refreshToken,
    accessToken,
    expiresAt: record.expiresAt ?? null,
    updatedAt: record.updatedAt ?? null,
  };
};

/** Compat: lê apenas o refresh_token. */
export const getStoredRefreshToken = async (email: string): Promise<string | null> => {
  const tokens = await getStoredTokens(email);
  return tokens.refreshToken;
};

export const disableBiometricPersistence = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (typeof window === 'undefined' || !normalizedEmail) return;

  localStorage.removeItem(enabledKey(normalizedEmail));
  localStorage.removeItem(credentialKey(normalizedEmail));
  await deleteVaultRecord(normalizedEmail);
};

const maskToken = (token: string | null) => {
  if (!token) return null;
  if (token.length <= 8) return '***';
  return `${token.slice(0, 4)}…${token.slice(-4)} (len:${token.length})`;
};

export const getMaskedBiometricDiagnostics = async (email: string) => {
  const tokens = await getStoredTokens(email);
  return {
    email: normalizeEmail(email),
    enabled: isBiometricEnabledLocally(email),
    hasCredential: !!getStoredCredentialId(email),
    hasRefreshToken: !!tokens.refreshToken,
    hasAccessToken: !!tokens.accessToken,
    refreshTokenMasked: maskToken(tokens.refreshToken),
    accessTokenMasked: maskToken(tokens.accessToken),
    expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
    updatedAt: tokens.updatedAt ? new Date(tokens.updatedAt).toISOString() : null,
    accessTokenExpired: tokens.expiresAt ? Date.now() >= tokens.expiresAt - 30_000 : null,
  };
};

/** Compat com a versão anterior. */
export const getBiometricStorageDiagnostics = async (email: string) => {
  const tokens = await getStoredTokens(email);
  return {
    enabled: isBiometricEnabledLocally(email),
    hasCredential: !!getStoredCredentialId(email),
    hasRefreshToken: !!tokens.refreshToken,
  };
};
