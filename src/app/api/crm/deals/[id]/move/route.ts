import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { moveDeal } from "@/lib/crm";
import { z } from "zod";

const MoveSchema = z.object({ stageId: z.string().min(1) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "EDIT");

  const body = await req.json();
  const parsed = MoveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const deal = await moveDeal(active.companyId, id, parsed.data.stageId);
    return NextResponse.json(deal);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
