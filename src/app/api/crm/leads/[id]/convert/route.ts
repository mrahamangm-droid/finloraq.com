import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { convertLead } from "@/lib/crm";
import { z } from "zod";

const ConvertSchema = z.object({
  customerName: z.string().min(1),
  createDeal:   z.boolean().default(false),
  dealName:     z.string().optional(),
  dealValue:    z.number().min(0).optional(),
  pipelineId:   z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "EDIT");

  const body = await req.json();
  const parsed = ConvertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await convertLead(active.companyId, active.id, id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
