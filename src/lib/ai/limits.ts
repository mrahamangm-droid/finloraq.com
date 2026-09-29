import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";
import { knownErrorResponse } from "@/lib/apiHandler";
import { AiNotConfiguredError, AiProviderError } from "@/lib/ai/provider";

/**
 * Cost controls for the AI-backed API routes, on top of the plan's monthly
 * usage cap (src/lib/billing/usage.ts), which only bounds a company's total.
 * These bound bursts: one user (or one IP, across accounts) can't fire
 * hundreds of paid model calls in a minute before the monthly cap bites.
 */
const WINDOW_MS = 60 * 1000;
const LIMITS = {
  // Copilot questions and voice commands: short prompts, cheap-ish calls.
  chat: { perUser: 20, perIp: 60 },
  // Document/customer-file extraction: vision/PDF calls, the expensive ones.
  extract: { perUser: 10, perIp: 30 },
} as const;

export type AiRouteKind = keyof typeof LIMITS;

/** A 429 when this user or IP is over the per-minute burst limit, else null. */
export async function aiRateLimitResponse(kind: AiRouteKind, userId: string, headers: Headers): Promise<NextResponse | null> {
  const ip = clientIpFromHeaders(headers);
  const { perUser, perIp } = LIMITS[kind];
  const user = await checkRateLimit(`ai:${kind}:user:${userId}`, perUser, WINDOW_MS);
  const byIp = user.allowed ? await checkRateLimit(`ai:${kind}:ip:${ip}`, perIp, WINDOW_MS) : user;
  if (user.allowed && byIp.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil(((user.allowed ? byIp : user).resetAt.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many AI requests — wait a minute and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/**
 * Largest base64 upload the extraction routes accept (~4.5MB of file). Vercel
 * already rejects request bodies over 4.5MB, so this changes nothing there; it
 * stops a self-hosted deployment from buffering and forwarding arbitrarily
 * large files to the model.
 */
export const MAX_AI_UPLOAD_BASE64_CHARS = 6_000_000;

/**
 * Error mapping shared by the AI routes: permission / usage-cap / validation
 * errors via knownErrorResponse, 503 when no provider is configured, 502 for a
 * provider failure (logged, never echoed — its body is the provider's), and
 * the plain Errors the extraction pipeline throws for user-facing problems
 * ("already uploaded", "not in your plan", unsupported file type) as 400.
 */
export function aiErrorResponse(err: unknown, route: string): NextResponse | null {
  const known = knownErrorResponse(err);
  if (known) return known;
  if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
  if (err instanceof AiProviderError) {
    console.error(`[${route}] AI provider error`, err.status, err.message);
    return NextResponse.json({ error: "The AI provider couldn't process this request. Please try again." }, { status: 502 });
  }
  if (err instanceof Error && err.constructor === Error) return NextResponse.json({ error: err.message }, { status: 400 });
  return null;
}
