import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

// Argon2id per OWASP recommendation (memory-hard, side-channel resistant).
// Tuning: 19 MiB memory / 2 iterations / 1 thread is OWASP's minimum-safe
// baseline for interactive login; raise memorySize if server RAM allows —
// re-tune under load testing before going to production traffic.
//
// Implemented via hash-wasm (a WebAssembly Argon2id, zero native deps)
// rather than the `argon2` npm package's native addon. The native package
// shipped no prebuilt binding for the Node ABI Vercel's serverless
// functions actually ran (`Error: No native build was found for
// platform=linux arch=x64 ... abi=137`), so every register/login 500'd in
// production regardless of which Node.js version the project was set to
// build with — see git log for the incident. WASM has no per-platform
// ABI to mismatch in the first place, so it's the durably deployable
// choice here, not just a fix for this one Node version.
const ARGON2_TUNING = {
  iterations: 2,
  parallelism: 1,
  memorySize: 19456,
  hashLength: 32,
  outputType: "encoded" as const,
};

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  return argon2id({
    password: plain,
    salt,
    ...ARGON2_TUNING,
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: plain, hash });
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
