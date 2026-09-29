import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { updateContact } from "@/lib/crm";
import { prisma } from "@/lib/db";
import { z } from "zod";

const UpdateContactSchema = z.object({
  firstName:  z.string().min(1).optional(),
  lastName:   z.string().min(1).optional(),
  email:      z.string().email().optional().nullable(),
  phone:      z.string().optional().nullable(),
  title:      z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  isPrimary:  z.boolean().optional(),
  customerId: z.string().optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const contact = await prisma.crmContact.findFirst({
    where: { id, companyId: active.companyId },
    include: {
      customer: { select: { id: true, name: true } },
      deals:    { select: { id: true, name: true, value: true } },
    },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "EDIT");

  const body = await req.json();
  const parsed = UpdateContactSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const contact = await updateContact(active.companyId, id, parsed.data);
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(contact);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "DELETE");

  const contact = await prisma.crmContact.findFirst({ where: { id, companyId: active.companyId } });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.crmContact.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
