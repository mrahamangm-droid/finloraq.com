import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { customerStatement } from "@/lib/statements";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await props.params;
    const { active } = await requireTenantContext();

    const sp = req.nextUrl.searchParams;
    const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(new Date().getFullYear(), 0, 1);
    const to = sp.get("to") ? new Date(sp.get("to")!) : new Date();

    const statement = await customerStatement(
      active.companyId,
      active.id,
      customerId,
      from,
      to
    );

    return NextResponse.json(statement);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
