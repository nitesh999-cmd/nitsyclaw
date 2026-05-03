import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";

/**
 * Mask a phone number for logs (R6). Keeps last 4 digits.
 *   "+919876543210" -> "+91****3210"
 */
export function maskPhone(num: string): string {
  if (num.length <= 4) return "****";
  const last = num.slice(-4);
  const head = num.slice(0, Math.min(3, num.length - 4));
  const stars = "*".repeat(Math.max(0, num.length - head.length - 4));
  return `${head}${stars}${last}`;
}

/**
 * Stable hash for indexing PII without storing it (R6).
 */
export function hashPhone(num: string): string {
  return createHash("sha256").update(num).digest("hex").slice(0, 16);
}

function getKey(envKey?: string): Buffer {
  const k = envKey ?? process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY not set");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (base64)");
  }
  return buf;
}

/**
 * Encrypt a string with AES-256-GCM. Output is base64(iv:authTag:ciphertext).
 */
export function encryptString(plain: string, envKey?: string): string {
  const key = getKey(envKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, enc]).toString("base64")}`;
}

interface StorageEncryptionEnv {
  [key: string]: string | undefined;
  ENCRYPTION_KEY?: string;
  ALLOW_PLAINTEXT_DB?: string;
}

export function isEncryptedString(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function decryptString(payload: string, envKey?: string): string {
  const key = getKey(envKey);
  const cipherPayload = isEncryptedString(payload) ? payload.slice(PREFIX.length) : payload;
  const buf = Buffer.from(cipherPayload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function encryptForStorage(
  plain: string,
  env: StorageEncryptionEnv = process.env,
): string {
  const key = env.ENCRYPTION_KEY?.trim();
  if (key) return encryptString(plain, key);
  if (env.ALLOW_PLAINTEXT_DB === "true") return plain;
  throw new Error("ENCRYPTION_KEY is required for database storage");
}

/**
 * Generate a fresh key. Used by setup scripts.
 */
export function generateKey(): string {
  return randomBytes(32).toString("base64");
}
