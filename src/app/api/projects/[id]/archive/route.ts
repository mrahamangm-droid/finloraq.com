import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { setProjectActive } from "@/lib/projects";
import { ForbiddenError } from "@/lib/rbac";

const schema = z.object({ isActive: z.boolean() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const project = await setProjectActive({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      projectId: params.id,
      isActive: parsed.data.isActive,
    });
    return NextResponse.json({ id: project.id, isActive: project.isActive });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Only a company admin can do this." }, { status: 403 });
    }
    throw err;
  }
}
