import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/apiHandler";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { convertLead, MAX_DEAL_VALUE } from "@/lib/crm";
import { z } from "zod";

const ConvertSchema = z.object({
  customerName: z.string().min(1),
  createDeal:   z.boolean().default(false),
  dealName:     z.string().optional(),
  dealValue:    z.number().min(0).max(MAX_DEAL_VALUE).optional(),
  pipelineId:   z.string().optional(),
});

async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "EDIT");

  const body = await req.json();
  const parsed = ConvertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await convertLead(active.companyId, active.id, id, parsed.data);
  return NextResponse.json(result, { status: 201 });
}

export const POST = withApiErrors(handlePOST);
