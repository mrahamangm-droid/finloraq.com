import { NextResponse } from "next/server";
import { ActivityStatus } from "@prisma/client";
import { enumParam, pageParams, withApiErrors } from "@/lib/apiHandler";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { createActivity, listActivities } from "@/lib/crm";
import { z } from "zod";

const CreateActivitySchema = z.object({
  type:        z.enum(["CALL", "EMAIL", "MEETING", "TASK", "NOTE"]),
  subject:     z.string().min(1),
  notes:       z.string().optional().nullable(),
  dueAt:       z.string().datetime().optional().nullable(),
  leadId:      z.string().optional().nullable(),
  dealId:      z.string().optional().nullable(),
  contactId:   z.string().optional().nullable(),
  customerId:  z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

async function handleGET(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const url = new URL(req.url);
  const filters = {
    leadId:      url.searchParams.get("leadId")      ?? undefined,
    dealId:      url.searchParams.get("dealId")      ?? undefined,
    contactId:   url.searchParams.get("contactId")   ?? undefined,
    customerId:  url.searchParams.get("customerId")  ?? undefined,
    assignedToId: url.searchParams.get("assignedToId") ?? undefined,
    status:      enumParam(url, "status", Object.values(ActivityStatus)),
    ...pageParams(url),
  };

  const result = await listActivities(active.companyId, filters);
  return NextResponse.json(result);
}

async function handlePOST(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "CREATE");

  const body = await req.json();
  const parsed = CreateActivitySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { dueAt, ...rest } = parsed.data;
  const activity = await createActivity(active.companyId, active.id, {
    ...rest,
    dueAt: dueAt ? new Date(dueAt) : null,
  });
  return NextResponse.json(activity, { status: 201 });
}

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);
