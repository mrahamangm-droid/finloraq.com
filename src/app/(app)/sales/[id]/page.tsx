import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { InvoiceActions } from "@/components/forms/invoice-actions";
import { DocumentBrandHeader } from "@/components/branding/document-brand-header";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const { active } = await requireTenantContext();

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, companyId: active.companyId },
    include: { customer: true, lines: { include: { taxCode: true } } },
  });
  if (!invoice) notFound();

  const payments = await prisma.journalEntry.findMany({
    where: { companyId: active.companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${invoice.id}:` }, status: "POSTED" },
    include: { lines: { include: { account: true } } },
  });
  const paid = payments
    .flatMap((e) => e.lines.filter((l) => l.account.code === "1000"))
    .reduce((a, l) => a + l.debit.toNumber(), 0);
  const balanceDue = invoice.total.toNumber() - paid;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Invoice {invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground">{invoice.customer.name} · {invoice.status}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <DocumentBrandHeader
          companyName={active.company.name}
          logoUrl={active.company.logoUrl}
          tagline={active.company.tagline}
          brandEmail={active.company.brandEmail}
          brandPhone={active.company.brandPhone}
          brandAddress={active.company.brandAddress}
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit price</th>
                <th className="px-3 py-2">Tax</th>
                <th className="px-3 py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-card-foreground">{l.description}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{l.quantity.toString()}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{l.unitPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.taxCode?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-card-foreground">{l.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-border px-3 py-2 text-right text-sm">
          <div className="text-muted-foreground">Subtotal {invoice.subtotal.toFixed(2)}</div>
          <div className="text-muted-foreground">Tax {invoice.taxTotal.toFixed(2)}</div>
          <div className="font-medium text-card-foreground">Total {invoice.total.toFixed(2)} {invoice.currency}</div>
          {paid > 0 && <div className="text-success">Paid {paid.toFixed(2)}</div>}
          {invoice.status !== "PAID" && invoice.status !== "DRAFT" && (
            <div className="font-medium text-card-foreground">Balance due {balanceDue.toFixed(2)}</div>
          )}
        </div>
      </div>

      <InvoiceActions invoiceId={invoice.id} status={invoice.status} balanceDue={balanceDue} />
    </div>
  );
}
