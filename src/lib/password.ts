import argon2 from "argon2";

// Argon2id per OWASP recommendation (memory-hard, side-channel resistant).
// Tuning: 19 MiB memory / 2 iterations / 1 thread is OWASP's minimum-safe
// baseline for interactive login; raise memoryCost if server RAM allows —
// re-tune under load testing before going to production traffic.
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash, algorithm mismatch, etc. — never throw into the auth
    // flow, just fail closed.
    return false;
  }
}

export function isPasswordStrong(plain: string): { ok: boolean; reason?: string } {
  if (plain.length < 12) return { ok: false, reason: "Password must be at least 12 characters." };
  if (!/[a-z]/.test(plain)) return { ok: false, reason: "Password must include a lowercase letter." };
  if (!/[A-Z]/.test(plain)) return { ok: false, reason: "Password must include an uppercase letter." };
  if (!/[0-9]/.test(plain)) return { ok: false, reason: "Password must include a digit." };
  return { ok: true };
}
