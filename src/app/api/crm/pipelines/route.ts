import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/apiHandler";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { getPipelines, getOrCreateDefaultPipeline } from "@/lib/crm";

async function handleGET(_req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  // Ensure a default pipeline exists before listing
  await getOrCreateDefaultPipeline(active.companyId);
  const pipelines = await getPipelines(active.companyId);
  return NextResponse.json(pipelines);
}

export const GET = withApiErrors(handleGET);
