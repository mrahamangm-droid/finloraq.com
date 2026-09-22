import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPayPage } from "@/lib/stripe/invoicePayments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay invoice", robots: { index: false, follow: false } };

function money(amount: string, currency: string) {
  const n = Number(amount);
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${amount}`;
  }
}

/**
 * Public "Pay now" page a company shares with its customer. Deliberately
 * shows only what the payer needs: who is billing them, which invoice, and
 * how much is due. No login; the token in the URL is the credential.
 */
export default async function PayInvoicePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { paid?: string; error?: string };
}) {
  const data = await loadPayPage(params.token);
  if (!data) notFound();

  const justPaid = searchParams?.paid === "1";
  const settled = data.status === "PAID" || Number(data.balanceDue) <= 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice from</div>
        <h1 className="mt-1 text-xl font-semibold text-card-foreground">{data.companyName}</h1>

        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Invoice</dt><dd className="font-medium text-card-foreground">{data.invoiceNumber}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Billed to</dt><dd className="text-card-foreground">{data.customerName}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Due</dt><dd className="text-card-foreground">{data.dueDate.toISOString().slice(0, 10)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Invoice total</dt><dd className="tabular-nums text-card-foreground">{money(data.total, data.currency)}</dd></div>
        </dl>

        <div className="mt-6 rounded-lg bg-muted px-4 py-3">
          <div className="text-xs text-muted-foreground">{settled ? "Status" : "Amount due"}</div>
          <div className="text-2xl font-bold tabular-nums text-card-foreground">
            {settled ? "Paid in full" : money(data.balanceDue, data.currency)}
          </div>
        </div>

        {justPaid && (
          <p className="mt-4 rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-950/30 dark:text-green-300">
            Thank you — your payment was received. {data.companyName} will see it right away; a receipt was sent by Stripe.
          </p>
        )}
        {searchParams?.error && !settled && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {searchParams.error === "unavailable"
              ? "Online payment isn't available for this invoice right now."
              : "The payment couldn't be started. Please try again in a moment."}
          </p>
        )}

        {!settled && !justPaid && (
          data.payable ? (
            <form method="post" action={`/api/pay/${params.token}/checkout`} className="mt-6">
              <button type="submit" className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
                Pay {money(data.balanceDue, data.currency)} by card
              </button>
              <p className="mt-2 text-center text-xs text-muted-foreground">Secure payment by Stripe. Card details never touch {data.companyName} or Finloraq.</p>
            </form>
          ) : (
            <p className="mt-6 text-center text-sm text-muted-foreground">Online payment isn&apos;t available for this invoice. Please contact {data.companyName}.</p>
          )
        )}

        <p className="mt-8 text-center text-[11px] text-muted-foreground">Powered by Finloraq</p>
      </div>
    </main>
  );
}
