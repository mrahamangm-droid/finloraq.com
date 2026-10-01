import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { domainErrorResponse } from "@/lib/api-errors";
import { DuplicatePostingError, InvalidLineError, PeriodLockedError, UnbalancedEntryError } from "@/lib/ledger";
import {
  OpeningBalanceActivityError,
  OpeningBalanceError,
  openingBalanceStatus,
  postOpeningBalances,
} from "@/lib/openingBalances";

const amount = z.union([z.string().max(24), z.number()]).nullable().optional();

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().max(200).optional(),
  acknowledgeExistingActivity: z.boolean().optional(),
  lines: z
    .array(z.object({ accountCode: z.string().max(32), debit: amount, credit: amount, description: z.string().max(200).nullable().optional() }))
    .min(1)
    .max(500),
});

export async function GET() {
  const { active } = await requireTenantContext();
  if (!(await can(active.id, "accounting", "VIEW"))) {
    return NextResponse.json({ error: "Missing VIEW on accounting." }, { status: 403 });
  }
  const status = await openingBalanceStatus(active.companyId);
  return NextResponse.json(status);
}

export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  try {
    const entry = await postOpeningBalances({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      date: new Date(`${parsed.data.date}T00:00:00.000Z`),
      memo: parsed.data.memo,
      acknowledgeExistingActivity: parsed.data.acknowledgeExistingActivity,
      lines: parsed.data.lines,
    });
    return NextResponse.json({ id: entry.id, entryNumber: entry.entryNumber }, { status: 201 });
  } catch (err) {
    if (err instanceof OpeningBalanceActivityError) {
      return NextResponse.json({ error: err.message, code: "needs_acknowledgement" }, { status: 409 });
    }
    if (err instanceof OpeningBalanceError || err instanceof DuplicatePostingError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof UnbalancedEntryError || err instanceof PeriodLockedError || err instanceof InvalidLineError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return domainErrorResponse(err);
  }
}
