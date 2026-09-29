import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { markActivityDone } from "@/lib/crm";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "EDIT");

  const activity = await markActivityDone(active.companyId, id);
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(activity);
}
