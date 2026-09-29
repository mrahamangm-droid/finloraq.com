import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { supplierStatement } from "@/lib/statements";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: supplierId } = await props.params;
    const { active } = await requireTenantContext();

    const sp = req.nextUrl.searchParams;
    const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(new Date().getFullYear(), 0, 1);
    const to = sp.get("to") ? new Date(sp.get("to")!) : new Date();

    const statement = await supplierStatement(
      active.companyId,
      active.id,
      supplierId,
      from,
      to
    );

    return NextResponse.json(statement);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
