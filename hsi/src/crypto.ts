const ENC_ALGO = 'AES-GCM';
const KEK_LENGTH = 256;
const PBKDF2_ITERATIONS = 600000;

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ENC_ALGO, length: KEK_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

async function generateAESKey(extractable = true): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ENC_ALGO, length: KEK_LENGTH }, extractable, ['encrypt', 'decrypt']);
}

async function encryptWithKey(key: CryptoKey, data: ArrayBuffer): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: ENC_ALGO, iv }, key, data);
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv.buffer as ArrayBuffer) };
}

async function decryptWithKey(key: CryptoKey, ciphertext: string, iv: string): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: ENC_ALGO, iv: fromBase64(iv) }, key, fromBase64(ciphertext));
}

// --- RSA Key Pair (for sharing encrypted DEKs) ---

async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt']
  ) as Promise<CryptoKeyPair>;
}

// --- Setup: generate KEK + RSA pair, encrypt with password ---

export interface CryptoKeyBundle {
  encryptedKek: string;
  kekIv: string;
  kekSalt: string;
  kekIterations: number;
  publicKeyJwk: JsonWebKey;
  encryptedPrivateKey: string;
  privateKeyIv: string;
}

export async function setupEncryption(password: string): Promise<CryptoKeyBundle> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const passwordKey = await deriveKeyFromPassword(password, salt);

  const kek = await generateAESKey(true);
  const rawKek = await crypto.subtle.exportKey('raw', kek);
  const { ciphertext: encryptedKek, iv: kekIv } = await encryptWithKey(passwordKey, rawKek);

  const rsaPair = await generateRSAKeyPair();
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', rsaPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', rsaPair.privateKey);
  const enc = new TextEncoder();
  const { ciphertext: encryptedPrivateKey, iv: privateKeyIv } = await encryptWithKey(kek, enc.encode(JSON.stringify(privateKeyJwk)).buffer as ArrayBuffer);

  return {
    encryptedKek,
    kekIv,
    kekSalt: toBase64(salt.buffer as ArrayBuffer),
    kekIterations: PBKDF2_ITERATIONS,
    publicKeyJwk,
    encryptedPrivateKey,
    privateKeyIv,
  };
}

// --- Unlock KEK with password ---

export async function unlockKEK(password: string, encryptedKek: string, kekIv: string, kekSalt: string): Promise<CryptoKey> {
  const salt = new Uint8Array(fromBase64(kekSalt));
  const passwordKey = await deriveKeyFromPassword(password, salt);
  const rawKek = await decryptWithKey(passwordKey, encryptedKek, kekIv);
  return crypto.subtle.importKey('raw', rawKek, { name: ENC_ALGO, length: KEK_LENGTH }, false, ['encrypt', 'decrypt']);
}

// --- Session caching ---

const SESSION_KEY = 'hsi_kek_cache';

export function cacheKEK(kek: CryptoKey): void {
  crypto.subtle.exportKey('raw', kek).then(raw => {
    sessionStorage.setItem(SESSION_KEY, toBase64(raw));
  });
}

export async function getCachedKEK(): Promise<CryptoKey | null> {
  const cached = sessionStorage.getItem(SESSION_KEY);
  if (!cached) return null;
  try {
    return crypto.subtle.importKey('raw', fromBase64(cached), { name: ENC_ALGO, length: KEK_LENGTH }, true, ['encrypt', 'decrypt']);
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearCachedKEK(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

// --- Encrypt/Decrypt vault content ---

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  encryptedDek: string;
  dekIv: string;
}

export async function encryptContent(content: string, kek: CryptoKey): Promise<EncryptedPayload> {
  const dek = await generateAESKey(true);
  const enc = new TextEncoder();
  const { ciphertext, iv } = await encryptWithKey(dek, enc.encode(content).buffer as ArrayBuffer);

  const rawDek = await crypto.subtle.exportKey('raw', dek);
  const { ciphertext: encryptedDek, iv: dekIv } = await encryptWithKey(kek, rawDek);

  return { ciphertext, iv, encryptedDek, dekIv };
}

export async function decryptContent(payload: EncryptedPayload, kek: CryptoKey): Promise<string> {
  const rawDek = await decryptWithKey(kek, payload.encryptedDek, payload.dekIv);
  const dek = await crypto.subtle.importKey('raw', rawDek, { name: ENC_ALGO, length: KEK_LENGTH }, false, ['decrypt']);
  const plaintext = await decryptWithKey(dek, payload.ciphertext, payload.iv);
  return new TextDecoder().decode(plaintext);
}

// --- Share: re-wrap DEK with recipient's RSA public key ---

export async function wrapDEKForRecipient(
  encryptedDek: string, dekIv: string, kek: CryptoKey, recipientPublicKeyJwk: JsonWebKey
): Promise<string> {
  const rawDek = await decryptWithKey(kek, encryptedDek, dekIv);
  const recipientKey = await crypto.subtle.importKey('jwk', recipientPublicKeyJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, recipientKey, rawDek);
  return toBase64(wrapped);
}

export async function unwrapDEKWithPrivateKey(
  wrappedDek: string, encryptedPrivateKey: string, privateKeyIv: string, kek: CryptoKey
): Promise<CryptoKey> {
  const privateKeyData = await decryptWithKey(kek, encryptedPrivateKey, privateKeyIv);
  const privateKeyJwk = JSON.parse(new TextDecoder().decode(privateKeyData));
  const privateKey = await crypto.subtle.importKey('jwk', privateKeyJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  const rawDek = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, fromBase64(wrappedDek));
  return crypto.subtle.importKey('raw', rawDek, { name: ENC_ALGO, length: KEK_LENGTH }, false, ['encrypt', 'decrypt']);
}

// --- Decrypt content with an already-unwrapped DEK ---

export async function decryptContentWithDEK(ciphertext: string, iv: string, dek: CryptoKey): Promise<string> {
  const plaintext = await decryptWithKey(dek, ciphertext, iv);
  return new TextDecoder().decode(plaintext);
}

// --- ECDH messaging keys (for Feature 3) ---

export async function generateMessagingKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']) as Promise<CryptoKeyPair>;
}

export interface MessagingKeyBundle {
  publicKeyJwk: JsonWebKey;
  encryptedPrivateKey: string;
  privateKeyIv: string;
}

export async function setupMessagingKeys(kek: CryptoKey): Promise<MessagingKeyBundle> {
  const pair = await generateMessagingKeyPair();
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const enc = new TextEncoder();
  const { ciphertext: encryptedPrivateKey, iv: privateKeyIv } = await encryptWithKey(kek, enc.encode(JSON.stringify(privateKeyJwk)).buffer as ArrayBuffer);
  return { publicKeyJwk, encryptedPrivateKey, privateKeyIv };
}

export async function deriveMessageKey(
  privateKeyJwk: JsonWebKey, recipientPublicKeyJwk: JsonWebKey
): Promise<CryptoKey> {
  const privateKey = await crypto.subtle.importKey('jwk', privateKeyJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const publicKey = await crypto.subtle.importKey('jwk', recipientPublicKeyJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: ENC_ALGO, length: KEK_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(content: string, sharedKey: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const enc = new TextEncoder();
  return encryptWithKey(sharedKey, enc.encode(content).buffer as ArrayBuffer);
}

export async function decryptMessage(ciphertext: string, iv: string, sharedKey: CryptoKey): Promise<string> {
  const plaintext = await decryptWithKey(sharedKey, ciphertext, iv);
  return new TextDecoder().decode(plaintext);
}
