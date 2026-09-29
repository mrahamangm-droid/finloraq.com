import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { listRecurringInvoices, createRecurringInvoice } from "@/lib/recurring-invoices";

export async function GET() {
  try {
    const { active } = await requireTenantContext();
    const items = await listRecurringInvoices(active.companyId, active.id);
    return NextResponse.json(items);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { active, userId } = await requireTenantContext();
    const body = await req.json();
    const ri = await createRecurringInvoice({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      customerId: body.customerId,
      currency: body.currency ?? active.company.baseCurrency ?? "USD",
      frequency: body.frequency,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      notes: body.notes,
      lines: body.lines,
    });
    return NextResponse.json(ri, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
