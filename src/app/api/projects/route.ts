import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createProject } from "@/lib/projects";

const schema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  customerId: z.string().optional(),
  budget: z.number().optional(),
});

async function handlePOST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const project = await createProject({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    name: parsed.data.name,
    code: parsed.data.code,
    customerId: parsed.data.customerId,
    budget: parsed.data.budget,
  });

  return NextResponse.json({ id: project.id });
}

export const POST = withApiErrors(handlePOST);
