import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { domainErrorResponse } from "@/lib/api-errors";
import { deleteTaxCode, updateTaxCode, TaxCodeInUseError, TaxCodeValidationError } from "@/lib/taxCodes";

const TREATMENTS = ["STANDARD", "ZERO_RATED", "EXEMPT", "OUT_OF_SCOPE"] as const;

const patchSchema = z.object({
  code: z.string().min(1).max(32).optional(),
  name: z.string().min(1).max(120).optional(),
  ratePercent: z.union([z.string(), z.number()]).optional(),
  treatment: z.enum(TREATMENTS).optional(),
  isInput: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

function errorResponse(err: unknown) {
  if (err instanceof TaxCodeValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof TaxCodeInUseError) return NextResponse.json({ error: err.message }, { status: 409 });
  return domainErrorResponse(err);
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  try {
    const tc = await updateTaxCode({ companyId: active.companyId, membershipId: active.id, userId, taxCodeId: id, ...parsed.data });
    return NextResponse.json({ id: tc.id });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  try {
    await deleteTaxCode({ companyId: active.companyId, membershipId: active.id, userId, taxCodeId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
