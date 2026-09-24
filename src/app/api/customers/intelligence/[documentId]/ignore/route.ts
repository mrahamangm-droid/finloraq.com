import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { ignoreCustomerDocumentRecord } from "@/lib/ai/customer-extraction";
import { ForbiddenError } from "@/lib/rbac";

const schema = z.object({ recordIndex: z.number().int().nonnegative() });

export async function POST(req: Request, { params }: { params: { documentId: string } }) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    await ignoreCustomerDocumentRecord({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      documentId: params.documentId,
      recordIndex: parsed.data.recordIndex,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
