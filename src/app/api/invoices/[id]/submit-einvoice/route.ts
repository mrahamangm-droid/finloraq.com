import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { getEInvoicingAdapter } from "@/lib/integrations/einvoicing";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "invoices", "EXPORT"); // submitting externally is treated as an export-level action

  try {
    const result = await getEInvoicingAdapter().submitInvoice({ invoiceId: params.id, companyId: active.companyId });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Submission failed." }, { status: 400 });
  }
}
