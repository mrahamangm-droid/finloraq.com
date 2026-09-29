import { NextResponse } from "next/server";
import { ForbiddenError } from "@/lib/rbac";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { UsageLimitExceededError } from "@/lib/billing/usage";

/**
 * Shared error mapping for API route handlers.
 *
 * Without it, a ForbiddenError from requirePermission() / requireTenantContext(),
 * or the SyntaxError req.json() throws on a malformed body, escapes the handler
 * and Next answers 500 — the client sees "server broken" for what is really
 * "you can't do that" or "bad request". Known errors get their real status and
 * a message that's safe to show; anything else is rethrown, so Next logs it
 * (and instrumentation's onRequestError reports it) and the client gets a
 * bare 500 with no internals.
 */
export function knownErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
  if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof UsageLimitExceededError) return NextResponse.json({ error: err.message }, { status: 402 });
  // req.json() on a body that isn't JSON.
  if (err instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  return null;
}

/** Wraps a route handler so known errors map to their HTTP status (see knownErrorResponse). */
export function withApiErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      const res = knownErrorResponse(err);
      if (res) return res;
      throw err;
    }
  };
}

export const MAX_PAGE_SIZE = 200;

/**
 * `?page=&limit=` from a list endpoint's URL, clamped to sane bounds. Raw
 * parseInt let `limit=1000000` dump a whole table in one response and
 * `page=0` / `page=abc` produce a negative or NaN skip (a 500 from Prisma).
 */
export function pageParams(url: URL, defaultLimit = 50): { page: number; limit: number } {
  const int = (name: string, fallback: number) => {
    const n = Number.parseInt(url.searchParams.get(name) ?? "", 10);
    return Number.isFinite(n) ? n : fallback;
  };
  const page = Math.min(Math.max(int("page", 1), 1), 100_000);
  const limit = Math.min(Math.max(int("limit", defaultLimit), 1), MAX_PAGE_SIZE);
  return { page, limit };
}

/** A query-string value that must be one of `allowed`; anything else is treated as "no filter". */
export function enumParam<T extends string>(url: URL, name: string, allowed: readonly T[]): T | undefined {
  const v = url.searchParams.get(name);
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}
