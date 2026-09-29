import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { getPipelines, getOrCreateDefaultPipeline } from "@/lib/crm";

export async function GET(_req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  // Ensure a default pipeline exists before listing
  await getOrCreateDefaultPipeline(active.companyId);
  const pipelines = await getPipelines(active.companyId);
  return NextResponse.json(pipelines);
}
