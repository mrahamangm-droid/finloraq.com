import { NextResponse } from "next/server";
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

export async function GET(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const url = new URL(req.url);
  const status  = url.searchParams.get("status") ?? undefined;
  const assignedToId = url.searchParams.get("assignedToId") ?? undefined;
  const page  = parseInt(url.searchParams.get("page") ?? "1", 10);
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

  const result = await listLeads(active.companyId, { status: status as never, assignedToId, page, limit });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "CREATE");

  const body = await req.json();
  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const lead = await createLead(active.companyId, active.id, parsed.data);
  return NextResponse.json(lead, { status: 201 });
}
