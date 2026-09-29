import { NextResponse } from "next/server";
import { LeadStatus } from "@prisma/client";
import { enumParam, pageParams, withApiErrors } from "@/lib/apiHandler";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { createLead, listLeads } from "@/lib/crm";
import { z } from "zod";

const CreateLeadSchema = z.object({
  firstName:   z.string().min(1),
  lastName:    z.string().min(1),
  email:       z.string().email().optional().nullable(),
  phone:       z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  jobTitle:    z.string().optional().nullable(),
  source:      z.string().optional().nullable(),
  notes:       z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

async function handleGET(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const url = new URL(req.url);
  const status  = enumParam(url, "status", Object.values(LeadStatus));
  const assignedToId = url.searchParams.get("assignedToId") ?? undefined;
  const { page, limit } = pageParams(url);

  const result = await listLeads(active.companyId, { status, assignedToId, page, limit });
  return NextResponse.json(result);
}

async function handlePOST(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "CREATE");

  const body = await req.json();
  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const lead = await createLead(active.companyId, active.id, parsed.data);
  return NextResponse.json(lead, { status: 201 });
}

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);
