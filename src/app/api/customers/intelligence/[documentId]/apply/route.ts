import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { applyCustomerDocumentRecord } from "@/lib/ai/customer-extraction";
import { ForbiddenError } from "@/lib/rbac";

// Email/phone here are read off a document by the AI extraction step, not
// typed by a person into a form — they're a best-effort "fill this in if
// the matched/new customer doesn't have one already" suggestion, so a
// malformed value (bad OCR, an odd WhatsApp export line) shouldn't block
// the actual link/create action over an unrelated field. Format
// validation for a customer's own contact details still happens wherever
// a person directly edits a Customer record.
const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("link"),
    recordIndex: z.number().int().nonnegative(),
    customerId: z.string().min(1),
    fillEmail: z.string().min(1).max(254).optional(),
    fillPhone: z.string().min(1).max(40).optional(),
  }),
  z.object({
    kind: z.literal("create"),
    recordIndex: z.number().int().nonnegative(),
    name: z.string().min(1),
    email: z.string().min(1).max(254).optional(),
    phone: z.string().min(1).max(40).optional(),
  }),
]);

export async function POST(req: Request, { params }: { params: { documentId: string } }) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const action =
    parsed.data.kind === "link"
      ? { kind: "link" as const, customerId: parsed.data.customerId, fillEmail: parsed.data.fillEmail, fillPhone: parsed.data.fillPhone }
      : { kind: "create" as const, name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone };

  try {
    const result = await applyCustomerDocumentRecord({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      documentId: params.documentId,
      recordIndex: parsed.data.recordIndex,
      action,
    });
    return NextResponse.json(result);
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
