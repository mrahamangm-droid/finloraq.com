import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Sliding-window rate limiter for auth-adjacent endpoints (login, MFA codes,
 * registration, password reset, email verification, public checkout, inbound
 * webhooks).
 *
 * Hits are stored in Postgres (the RateLimitHit table), so every server
 * instance shares one count. The previous version kept counters in process
 * memory, which on Vercel meant each serverless instance had its own
 * counters and an attacker spread across instances got a multiple of the
 * configured limit.
 *
 * Each check runs in one short transaction holding a per-key advisory lock,
 * so concurrent requests for the same key can't both slip under the limit.
 * Keys are stored only as a SHA-256 hash, since some contain an email address.
 *
 * If the database can't be reached, the check falls back to the in-memory
 * limiter for that instance rather than letting requests through unlimited
 * (the endpoints behind it mostly need the database anyway).
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Pure sliding-window decision, shared by both stores. `hits` are epoch-ms
 * timestamps of earlier counted requests for this key (any order, may include
 * expired ones).
 */
export function evaluateWindow(hits: number[], now: number, max: number, windowMs: number): RateLimitResult & { inWindow: number[] } {
  const inWindow = hits.filter((t) => now - t < windowMs).sort((a, b) => a - b);
  const allowed = inWindow.length < max;
  if (allowed) inWindow.push(now);
  return {
    allowed,
    remaining: Math.max(0, max - inWindow.length),
    resetAt: new Date((inWindow[0] ?? now) + windowMs),
    inWindow,
  };
}

// ── In-memory store: fallback when the database is unavailable, and tests ──

const buckets = new Map<string, number[]>();
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

function memoryCheck(key: string, max: number, windowMs: number, now: number): RateLimitResult {
  if (now - lastCleanup >= CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    for (const [k, hits] of buckets) {
      if (hits.length === 0 || now - hits[hits.length - 1]! > CLEANUP_INTERVAL_MS) buckets.delete(k);
    }
  }
  const { inWindow, ...result } = evaluateWindow(buckets.get(key) ?? [], now, max, windowMs);
  buckets.set(key, inWindow);
  return result;
}

// ── Postgres store ──

/** Longest window any caller uses is 1 hour; rows older than this are never read. */
const PRUNE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;
/** Arbitrary namespace for pg_advisory_xact_lock(int, int), so these locks can't collide with the ledger's. */
const LOCK_NAMESPACE = 7201;

export function hashRateLimitKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function databaseCheck(key: string, max: number, windowMs: number, now: number): Promise<RateLimitResult> {
  const keyHash = hashRateLimitKey(key);
  const windowStart = new Date(now - windowMs);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, hashtext(${keyHash}))`;
    // This key's expired hits are never read again.
    await tx.rateLimitHit.deleteMany({ where: { keyHash, createdAt: { lte: windowStart } } });
    const rows = await tx.rateLimitHit.findMany({ where: { keyHash }, select: { createdAt: true } });
    const window = evaluateWindow(rows.map((r) => r.createdAt.getTime()), now, max, windowMs);
    const decision: RateLimitResult = { allowed: window.allowed, remaining: window.remaining, resetAt: window.resetAt };
    if (decision.allowed) {
      await tx.rateLimitHit.create({ data: { keyHash, createdAt: new Date(now) } });
    }
    return decision;
  });

  // Occasionally sweep rows for keys that are never hit again (one-off IPs).
  if (Math.random() < 0.01) {
    await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(now - PRUNE_OLDER_THAN_MS) } } }).catch(() => {});
  }
  return result;
}

let store: "database" | "memory" = "database";
let warnedFallback = false;

/**
 * @param key      What's being limited, e.g. `login:${email}` or `webhook:${ip}`.
 *                 Callers choose the key shape deliberately; see each call site.
 * @param max      Max hits allowed within the window.
 * @param windowMs Window length in milliseconds.
 */
export async function checkRateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  if (store === "memory") return memoryCheck(key, max, windowMs, now);
  try {
    return await databaseCheck(key, max, windowMs, now);
  } catch (err) {
    if (!warnedFallback) {
      warnedFallback = true;
      console.error("[rateLimit] database store unavailable; falling back to per-instance memory", err);
    }
    return memoryCheck(key, max, windowMs, now);
  }
}

/** Test-only: use the in-memory store (no database) and start from empty. */
export function __useMemoryRateLimitsForTests() {
  store = "memory";
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
  if (forwarded) return (forwarded.split(",")[0] ?? forwarded).trim();
  return get("x-real-ip") ?? "unknown";
}
