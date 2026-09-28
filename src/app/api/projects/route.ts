import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createProject, ProjectValidationError } from "@/lib/projects";
import { ForbiddenError } from "@/lib/rbac";

const schema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  customerId: z.string().optional(),
  budget: z.number().optional(),
});

export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
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
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof ProjectValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
