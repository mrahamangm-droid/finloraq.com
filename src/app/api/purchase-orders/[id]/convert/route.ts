import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { convertPOToBill } from "@/lib/purchase-orders";
import { domainErrorResponse } from "@/lib/api-errors";

const schema = z.object({ dueDate: z.string().min(1), issueDate: z.string().optional() });

/** POST /api/purchase-orders/:id/convert — raise a draft bill for everything
 *  on the PO that is billable and not yet billed. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A due date is required." }, { status: 400 });
  try {
    const bill = await convertPOToBill({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      poId: id,
      dueDate: new Date(parsed.data.dueDate),
      issueDate: parsed.data.issueDate ? new Date(parsed.data.issueDate) : undefined,
    });
    return NextResponse.json({ bill }, { status: 201 });
  } catch (err) {
    return domainErrorResponse(err);
  }
}
