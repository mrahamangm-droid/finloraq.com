import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { confirmVoiceAction } from "@/lib/ai/voice";

const schema = z.object({
  action: z.literal("draft_expense"),
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
});

/**
 * The only endpoint in the voice pipeline that changes data. A proposal
 * from /api/voice/command must be explicitly confirmed here — matching
 * the spec's "financial actions via voice require confirmation" as an
 * architectural split, not just a UI dialog the client could skip.
 * Creates a DRAFT expense only; it still needs a separate Approve action
 * (expenses:APPROVE) to post to the ledger, same as any other expense.
 */
async function handlePOST(req: Request) {
  const { active, userId } = await requireTenantContext();
  await requirePermission(active.id, "expenses", "CREATE");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const expense = await confirmVoiceAction({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      action: parsed.data.action,
      description: parsed.data.description,
      amount: parsed.data.amount,
    });
    return NextResponse.json({ expense });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create expense." }, { status: 400 });
  }
}

export const POST = withApiErrors(handlePOST);
