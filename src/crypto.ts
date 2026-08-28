/**
 * Módulo de criptografia para proteção de conteúdo.
 * Usa Web Crypto API (AES-GCM 256 bits) — funciona no navegador e no Electron.
 * Compatível com backup/restauração: os dados criptografados são strings base64
 * que viajam no JSON normalmente.
 */

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ITERATIONS = 100000;

/**
 * Deriva uma chave AES-256 a partir de uma senha usando PBKDF2.
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Criptografa um texto com senha.
 * Retorna string base64 contendo: salt (16) + iv (12) + ciphertext.
 */
export async function encrypt(plaintext: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  // Concatena: salt + iv + ciphertext
  const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Descriptografa um texto protegido por senha.
 * Retorna null se a senha estiver errada ou os dados forem inválidos.
 */
export async function decrypt(encrypted: string, password: string): Promise<string | null> {
  try {
    const binary = atob(encrypted);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    if (bytes.length < SALT_LENGTH + IV_LENGTH + 1) return null;

    const salt = bytes.slice(0, SALT_LENGTH);
    const iv = bytes.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = bytes.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

/**
 * Gera um hash da senha para verificação rápida (não revela a senha).
 * Usado para validar se o usuário digitou a senha correta sem descriptografar tudo.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const hashBytes = new Uint8Array(bits);
  const combined = new Uint8Array(SALT_LENGTH + hashBytes.length);
  combined.set(salt, 0);
  combined.set(hashBytes, SALT_LENGTH);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Verifica se uma senha corresponde ao hash armazenado.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const binary = atob(storedHash);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    if (bytes.length < SALT_LENGTH + 1) return false;

    const salt = bytes.slice(0, SALT_LENGTH);
    const storedKey = bytes.slice(SALT_LENGTH);

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    const derivedKey = new Uint8Array(bits);

    // Comparação em tempo constante
    if (derivedKey.length !== storedKey.length) return false;
    let diff = 0;
    for (let i = 0; i < derivedKey.length; i++) {
      diff |= derivedKey[i] ^ storedKey[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/**
 * Interface para dados protegidos no HTML/atributos.
 */
export interface ProtectionData {
  isProtected: boolean;
  passwordHash: string; // Hash para verificação
  encryptedContent: string; // Conteúdo criptografado (imagem base64 ou texto)
  hint: string; // Dica de senha
}
