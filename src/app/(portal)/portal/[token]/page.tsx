import { notFound } from "next/navigation";
import { loadPortalPage, type PortalInvoice } from "@/lib/customer-portal";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const data = await loadPortalPage(token);
  if (!data) return { title: "Portal" };
  return { title: `${data.customer.name} — ${data.customer.companyName}` };
}

const STATUS_LABEL: Record<string, string> = {
  SENT:           "Open",
  OVERDUE:        "Overdue",
  PARTIALLY_PAID: "Partially Paid",
  PAID:           "Paid",
};

const STATUS_COLOUR: Record<string, string> = {
  SENT:           "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  OVERDUE:        "bg-destructive/10 text-destructive",
  PARTIALLY_PAID: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  PAID:           "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function dateStr(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function InvoiceTable({ invoices, currency }: { invoices: PortalInvoice[]; currency: string }) {
  if (invoices.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 text-left">Invoice</th>
            <th className="px-4 py-3 text-left">Issued</th>
            <th className="px-4 py-3 text-left">Due</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3 text-right">Balance Due</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invoices.map((inv) => (
            <tr key={inv.id} className="hover:bg-muted/20">
              <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">
                {inv.invoiceNumber}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{dateStr(inv.issueDate)}</td>
              <td className={`px-4 py-3 ${inv.status === "OVERDUE" ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                {dateStr(inv.dueDate)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_COLOUR[inv.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {STATUS_LABEL[inv.status] ?? inv.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono text-foreground">
                {money(inv.total, inv.currency ?? currency)}
              </td>
              <td className={`px-4 py-3 text-right font-mono ${inv.balanceDue > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {inv.balanceDue > 0 ? money(inv.balanceDue, inv.currency ?? currency) : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                {inv.payUrl && inv.balanceDue > 0 && (
                  <a
                    href={inv.payUrl}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Pay now
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PortalPage({ params }: Props) {
  const { token } = await params;
  const data = await loadPortalPage(token);

  if (!data) {
    notFound();
  }

  const { customer, openInvoices, paidInvoices, totalOutstanding, currency } = data;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{customer.companyName}</p>
        <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
        {customer.email && (
          <p className="text-sm text-muted-foreground">{customer.email}</p>
        )}
      </div>

      {/* Outstanding balance banner */}
      {totalOutstanding > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="text-sm font-medium text-amber-800 dark:text-amber-400">Outstanding balance</div>
          <div className="mt-1 text-3xl font-bold text-amber-900 dark:text-amber-300">
            {money(totalOutstanding, currency)}
          </div>
          {openInvoices.some((i) => i.status === "OVERDUE") && (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-500">
              Some invoices are past due — please pay at your earliest convenience.
            </p>
          )}
        </div>
      ) : openInvoices.length > 0 ? null : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="text-sm font-medium text-emerald-800 dark:text-emerald-400">Account balance</div>
          <div className="mt-1 text-3xl font-bold text-emerald-900 dark:text-emerald-300">
            {money(0, currency)}
          </div>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-500">Your account is up to date — thank you!</p>
        </div>
      )}

      {/* Open invoices */}
      {openInvoices.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Open Invoices ({openInvoices.length})
          </h2>
          <InvoiceTable invoices={openInvoices} currency={currency} />
        </div>
      )}

      {/* Paid history */}
      {paidInvoices.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Payment History
          </h2>
          <InvoiceTable invoices={paidInvoices} currency={currency} />
        </div>
      )}

      {/* Empty state */}
      {openInvoices.length === 0 && paidInvoices.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">No invoices on this account yet.</p>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        This page is private to you. Contact {customer.companyName} if you have any questions.
      </p>
    </div>
  );
}
