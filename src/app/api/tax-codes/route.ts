import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { domainErrorResponse } from "@/lib/api-errors";
import { createTaxCode, listTaxCodes, TaxCodeValidationError } from "@/lib/taxCodes";

const TREATMENTS = ["STANDARD", "ZERO_RATED", "EXEMPT", "OUT_OF_SCOPE"] as const;

const schema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  ratePercent: z.union([z.string(), z.number()]),
  treatment: z.enum(TREATMENTS),
  isInput: z.boolean(),
});

export async function GET() {
  const { active } = await requireTenantContext();
  if (!(await can(active.id, "taxes", "VIEW"))) {
    return NextResponse.json({ error: "Missing VIEW on taxes." }, { status: 403 });
  }
  const taxCodes = await listTaxCodes(active.companyId);
  return NextResponse.json({ taxCodes: taxCodes.map((tc) => ({ ...tc, rate: tc.rate.toString() })) });
}

export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  try {
    const tc = await createTaxCode({ companyId: active.companyId, membershipId: active.id, userId, ...parsed.data });
    return NextResponse.json({ id: tc.id }, { status: 201 });
  } catch (err) {
    if (err instanceof TaxCodeValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    return domainErrorResponse(err);
  }
}
