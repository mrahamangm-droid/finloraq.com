import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { QuoteActions } from "@/components/quotes/quote-actions";

export default async function QuoteDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  await (async () => { try { return await import("@/lib/rbac").then(m => m.requirePermission(active.id, "quotes", "VIEW")); } catch { notFound(); } })();

  const quote = await prisma.quote.findFirst({
    where: { id, companyId: active.companyId },
    include: {
      customer: true,
      deal: true,
      project: true,
      invoice: true,
      salesOrder: true,
      lines: { include: { taxCode: true, product: true } },
    },
  });

  if (!quote) notFound();

  const [canEdit, canDelete] = await Promise.all([
    can(active.id, "quotes", "EDIT"),
    can(active.id, "quotes", "DELETE"),
  ]);

  const statusColor: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    SENT: "bg-blue-100 text-blue-700",
    ACCEPTED: "bg-success/10 text-success",
    REJECTED: "bg-destructive/10 text-destructive",
    EXPIRED: "bg-yellow-100 text-yellow-700",
    INVOICED: "bg-primary/10 text-primary",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/quotes" className="hover:underline">Quotes</Link>
            {" / "}
            {quote.quoteNumber}
          </p>
          <h1 className="text-xl font-semibold text-foreground">{quote.quoteNumber}</h1>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColor[quote.status] ?? ""}`}>
            {quote.status}
          </span>
        </div>
        {(canEdit || canDelete) && (
          <QuoteActions
            quote={{
              id: quote.id,
              status: quote.status,
              invoiceId: quote.invoiceId ?? null,
              salesOrderId: quote.salesOrder?.id ?? null,
            }}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        )}
      </div>

      {/* Invoice / sales order link */}
      {quote.invoiceId && quote.invoice && (
        <div className="rounded-md border border-success/30 bg-success/5 px-4 py-3 text-sm">
          Converted to invoice{" "}
          <Link href={`/sales/${quote.invoiceId}`} className="text-primary hover:underline font-mono">
            {quote.invoice.invoiceNumber}
          </Link>
        </div>
      )}
      {quote.salesOrder && (
        <div className="rounded-md border border-success/30 bg-success/5 px-4 py-3 text-sm">
          Converted to sales order{" "}
          <Link href={`/sales-orders/${quote.salesOrder.id}`} className="text-primary hover:underline font-mono">
            {quote.salesOrder.orderNumber}
          </Link>
        </div>
      )}

      {/* Meta grid */}
      <div className="rounded-md border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Customer</p>
          <p className="font-medium">{quote.customer.name}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Currency</p>
          <p className="font-medium">{quote.currency}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Issue Date</p>
          <p className="font-medium">{fmt.date(quote.issueDate)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Expiry Date</p>
          <p className="font-medium">{quote.expiryDate ? fmt.date(quote.expiryDate) : "—"}</p>
        </div>
        {quote.deal && (
          <div>
            <p className="text-muted-foreground">CRM Deal</p>
            <p className="font-medium">
              <Link href={`/crm/deals/${quote.dealId}`} className="text-primary hover:underline">
                {quote.deal.name}
              </Link>
            </p>
          </div>
        )}
        {quote.project && (
          <div>
            <p className="text-muted-foreground">Project</p>
            <p className="font-medium">{quote.project.name}</p>
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Qty</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Unit Price</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Tax</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {quote.lines.map((l: any) => (
              <tr key={l.id}>
                <td className="px-4 py-2">
                  {l.description}
                  {l.product?.trackInventory && <span className="ml-1 text-xs text-muted-foreground">(tracked)</span>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{Number(l.quantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.money(l.unitPrice)}</td>
                <td className="px-4 py-2 text-muted-foreground">{l.taxCode?.name ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt.money(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/20">
            <tr>
              <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">Subtotal</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(quote.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">Tax</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(quote.taxTotal)}</td>
            </tr>
            <tr className="font-semibold">
              <td colSpan={4} className="px-4 py-2 text-right">Total</td>
              <td className="px-4 py-2 text-right tabular-nums text-foreground">{fmt.money(quote.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Notes */}
      {quote.notes && (
        <div className="rounded-md border border-border bg-card p-4 text-sm">
          <p className="font-medium mb-1 text-muted-foreground">Notes</p>
          <p className="whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}
    </div>
  );
}
