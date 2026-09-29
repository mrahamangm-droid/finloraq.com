import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/apiHandler";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { getLead, updateLead } from "@/lib/crm";
import { z } from "zod";

const UpdateLeadSchema = z.object({
  firstName:    z.string().min(1).optional(),
  lastName:     z.string().min(1).optional(),
  email:        z.string().email().optional().nullable(),
  phone:        z.string().optional().nullable(),
  companyName:  z.string().optional().nullable(),
  jobTitle:     z.string().optional().nullable(),
  source:       z.string().optional().nullable(),
  notes:        z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  status:       z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"]).optional(),
});

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const lead = await getLead(active.companyId, id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lead);
}

async function handlePATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "EDIT");

  const body = await req.json();
  const parsed = UpdateLeadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const lead = await updateLead(active.companyId, id, parsed.data);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lead);
}

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "DELETE");

  const lead = await getLead(active.companyId, id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { prisma } = await import("@/lib/db");
  await prisma.lead.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

export const GET = withApiErrors(handleGET);
export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
