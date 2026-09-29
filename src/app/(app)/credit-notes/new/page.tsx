import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { NewCreditNoteForm } from "@/components/forms/new-credit-note-form";

export default async function NewCreditNotePage({
  searchParams,
}: {
  searchParams?: Promise<{ invoiceId?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "credit_notes", "CREATE");

  const [customers, taxCodes, invoices] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId: active.companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true },
    }),
    prisma.taxCode.findMany({
      where: { companyId: active.companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, rate: true },
    }),
    prisma.invoice.findMany({
      where: {
        companyId: active.companyId,
        status: { in: ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
      },
      orderBy: { issueDate: "desc" },
      select: { id: true, invoiceNumber: true, customerId: true, currency: true, exchangeRate: true },
      take: 100,
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">New Credit Note</h1>
      <NewCreditNoteForm
        baseCurrency={active.company.baseCurrency}
        customers={customers.map((c: any) => ({ id: c.id, name: c.name, currency: c.currency ?? "USD" }))}
        taxCodes={taxCodes.map((t: any) => ({ id: t.id, name: t.name, rate: t.rate.toNumber() }))}
        invoices={invoices.map((i: any) => ({ ...i, exchangeRate: i.exchangeRate.toNumber() }))}
        initialInvoiceId={sp.invoiceId}
      />
    </div>
  );
}
