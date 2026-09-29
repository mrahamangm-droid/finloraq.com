import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/apiHandler";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { getDeal, updateDeal, MAX_DEAL_VALUE } from "@/lib/crm";
import { prisma } from "@/lib/db";
import { z } from "zod";

const UpdateDealSchema = z.object({
  name:              z.string().min(1).optional(),
  value:             z.number().min(0).max(MAX_DEAL_VALUE).optional(),
  currency:          z.string().length(3).optional(),
  stageId:           z.string().optional(),
  customerId:        z.string().optional().nullable(),
  contactId:         z.string().optional().nullable(),
  assignedToId:      z.string().optional().nullable(),
  expectedCloseDate: z.string().datetime().optional().nullable(),
  notes:             z.string().optional().nullable(),
  lostReason:        z.string().optional().nullable(),
});

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const deal = await getDeal(active.companyId, id);
  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(deal);
}

async function handlePATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "EDIT");

  const body = await req.json();
  const parsed = UpdateDealSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { expectedCloseDate, ...rest } = parsed.data;
  const deal = await updateDeal(active.companyId, id, {
    ...rest,
    ...(expectedCloseDate !== undefined
      ? { expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null }
      : {}),
  });
  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(deal);
}

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "DELETE");

  const deal = await prisma.deal.findFirst({ where: { id, companyId: active.companyId } });
  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.deal.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

export const GET = withApiErrors(handleGET);
export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
