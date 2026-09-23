import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { getEInvoicingAdapter } from "@/lib/integrations/einvoicing";
import { prisma } from "@/lib/db";
import { planDefinition } from "@/lib/billing/plans";

async function handlePOST(_req: Request, { params }: { params: { id: string } }) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "invoices", "EXPORT"); // submitting externally is treated as an export-level action

  const subscription = await prisma.subscription.findUnique({ where: { companyId: active.companyId } });
  if (subscription && !planDefinition(subscription.plan).features.eInvoicing) {
    return NextResponse.json(
      { error: `E-invoicing isn't included in the ${planDefinition(subscription.plan).label} plan. Upgrade to Growth or higher.` },
      { status: 403 }
    );
  }

  try {
    const result = await getEInvoicingAdapter().submitInvoice({ invoiceId: params.id, companyId: active.companyId });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Submission failed." }, { status: 400 });
  }
}

export const POST = withApiErrors(handlePOST);
