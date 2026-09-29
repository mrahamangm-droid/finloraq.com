import { NextResponse } from "next/server";
import { pageParams, withApiErrors } from "@/lib/apiHandler";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { createDeal, listDeals, getOrCreateDefaultPipeline } from "@/lib/crm";
import { z } from "zod";

const CreateDealSchema = z.object({
  name:              z.string().min(1),
  value:             z.number().min(0),
  currency:          z.string().length(3).optional(),
  pipelineId:        z.string().optional(), // defaults to company default pipeline
  stageId:           z.string().optional(), // defaults to first stage of pipeline
  customerId:        z.string().optional().nullable(),
  contactId:         z.string().optional().nullable(),
  assignedToId:      z.string().optional().nullable(),
  expectedCloseDate: z.string().datetime().optional().nullable(),
  notes:             z.string().optional().nullable(),
});

async function handleGET(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const url = new URL(req.url);
  const pipelineId   = url.searchParams.get("pipelineId")   ?? undefined;
  const stageId      = url.searchParams.get("stageId")      ?? undefined;
  const assignedToId = url.searchParams.get("assignedToId") ?? undefined;
  const openParam    = url.searchParams.get("open");
  const open         = openParam === "true" ? true : openParam === "false" ? false : undefined;
  const { page, limit } = pageParams(url);

  const result = await listDeals(active.companyId, { pipelineId, stageId, assignedToId, open, page, limit });
  return NextResponse.json(result);
}

async function handlePOST(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "CREATE");

  const body = await req.json();
  const parsed = CreateDealSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Resolve pipelineId + stageId if not supplied
  let { pipelineId, stageId, ...rest } = parsed.data;
  if (!pipelineId || !stageId) {
    const pipeline = await getOrCreateDefaultPipeline(active.companyId);
    pipelineId = pipelineId ?? pipeline.id;
    if (!stageId) {
      const firstStage = pipeline.stages[0];
      if (!firstStage) return NextResponse.json({ error: "Pipeline has no stages" }, { status: 422 });
      stageId = firstStage.id;
    }
  }

  const deal = await createDeal(active.companyId, active.id, {
    pipelineId: pipelineId!,
    stageId: stageId!,
    ...rest,
    expectedCloseDate: rest.expectedCloseDate ? new Date(rest.expectedCloseDate) : null,
  });
  return NextResponse.json(deal, { status: 201 });
}

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);
