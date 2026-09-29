import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { createContact, listContacts } from "@/lib/crm";
import { z } from "zod";

const CreateContactSchema = z.object({
  firstName:  z.string().min(1),
  lastName:   z.string().min(1),
  email:      z.string().email().optional().nullable(),
  phone:      z.string().optional().nullable(),
  title:      z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  isPrimary:  z.boolean().optional(),
  customerId: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId") ?? undefined;
  const page  = parseInt(url.searchParams.get("page") ?? "1", 10);
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

  const result = await listContacts(active.companyId, { customerId, page, limit });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "CREATE");

  const body = await req.json();
  const parsed = CreateContactSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const contact = await createContact(active.companyId, parsed.data);
  return NextResponse.json(contact, { status: 201 });
}
