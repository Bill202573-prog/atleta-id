const DB_NAME = 'atletaid-biometric';
const STORE_NAME = 'vaults';
const BIOMETRY_FLAG_PREFIX = 'biometry_enabled:';
const CREDENTIAL_PREFIX = 'biometric_credential:';
const LAST_EMAIL_KEY = 'last_login_email';

interface StoredBiometricVault {
  email: string;
  ciphertext: ArrayBuffer;
  iv: ArrayBuffer;
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

const encryptRefreshToken = async (refreshToken: string, currentKey?: CryptoKey) => {
  const key = currentKey ?? await generateVaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(refreshToken));
  return { key, iv: iv.slice().buffer, ciphertext };
};

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

export const setLastBiometricEmail = (email: string) => {
  if (typeof window === 'undefined' || !email) return;
  localStorage.setItem(LAST_EMAIL_KEY, normalizeEmail(email));
};

export const getLastBiometricEmail = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LAST_EMAIL_KEY) || '';
};

export const enableBiometricPersistence = async (email: string, credentialId: string, refreshToken: string) => {
  const normalizedEmail = normalizeEmail(email);
  const existingRecord = await getVaultRecord(normalizedEmail);
  const { key, iv, ciphertext } = await encryptRefreshToken(refreshToken, existingRecord?.key);

  await putVaultRecord({
    email: normalizedEmail,
    ciphertext,
    iv,
    key,
    createdAt: existingRecord?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });

  localStorage.setItem(enabledKey(normalizedEmail), '1');
  localStorage.setItem(credentialKey(normalizedEmail), credentialId);
  setLastBiometricEmail(normalizedEmail);
};

export const updateStoredRefreshToken = async (email: string, refreshToken: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (!hasStoredBiometricSetup(normalizedEmail)) return;

  const existingRecord = await getVaultRecord(normalizedEmail);
  if (!existingRecord) return;

  const { key, iv, ciphertext } = await encryptRefreshToken(refreshToken, existingRecord.key);
  await putVaultRecord({
    ...existingRecord,
    ciphertext,
    iv,
    key,
    updatedAt: Date.now(),
  });
};

export const getStoredRefreshToken = async (email: string): Promise<string | null> => {
  const normalizedEmail = normalizeEmail(email);
  const record = await getVaultRecord(normalizedEmail);
  if (!record) return null;

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
      record.key,
      record.ciphertext,
    );
    return decoder.decode(decrypted);
  } catch {
    return null;
  }
};

export const disableBiometricPersistence = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (typeof window === 'undefined' || !normalizedEmail) return;

  localStorage.removeItem(enabledKey(normalizedEmail));
  localStorage.removeItem(credentialKey(normalizedEmail));
  await deleteVaultRecord(normalizedEmail);
};

export const getBiometricStorageDiagnostics = async (email: string) => ({
  enabled: isBiometricEnabledLocally(email),
  hasCredential: !!getStoredCredentialId(email),
  hasRefreshToken: !!(await getStoredRefreshToken(email)),
});