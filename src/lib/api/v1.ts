import { NextResponse } from "next/server";
import { Prisma, type PermissionAction } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { getApiTenantContext } from "@/lib/tenant";
import { can, ForbiddenError, roleCan, type Module } from "@/lib/rbac";
import { companyHasApiAccess } from "@/lib/apiKeys";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";
import { NotFoundError } from "@/lib/errors";
import { InvalidLineError, UnbalancedEntryError, PeriodLockedError } from "@/lib/ledger";

/**
 * Shared plumbing for every /api/v1 route: bearer-key auth, plan gate, rate
 * limit, the RBAC check, error mapping and JSON serialization. A route only
 * declares which module/action it needs and returns data.
 */

export type ApiContext = NonNullable<Awaited<ReturnType<typeof getApiTenantContext>>> & {
  companyId: string;
  membershipId: string;
};

/** Requests per key per minute. */
export const API_RATE_LIMIT = { max: 120, windowMs: 60_000 };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/**
 * A key may do something only if BOTH its role ceiling and the member it
 * acts as (live role + PermissionOverrides, via can()) allow it — never more
 * than a signed-in user of either would get.
 */
export async function apiCan(ctx: ApiContext, module: Module, action: PermissionAction): Promise<boolean> {
  return roleCan(ctx.keyRole, module, action) && (await can(ctx.membershipId, module, action));
}

export async function requireApiPermission(ctx: ApiContext, module: Module, action: PermissionAction) {
  if (!(await apiCan(ctx, module, action))) {
    throw new ApiError(403, "forbidden", `This API key can't ${action} ${module}.`);
  }
}

/** Decimal → exact string, Date → ISO 8601, recursively. */
export function toApiJson(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toFixed();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toApiJson);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toApiJson(v)]));
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

function errorJson(status: number, code: string, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

type Params = Record<string, string>;
type Handler = (ctx: ApiContext, req: Request, params: Params) => Promise<unknown>;

export function apiRoute(permission: { module: Module; action: PermissionAction } | null, handler: Handler) {
  return async (req: Request, routeCtx?: { params?: Promise<Params> }) => {
    const auth = req.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(auth);
    const ip = clientIpFromHeaders(req.headers);
    const ctxRow = match ? await getApiTenantContext(match[1]!) : null;
    if (!ctxRow) {
      // Keys can't be guessed (256 bits); this just stops a misconfigured
      // client or a scanner from hammering the key lookup.
      const fail = await checkRateLimit(`api-auth-fail:${ip}`, 30, 10 * 60_000);
      if (!fail.allowed) return errorJson(429, "rate_limited", "Too many failed authentication attempts.");
      return errorJson(401, "unauthorized", "Missing or invalid API key. Send it as: Authorization: Bearer fq_…", {
        "WWW-Authenticate": 'Bearer realm="finloraq-api"',
      });
    }
    const ctx: ApiContext = { ...ctxRow, companyId: ctxRow.active.companyId, membershipId: ctxRow.active.id };

    const limit = await checkRateLimit(`api:${ctx.keyId}`, API_RATE_LIMIT.max, API_RATE_LIMIT.windowMs);
    const rateHeaders = {
      "X-RateLimit-Limit": String(API_RATE_LIMIT.max),
      "X-RateLimit-Remaining": String(limit.remaining),
      "X-RateLimit-Reset": String(Math.ceil(limit.resetAt.getTime() / 1000)),
    };
    if (!limit.allowed) {
      return errorJson(429, "rate_limited", "Rate limit exceeded for this API key.", {
        ...rateHeaders,
        "Retry-After": String(Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000))),
      });
    }

    // Checked on every request, so a downgrade turns keys off immediately.
    if (!(await companyHasApiAccess(ctx.companyId))) {
      return errorJson(403, "plan_required", "API access is included on the Professional plan and above.", rateHeaders);
    }

    // Best-effort, at most once a minute per key — not worth a write per call.
    if (!ctx.lastUsedAt || Date.now() - ctx.lastUsedAt.getTime() > 60_000) {
      void prisma.apiKey.update({ where: { id: ctx.keyId }, data: { lastUsedAt: new Date() } }).catch(() => {});
    }

    try {
      if (permission) await requireApiPermission(ctx, permission.module, permission.action);
      const params = (await routeCtx?.params) ?? {};
      const body = await handler(ctx, req, params);
      const status = req.method === "POST" ? 201 : 200;
      return NextResponse.json(toApiJson(body), { status, headers: { ...rateHeaders, "Cache-Control": "no-store" } });
    } catch (err) {
      if (err instanceof ApiError) return errorJson(err.status, err.code, err.message, rateHeaders);
      if (err instanceof NotFoundError) return errorJson(404, "not_found", err.message, rateHeaders);
      if (err instanceof ForbiddenError) return errorJson(403, "forbidden", err.message, rateHeaders);
      if (err instanceof ZodError) return errorJson(400, "invalid_request", err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), rateHeaders);
      if (err instanceof Prisma.PrismaClientValidationError) return errorJson(400, "invalid_request", "Invalid filter or parameter value.", rateHeaders);
      if (err instanceof InvalidLineError || err instanceof UnbalancedEntryError || err instanceof PeriodLockedError) {
        return errorJson(400, "invalid_request", err.message, rateHeaders);
      }
      throw err;
    }
  };
}

/** ?limit (1–100, default 50) and ?cursor (an id from a previous page's nextCursor). */
export function pageParams(req: Request): { take: number; cursor?: string } {
  const url = new URL(req.url);
  const raw = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const take = Number.isFinite(raw) ? Math.min(100, Math.max(1, raw)) : 50;
  const cursor = url.searchParams.get("cursor") || undefined;
  return { take, cursor };
}

/** Fetches take+1 rows to know whether there's another page. */
export function page<T extends { id: string }>(rows: T[], take: number): { data: T[]; nextCursor: string | null } {
  const more = rows.length > take;
  const data = more ? rows.slice(0, take) : rows;
  return { data, nextCursor: more ? data[data.length - 1]!.id : null };
}

/** YYYY-MM-DD query param → the start or end of that UTC day, or a 400. */
export function dateParam(req: Request, name: string, fallback?: Date, edge: "start" | "end" = "end"): Date {
  const v = new URL(req.url).searchParams.get(name);
  if (!v) {
    if (fallback) return fallback;
    throw new ApiError(400, "invalid_request", `Query parameter "${name}" (YYYY-MM-DD) is required.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new ApiError(400, "invalid_request", `"${name}" must be a date like 2026-09-30.`);
  }
  return new Date(`${v}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`);
}
