"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OrderLine = { id: string; description: string; quantity: number; shippedQuantity: number; invoicedQuantity: number };

export function SalesOrderActions({
  orderId,
  status,
  lines,
  canEdit,
}: {
  orderId: string;
  status: "DRAFT" | "CONFIRMED" | "PARTIALLY_SHIPPED" | "SHIPPED" | "INVOICED" | "CANCELLED";
  lines: OrderLine[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipping, setShipping] = useState(false);
  const [shipDate, setShipDate] = useState(new Date().toISOString().slice(0, 10));
  const [shipQty, setShipQty] = useState<Record<string, string>>(
    () => Object.fromEntries(lines.map((l) => [l.id, String(l.quantity - l.shippedQuantity)]))
  );
  const [invoicing, setInvoicing] = useState(false);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));

  if (!canEdit) return null;

  async function confirmOrder() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sales-orders/${orderId}/confirm`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to confirm.");
      return;
    }
    router.refresh();
  }

  async function submitShipment() {
    setLoading(true);
    setError(null);
    const shipLines = lines
      .map((l) => ({ salesOrderLineId: l.id, quantity: parseFloat(shipQty[l.id] ?? "0") || 0 }))
      .filter((l) => l.quantity > 0);
    if (shipLines.length === 0) {
      setLoading(false);
      setError("Enter a quantity to ship on at least one line.");
      return;
    }
    const res = await fetch(`/api/sales-orders/${orderId}/ship`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shipDate, lines: shipLines }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to record shipment.");
      return;
    }
    setShipping(false);
    router.refresh();
  }

  async function submitInvoice() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sales-orders/${orderId}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to raise invoice.");
      return;
    }
    const { invoice } = await res.json();
    router.push(`/sales/${invoice.id}`);
  }

  const canShip = status === "CONFIRMED" || status === "PARTIALLY_SHIPPED";
  const invoiceableQty = lines.reduce((s, l) => s + Math.max(0, l.shippedQuantity - l.invoicedQuantity), 0);

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {status === "DRAFT" && (
          <button onClick={confirmOrder} disabled={loading} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {loading ? "Confirming…" : "Confirm Order"}
          </button>
        )}

        {canShip && !shipping && (
          <button onClick={() => setShipping(true)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            Record Shipment
          </button>
        )}

        {invoiceableQty > 0 && !invoicing && (
          <button onClick={() => setInvoicing(true)} className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-white">
            Raise Invoice
          </button>
        )}
      </div>

      {shipping && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Ship date</label>
            <input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1">Line</th>
                <th className="py-1 text-right">Remaining</th>
                <th className="w-28 py-1 text-right">Ship qty</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const remaining = l.quantity - l.shippedQuantity;
                return (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-1.5">{l.description}</td>
                    <td className="py-1.5 text-right tabular-nums">{remaining}</td>
                    <td className="py-1.5">
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        value={shipQty[l.id] ?? ""}
                        onChange={(e) => setShipQty((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        disabled={remaining <= 0}
                        className="w-full rounded border border-border bg-background px-2 py-1 text-right text-xs disabled:opacity-40"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-2">
            <button onClick={submitShipment} disabled={loading} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {loading ? "Recording…" : "Confirm Shipment"}
            </button>
            <button onClick={() => setShipping(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      {invoicing && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4">
          <label className="text-sm text-muted-foreground">Due date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm" />
          <button onClick={submitInvoice} disabled={loading} className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {loading ? "Raising…" : "Confirm"}
          </button>
          <button onClick={() => setInvoicing(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      )}
    </div>
  );
}
