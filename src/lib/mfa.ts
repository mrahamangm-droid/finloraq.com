import crypto from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/password";

/**
 * Hand-rolled TOTP (RFC 6238, built on RFC 4226's HOTP) using only Node's
 * built-in `crypto` module — no `otplib`/`speakeasy` dependency, because
 * this sandbox can't `npm install` anything to verify it works. The
 * algorithm is short and fully specified by the RFC, so it's implemented
 * directly and unit-tested against the RFC's own published test vectors
 * (see mfa.test.ts) rather than trusted on faith. Compatible with any
 * standard authenticator app (Google Authenticator, Authy, 1Password,
 * etc.) — they all implement the same RFC.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // accept 1 step of clock drift each direction (±30s)

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A fresh random 160-bit secret, base32-encoded (the RFC's recommended length for HMAC-SHA1). */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binCode =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return String(binCode % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function totpForTime(secretBase32: string, epochSeconds: number, stepOffset = 0): string {
  const counter = Math.floor(epochSeconds / TOTP_STEP_SECONDS) + stepOffset;
  return hotp(secretBase32, counter);
}

/** Generates the current 6-digit code — used only in tests; a real login always supplies its own code to verify. */
export function generateTotpToken(secretBase32: string, at: Date = new Date()): string {
  return totpForTime(secretBase32, Math.floor(at.getTime() / 1000));
}

/** Verifies a user-supplied code against ±1 time step to tolerate minor clock drift. */
export function verifyTotpToken(secretBase32: string, token: string, at: Date = new Date()): boolean {
  const clean = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;

  const nowSeconds = Math.floor(at.getTime() / 1000);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
    const candidate = totpForTime(secretBase32, nowSeconds, offset);
    // Constant-time comparison so a timing side-channel can't help an
    // attacker narrow down the correct code digit by digit.
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) {
      return true;
    }
  }
  return false;
}

/** The otpauth:// URI an authenticator app scans (as a QR code) or accepts pasted-in. */
export function buildOtpAuthUri(params: { secret: string; accountEmail: string; issuer?: string }): string {
  const issuer = params.issuer ?? "Finloraq";
  const label = encodeURIComponent(`${issuer}:${params.accountEmail}`);
  return `otpauth://totp/${label}?secret=${params.secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

const BACKUP_CODE_COUNT = 10;

/** Plain-text codes to show the user ONCE (e.g. "XXXX-XXXX"); only their hashes are ever persisted. */
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export async function hashBackupCode(code: string): Promise<string> {
  return hashPassword(normalizeBackupCode(code));
}

export async function verifyBackupCode(hash: string, code: string): Promise<boolean> {
  return verifyPassword(hash, normalizeBackupCode(code));
}

function normalizeBackupCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
