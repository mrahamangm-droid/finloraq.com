import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/apiHandler";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { moveDeal } from "@/lib/crm";
import { z } from "zod";

const MoveSchema = z.object({ stageId: z.string().min(1) });

async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "EDIT");

  const body = await req.json();
  const parsed = MoveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const deal = await moveDeal(active.companyId, id, parsed.data.stageId);
  return NextResponse.json(deal);
}

export const POST = withApiErrors(handlePOST);
