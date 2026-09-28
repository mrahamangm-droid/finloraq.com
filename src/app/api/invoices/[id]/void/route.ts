import { NextResponse } from "next/server";
import { NotFoundError } from "@/lib/errors";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { voidInvoice } from "@/lib/voidDocuments";
import { InvalidLineError, DuplicatePostingError, PeriodLockedError } from "@/lib/ledger";
import { ForbiddenError } from "@/lib/rbac";

const schema = z.object({ reason: z.string().max(500) });

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  try {
    const r = await voidInvoice({ companyId: active.companyId, membershipId: active.id, userId, invoiceId: params.id, reason: parsed.data.reason });
    return NextResponse.json({ id: r.invoiceId, status: "VOID", reversalEntryId: r.reversalEntryId });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "You don't have permission to void invoices." }, { status: 403 });
    if (err instanceof InvalidLineError || err instanceof DuplicatePostingError || err instanceof PeriodLockedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
