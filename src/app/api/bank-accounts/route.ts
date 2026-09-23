import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createBankAccount } from "@/lib/banking";
import { prisma } from "@/lib/db";

const schema = z.object({
  name: z.string().min(1),
  currency: z.string().length(3),
  openingBalance: z.number().optional(),
});

async function handleGET() {
  const { active } = await requireTenantContext();
  const accounts = await prisma.bankAccount.findMany({
    where: { companyId: active.companyId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(accounts);
}

async function handlePOST(req: Request) {
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

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);
