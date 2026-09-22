/**
 * In-memory sliding-window rate limiter for auth-adjacent endpoints
 * (login, registration, MFA verification, inbound webhooks). This is
 * deliberately simple and has one real limitation, stated plainly rather
 * than hidden: it's per-process memory, so on a multi-instance deployment
 * (Vercel serverless, multiple containers) each instance has its own
 * counters — an attacker spread across instances gets a higher effective
 * limit than configured. `REDIS_URL` is already in `.env.example` for
 * exactly this reason; swapping this module's Map for a Redis
 * INCR+EXPIRE (or a sliding-window Lua script) is a drop-in replacement
 * behind the same `checkRateLimit()` signature — nothing calling this
 * needs to change. For a single-instance deployment (a VPS, one Vercel
 * function warm instance under moderate traffic) this is real protection
 * today, not a placeholder.
 */

interface Bucket {
  hits: number[]; // epoch ms timestamps within the current window
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup so long-lived instances don't leak memory from
// one-off keys (e.g. per-IP) that are never hit again.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();
function maybeCleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > CLEANUP_INTERVAL_MS) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * @param key    Unique identifier for what's being limited, e.g.
 *               `login:${email}` or `webhook:${ip}`. Callers choose the
 *               key shape deliberately — see each call site's comment.
 * @param max    Max hits allowed within the window.
 * @param windowMs Window length in milliseconds.
 */
export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  maybeCleanup(now);

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  const allowed = bucket.hits.length < max;
  if (allowed) {
    bucket.hits.push(now);
  }
  buckets.set(key, bucket);

  const oldestInWindow = bucket.hits[0] ?? now;
  return {
    allowed,
    remaining: Math.max(0, max - bucket.hits.length),
    resetAt: new Date(oldestInWindow + windowMs),
  };
}

/** Test-only escape hatch — production code never calls this. */
export function __resetRateLimitsForTests() {
  buckets.clear();
}

export function clientIpFromHeaders(headers: Headers | Record<string, string | string[] | undefined> | undefined): string {
  if (!headers) return "unknown";
  const get = (name: string): string | undefined => {
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const forwarded = get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return get("x-real-ip") ?? "unknown";
}
