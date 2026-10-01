import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { domainErrorResponse } from "@/lib/api-errors";
import { API_KEY_ROLES, ApiKeyError, createApiKey, listApiKeys } from "@/lib/apiKeys";

const schema = z.object({ label: z.string().min(1).max(80), role: z.enum(API_KEY_ROLES) });

export async function GET() {
  const { active } = await requireTenantContext();
  if (!(await can(active.id, "settings", "VIEW"))) {
    return NextResponse.json({ error: "Missing VIEW on settings." }, { status: 403 });
  }
  return NextResponse.json({ apiKeys: await listApiKeys(active.companyId) });
}

/** Returns the raw key exactly once; only its hash is stored. */
export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  try {
    const { key, apiKey } = await createApiKey({ companyId: active.companyId, membershipId: active.id, userId, ...parsed.data });
    return NextResponse.json({ id: apiKey.id, key, prefix: apiKey.prefix }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ApiKeyError) return NextResponse.json({ error: err.message }, { status: 400 });
    return domainErrorResponse(err);
  }
}
