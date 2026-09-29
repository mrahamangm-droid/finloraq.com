import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { getPipelineSummary } from "@/lib/crm";

export async function GET(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const url = new URL(req.url);
  const pipelineId = url.searchParams.get("pipelineId") ?? undefined;

  const summary = await getPipelineSummary(active.companyId, pipelineId);
  return NextResponse.json(summary);
}
