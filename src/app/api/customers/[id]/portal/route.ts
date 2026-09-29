import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { getPortalUrl, rotatePortalToken } from "@/lib/customer-portal";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** GET /api/customers/:id/portal — get (or mint) portal URL */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const { active } = await requireTenantContext();
    const url = await getPortalUrl(active.companyId, active.id, id);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** POST /api/customers/:id/portal/rotate — rotate token (invalidate old links) */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const { active } = await requireTenantContext();

    // Only allow if action=rotate
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "rotate") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const { buildPortalUrl } = await import("@/lib/customer-portal");
    const token = await rotatePortalToken(active.companyId, active.id, id);
    const url = buildPortalUrl(token);
    return NextResponse.json({ url, rotated: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
