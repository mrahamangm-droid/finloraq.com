import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { createBankAccount } from "@/lib/banking";
import { prisma } from "@/lib/db";

const schema = z.object({
  name: z.string().min(1),
  currency: z.string().length(3),
  openingBalance: z.number().optional(),
});

export async function GET() {
  const { active } = await requireTenantContext();
  // Reads are gated on VIEW exactly like writes are gated on CREATE/EDIT —
  // a role without banking:VIEW (e.g. STAFF) gets 403, not the data.
  if (!(await can(active.id, "banking", "VIEW"))) {
    return NextResponse.json({ error: "Missing VIEW on banking." }, { status: 403 });
  }
  const accounts = await prisma.bankAccount.findMany({
    where: { companyId: active.companyId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(accounts);
}

export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const account = await createBankAccount({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    name: parsed.data.name,
    currency: parsed.data.currency,
    openingBalance: parsed.data.openingBalance,
  });

  return NextResponse.json({ id: account.id });
}
