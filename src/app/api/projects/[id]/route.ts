import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { deleteProject } from "@/lib/projects";
import { ForbiddenError } from "@/lib/rbac";
import { PartyInUseError } from "@/lib/parties";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
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
