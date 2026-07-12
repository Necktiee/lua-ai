/**
 * AES-256-GCM encryption for secrets at rest (Google OAuth tokens).
 * Ciphertext format: enc:v1:<iv_b64>:<tag_b64>:<ct_b64>
 * Plaintext (legacy) values pass through decryptSecret unchanged.
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

export const ENC_PREFIX = "enc:v1:";

function resolveKey(override?: string): Buffer | null {
  const raw = (override ?? env.TOKEN_ENCRYPTION_KEY)?.trim();
  if (!raw) return null;
  // Accept raw 32-byte base64, 64-char hex, or any passphrase (SHA-256).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    /* fall through */
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function hasTokenEncryptionKey(): boolean {
  return resolveKey() !== null;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

/** Encrypt plaintext. Returns plaintext unchanged if no key configured. */
export function encryptSecret(
  plaintext: string | null | undefined,
  keyOverride?: string,
): string | null {
  if (plaintext == null || plaintext === "") return plaintext ?? null;
  if (isEncrypted(plaintext)) return plaintext;
  const key = resolveKey(keyOverride);
  if (!key) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt enc:v1 values. Legacy plaintext returned as-is. */
export function decryptSecret(
  value: string | null | undefined,
  keyOverride?: string,
): string | null {
  if (value == null || value === "") return value ?? null;
  if (!isEncrypted(value)) return value;
  const key = resolveKey(keyOverride);
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY required to decrypt stored secrets");
  }
  const body = value.slice(ENC_PREFIX.length);
  const [ivB64, tagB64, ctB64] = body.split(":");
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error("malformed encrypted secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}
