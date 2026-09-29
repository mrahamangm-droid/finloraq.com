import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { VoidDocument } from "@/components/forms/void-document";
import { InvoiceActions } from "@/components/forms/invoice-actions";
import { DocumentBrandHeader } from "@/components/branding/document-brand-header";
import { fieldDefs, getFormatter } from "@/lib/customization/server";
import { displayFieldValue } from "@/lib/customization/customFields";
import { fieldValues } from "@/components/custom-fields/custom-field-inputs";
import { PaymentLinkButton } from "@/components/payments/payment-link-button";

export default async function InvoiceDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "invoices");
  if (denied) return denied;
  const company = active.company;

  const invoice = await prisma.invoice.findFirst({
    where: { id: id, companyId: active.companyId },
    include: { customer: true, lines: { include: { taxCode: true } } },
  });
  if (!invoice) notFound();

  const [payments, appliedCreditNotes] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { companyId: active.companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${invoice.id}:` }, status: "POSTED" },
      include: { lines: { include: { account: true } } },
    }),
    prisma.creditNote.findMany({
      where: { companyId: active.companyId, invoiceId: invoice.id, status: "APPLIED" },
      select: { id: true, creditNumber: true, total: true },
    }),
  ]);
  const cashPaid = payments
    .flatMap((e: any) => e.lines.filter((l: any) => l.account.code === "1000"))
    .reduce((a: any, l: any) => a + l.debit.toNumber(), 0);
  const creditApplied = appliedCreditNotes.reduce((s: number, cn: any) => s + Number(cn.total), 0);
  const paid = cashPaid + creditApplied;
  const balanceDue = invoice.total.toNumber() - paid;
  const [fmt, defs, canEdit, canDelete, canApproveJournals] = await Promise.all([
    getFormatter(userId),
    fieldDefs(active.companyId, "INVOICE"),
    can(active.id, "invoices", "EDIT"),
    can(active.id, "invoices", "DELETE"),
    can(active.id, "journals", "APPROVE"),
  ]);
  const values = fieldValues(invoice.customFields);
  // A field hidden later still shows here if this invoice already has a value for it.
  const shownFields = defs.filter((d) => d.key in values || d.required);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Invoice {invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {invoice.customer.name} · {invoice.status} · Issued {fmt.date(invoice.issueDate)} · Due {fmt.date(invoice.dueDate)}
          </p>
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

      {shownFields.length > 0 && (
        <dl className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-3">
          {shownFields.map((d) => (
            <div key={d.key}>
              <dt className="text-xs text-muted-foreground">{d.label}</dt>
              <dd className="text-card-foreground">{displayFieldValue(values[d.key])}</dd>
            </div>
          ))}
        </dl>
      )}

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
              {invoice.lines.map((l: any) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-card-foreground">{l.description}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{l.quantity.toString()}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmt.money(l.unitPrice)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.taxCode?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-card-foreground">{fmt.money(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-border px-3 py-2 text-right text-sm">
          <div className="text-muted-foreground">Subtotal {fmt.money(invoice.subtotal)}</div>
          <div className="text-muted-foreground">Tax {fmt.money(invoice.taxTotal)}</div>
          <div className="font-medium text-card-foreground">Total {fmt.money(invoice.total)} {invoice.currency}</div>
          {cashPaid > 0 && <div className="text-success">Payments received {fmt.money(cashPaid)}</div>}
          {appliedCreditNotes.map((cn: any) => (
            <div key={cn.id} className="text-success">
              Credit note <Link href={`/credit-notes/${cn.id}`} className="font-mono text-xs hover:underline">{cn.creditNumber}</Link> applied ({fmt.money(cn.total)})
            </div>
          ))}
          {paid > 0 && cashPaid > 0 && creditApplied > 0 && (
            <div className="text-success">Total cleared {fmt.money(paid)}</div>
          )}
          {invoice.status !== "PAID" && invoice.status !== "DRAFT" && (
            <div className="font-medium text-card-foreground">Balance due {fmt.money(balanceDue)}</div>
          )}
        </div>
      </div>

      {(company.invoiceTerms || company.invoiceFooter) && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
          {company.invoiceTerms && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Terms</div>
              <p className="mt-1 whitespace-pre-line text-card-foreground">{company.invoiceTerms}</p>
            </div>
          )}
          {company.invoiceFooter && <p className="whitespace-pre-line text-xs text-muted-foreground">{company.invoiceFooter}</p>}
        </div>
      )}

      <InvoiceActions
        invoiceId={invoice.id}
        status={invoice.status}
        balanceDue={balanceDue}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      {["SENT", "OVERDUE"].includes(invoice.status) && payments.length === 0 && canEdit && canApproveJournals && (
        <VoidDocument kind="invoice" id={invoice.id} />
      )}

      {["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status) && balanceDue > 0 && (
        <PaymentLinkButton invoiceId={invoice.id} />
      )}
    </div>
  );
}
