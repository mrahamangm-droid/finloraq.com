import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { CreditNoteActions } from "@/components/credit-notes/credit-note-actions";

export default async function CreditNoteDetailPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  try {
    const { requirePermission } = await import("@/lib/rbac");
    await requirePermission(active.id, "credit_notes", "VIEW");
  } catch { notFound(); }

  const cn = await prisma.creditNote.findFirst({
    where: { id, companyId: active.companyId },
    include: {
      customer: true,
      invoice: true,
      journalEntry: true,
      lines: { include: { taxCode: true } },
    },
  });

  if (!cn) notFound();

  const [canEdit, openInvoices] = await Promise.all([
    can(active.id, "credit_notes", "EDIT"),
    // Fetch open invoices for this customer when the credit note is POSTED
    // (to show in Apply action) — same currency only, since
    // applyCreditNoteToInvoice (src/lib/credit-notes.ts) refuses to apply
    // a credit note to an invoice in a different currency.
    cn.status === "POSTED"
      ? prisma.invoice.findMany({
          where: {
            companyId: active.companyId,
            customerId: cn.customerId,
            currency: cn.currency,
            status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
          },
          select: { id: true, invoiceNumber: true },
          orderBy: { issueDate: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  const statusColor: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    POSTED: "bg-blue-100 text-blue-700",
    APPLIED: "bg-success/10 text-success",
    VOID: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/credit-notes" className="hover:underline">Credit Notes</Link>
            {" / "}
            {cn.creditNumber}
          </p>
          <h1 className="text-xl font-semibold text-foreground">{cn.creditNumber}</h1>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColor[cn.status] ?? ""}`}>
            {cn.status}
          </span>
        </div>
        {canEdit && (
          <CreditNoteActions
            creditNote={{ id: cn.id, status: cn.status as "DRAFT" | "POSTED" | "APPLIED" | "VOID", invoiceId: cn.invoiceId }}
            openInvoices={openInvoices as { id: string; invoiceNumber: string }[]}
          />
        )}
      </div>

      {/* Journal entry link */}
      {cn.journalEntry && (
        <div className="rounded-md border border-border bg-muted/20 px-4 py-2 text-sm text-muted-foreground">
          Ledger entry: <span className="font-mono text-foreground">{cn.journalEntry.entryNumber}</span>
        </div>
      )}

      <div className="rounded-md border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Customer</p>
          <p className="font-medium">{cn.customer.name}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Currency</p>
          <p className="font-medium">
            {cn.currency}
            {cn.currency !== active.company.baseCurrency && (
              <span className="ml-1 font-normal text-muted-foreground">
                (1 {cn.currency} = {cn.exchangeRate.toString()} {active.company.baseCurrency})
              </span>
            )}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Issue Date</p>
          <p className="font-medium">{fmt.date(cn.issueDate)}</p>
        </div>
        {cn.invoice && (
          <div>
            <p className="text-muted-foreground">Related Invoice</p>
            <p className="font-medium">
              <Link href={`/sales/${cn.invoiceId}`} className="text-primary hover:underline font-mono">
                {cn.invoice.invoiceNumber}
              </Link>
            </p>
          </div>
        )}
        {cn.reason && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Reason</p>
            <p className="font-medium">{cn.reason}</p>
          </div>
        )}
      </div>

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
            {cn.lines.map((l: any) => (
              <tr key={l.id}>
                <td className="px-4 py-2">{l.description}</td>
                <td className="px-4 py-2 text-right tabular-nums">{Number(l.quantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.money(l.unitPrice)}</td>
                <td className="px-4 py-2 text-muted-foreground">{l.taxCode?.name ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.money(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/20">
            <tr>
              <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">Subtotal</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(cn.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">Tax</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(cn.taxTotal)}</td>
            </tr>
            <tr className="font-semibold text-destructive">
              <td colSpan={4} className="px-4 py-2 text-right">Credit Total</td>
              <td className="px-4 py-2 text-right tabular-nums">({fmt.money(cn.total)})</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
