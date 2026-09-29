/**
 * AES-256-GCM symmetric envelope encryption for sensitive fields stored
 * in the database (e.g. TOTP secrets, future OAuth tokens).
 *
 * Format of an encrypted value (ciphertext): a colon-delimited string:
 *   v1:<iv_base64url>:<authTag_base64url>:<ciphertext_base64url>
 *
 * The "v1:" version prefix lets us distinguish encrypted values from
 * legacy plaintext values during a migration window, and makes a future
 * algorithm rotation backward-compatible without a full re-encryption pass.
 *
 * Key configuration
 * -----------------
 * Set FIELD_ENCRYPTION_KEY to a base64-encoded 32-byte random key:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Without this env var, encrypt() throws and decrypt() returns plaintext
 * (so a fresh deploy without the env var fails loudly on writes but keeps
 * reading existing plaintext values — callers get full observability).
 */

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;        // 96-bit IV — GCM's recommended nonce length
const AUTH_TAG_BYTES = 16;  // 128-bit authentication tag
const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY env var is required for field encryption. " +
      "Generate a key with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length})`);
  }
  return key;
}

/**
 * Encrypt a plaintext string. Returns a version-prefixed ciphertext string.
 * Throws if FIELD_ENCRYPTION_KEY is absent or malformed.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/**
 * Decrypt an encrypted string produced by encrypt().
 *
 * If the value does not start with the version prefix (v1:), it is returned
 * as-is — this handles legacy plaintext values in the database during the
 * migration window. Once all records have been re-encrypted (or the field
 * backfilled), this branch becomes dead code.
 *
 * Throws if the ciphertext is malformed or FIELD_ENCRYPTION_KEY is absent.
 */
export function decrypt(ciphertext: string): string {
  // Legacy plaintext — no version prefix
  if (!ciphertext.startsWith(`${VERSION}:`)) {
    return ciphertext;
  }

  const parts = ciphertext.split(":");
  if (parts.length !== 4) {
    throw new Error(`Invalid encrypted value format (expected 4 parts, got ${parts.length})`);
  }

  const [, ivB64, authTagB64, dataB64] = parts as [string, string, string, string];
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(authTagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");

  if (iv.length !== IV_BYTES) throw new Error("Invalid IV length in encrypted value");
  if (authTag.length !== AUTH_TAG_BYTES) throw new Error("Invalid auth tag length in encrypted value");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * Returns true when the value is already encrypted with the current scheme.
 * Use this to skip re-encryption during update operations.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}
