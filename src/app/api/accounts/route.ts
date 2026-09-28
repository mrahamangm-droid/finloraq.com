import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createAccount, AccountValidationError } from "@/lib/accounts";
import { ForbiddenError, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES),
  parentId: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
});

export async function GET() {
  const { active } = await requireTenantContext();
  // Reads are gated on VIEW exactly like writes are gated on CREATE/EDIT —
  // a role without accounting:VIEW (e.g. STAFF) gets 403, not the data.
  if (!(await can(active.id, "accounting", "VIEW"))) {
    return NextResponse.json({ error: "Missing VIEW on accounting." }, { status: 403 });
  }
  const accounts = await prisma.account.findMany({
    where: { companyId: active.companyId },
    orderBy: { code: "asc" },
  });
  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const account = await createAccount({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      ...parsed.data,
    });
    return NextResponse.json({ id: account.id });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof AccountValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
