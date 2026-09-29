"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MathInput } from "@/components/forms/math-input";

export function InvoiceActions({
  invoiceId,
  status,
  balanceDue,
  canEdit = true,
  canDelete = true,
  /** Only set for a foreign-currency invoice — lets a payment be recorded
   *  at a different rate than the invoice was booked at, so the resulting
   *  gain/loss is actually recognized (see recordInvoicePayment in
   *  src/lib/sales.ts). Omitted entirely for a base-currency invoice: the
   *  rate there is always 1, not something to ask about. */
  currency,
  bookedExchangeRate,
}: {
  invoiceId: string;
  status: string;
  balanceDue: number;
  canEdit?: boolean;
  canDelete?: boolean;
  currency?: string;
  bookedExchangeRate?: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [amount, setAmount] = useState(balanceDue.toFixed(2));
  const [paymentRate, setPaymentRate] = useState(bookedExchangeRate ? String(bookedExchangeRate) : "1");
  const isForeignCurrency = Boolean(currency);

  async function remove() {
    if (!window.confirm("Delete this draft invoice? This can't be undone.")) return;
    setError(null);
    setDeleting(true);
    const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.push("/sales");
    router.refresh();
  }

  async function post() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoiceId}/post`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  async function recordPayment() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: parseFloat(amount),
        exchangeRate: isForeignCurrency ? parseFloat(paymentRate) || undefined : undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {status === "DRAFT" && (canEdit || canDelete) && (
        <div className="flex items-center gap-4">
          {canEdit && (
            <Link href={`/sales/${invoiceId}/edit`} className="text-xs font-medium text-primary hover:underline">
              Edit
            </Link>
          )}
          {canDelete && (
            <button onClick={remove} disabled={deleting} className="text-xs font-medium text-destructive hover:underline disabled:opacity-50">
              {deleting ? "Deleting…" : "Delete draft"}
            </button>
          )}
        </div>
      )}

      {status === "DRAFT" && (
        <button onClick={post} disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Posting…" : "Post to Ledger (Send Invoice)"}
        </button>
      )}

      {["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(status) && (
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-card-foreground">Payment amount {currency ? `(${currency})` : ""}</label>
            <MathInput decimals={2} value={amount} onChange={setAmount} className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          {isForeignCurrency && (
            <div>
              <label className="mb-1 block text-xs font-medium text-card-foreground">Rate today</label>
              <input type="number" step="any" min="0" value={paymentRate} onChange={(e) => setPaymentRate(e.target.value)}
                className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
          )}
          <button onClick={recordPayment} disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {loading ? "Recording…" : "Record Payment"}
          </button>
        </div>
      )}
      {isForeignCurrency && (
        <p className="text-xs text-muted-foreground">
          Booked at {bookedExchangeRate}. A different rate today books the difference as realized exchange gain/loss.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
