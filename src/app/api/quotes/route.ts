import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { listQuotes, createQuote } from "@/lib/quotes";

export async function GET(_req: NextRequest) {
  try {
    const { active, userId } = await requireTenantContext();
    const quotes = await listQuotes(active.companyId, active.id);
    return NextResponse.json({ quotes });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    const status = msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { active, userId } = await requireTenantContext();
    const body = await req.json();

    const quote = await createQuote({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      customerId: body.customerId,
      dealId: body.dealId,
      projectId: body.projectId,
      issueDate: new Date(body.issueDate),
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
      currency: body.currency ?? "USD",
      notes: body.notes,
      lines: body.lines ?? [],
    });

    return NextResponse.json({ quote }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    const status = msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
