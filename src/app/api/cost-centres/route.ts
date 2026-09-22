import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createCostCentre } from "@/lib/costCentres";

const schema = z.object({ name: z.string().min(1), code: z.string().min(1) });

export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const costCentre = await createCostCentre({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    name: parsed.data.name,
    code: parsed.data.code,
  });

  return NextResponse.json({ id: costCentre.id });
}
