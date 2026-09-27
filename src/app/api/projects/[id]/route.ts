import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { deleteProject, updateProject, ProjectValidationError } from "@/lib/projects";
import { ForbiddenError } from "@/lib/rbac";
import { PartyInUseError } from "@/lib/parties";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  customerId: z.string().nullable().optional(),
  budget: z.number().nullable().optional(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const project = await updateProject({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      projectId: params.id,
      ...parsed.data,
    });
    return NextResponse.json({ id: project.id });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Only a company admin can do this." }, { status: 403 });
    }
    if (err instanceof ProjectValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  try {
    await deleteProject({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      projectId: params.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Only a company admin can do this." }, { status: 403 });
    }
    if (err instanceof PartyInUseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
