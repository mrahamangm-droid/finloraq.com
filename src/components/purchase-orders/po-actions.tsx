"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

type POStatus = "DRAFT" | "SENT" | "ACKNOWLEDGED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "BILLED" | "CANCELLED";

type POLine = { id: string; description: string; quantity: number; receivedQuantity: number };

interface POActionsProps {
  po: { id: string; status: POStatus };
  lines: POLine[];
  /** Total quantity billable right now (computed server-side with the same
   *  rule convertPOToBill applies). */
  billableQty: number;
  /** True once anything has been received or billed — the status then
   *  follows receives/bills and can't be set by hand. */
  fulfilmentStarted: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canCreateBill: boolean;
}

export function POActions({ po, lines, billableQty, fulfilmentStarted, canEdit, canDelete, canCreateBill }: POActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [receiveDate, setReceiveDate] = useState(today);
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>(
    () => Object.fromEntries(lines.map((l) => [l.id, String(Math.max(0, l.quantity - l.receivedQuantity))]))
  );
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closed = po.status === "CANCELLED" || po.status === "BILLED";
  const statusOptions = (
    [
      { label: "Mark as Sent", value: "SENT" as POStatus },
      { label: "Mark as Acknowledged", value: "ACKNOWLEDGED" as POStatus },
      { label: "Cancel PO", value: "CANCELLED" as POStatus },
    ] satisfies { label: string; value: POStatus }[]
  ).filter((o) => o.value !== po.status && !closed && !fulfilmentStarted);

  const outstanding = lines.some((l) => l.quantity - l.receivedQuantity > 0);
  const canReceive = canEdit && outstanding && !["DRAFT", "CANCELLED", "BILLED"].includes(po.status);

  async function call(url: string, init: RequestInit, fallback: string) {
    setLoading(true);
    setError(null);
    const res = await fetch(url, init);
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? fallback);
      return null;
    }
    return res.json().catch(() => ({}));
  }

  async function setStatus(status: POStatus) {
    setOpen(false);
    const ok = await call(`/api/purchase-orders/${po.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }, "Failed to update status.");
    if (ok) router.refresh();
  }

  async function submitReceive() {
    const receiveLines = lines
      .map((l) => ({ purchaseOrderLineId: l.id, quantity: parseFloat(receiveQty[l.id] ?? "0") || 0 }))
      .filter((l) => l.quantity > 0);
    if (receiveLines.length === 0) {
      setError("Enter a quantity received on at least one line.");
      return;
    }
    const ok = await call(`/api/purchase-orders/${po.id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiveDate, notes: receiveNotes || undefined, lines: receiveLines }),
    }, "Failed to record the receive.");
    if (ok) {
      setReceiving(false);
      router.refresh();
    }
  }

  async function convertToBill() {
    const data = await call(`/api/purchase-orders/${po.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate }),
    }, "Conversion failed.");
    if (data?.bill) router.push(`/purchases/${data.bill.id}`);
  }

  async function deletePO() {
    if (!confirm("Delete this draft purchase order?")) return;
    const ok = await call(`/api/purchase-orders/${po.id}`, { method: "DELETE" }, "Delete failed.");
    if (ok) router.push("/purchase-orders");
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {canReceive && !receiving && (
          <button onClick={() => setReceiving(true)} disabled={loading}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Receive Goods
          </button>
        )}

        {canEdit && canCreateBill && billableQty > 0 && po.status !== "DRAFT" && po.status !== "CANCELLED" && (
          convertOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-muted-foreground" htmlFor="po-bill-due">Bill due</label>
              <input id="po-bill-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm" />
              <button onClick={convertToBill} disabled={loading}
                className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                {loading ? "Creating…" : "Create Bill"}
              </button>
              <button onClick={() => setConvertOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConvertOpen(true)}
              className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-white">
              Convert to Bill
            </button>
          )
        )}

        {canEdit && statusOptions.length > 0 && (
          <div className="relative">
            <button onClick={() => setOpen((o) => !o)} disabled={loading}
              className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm disabled:opacity-50">
              Update Status <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {open && (
              <div className="absolute right-0 top-full mt-1 z-10 w-48 rounded-md border border-border bg-popover shadow-md py-1">
                {statusOptions.map((o) => (
                  <button key={o.value} onClick={() => setStatus(o.value)}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted">
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {canDelete && po.status === "DRAFT" && (
          <button onClick={deletePO} disabled={loading}
            className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50">
            Delete
          </button>
        )}
      </div>

      {receiving && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="po-receive-date">Received on</label>
            <input id="po-receive-date" type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1">Line</th>
                  <th className="py-1 text-right">Outstanding</th>
                  <th className="w-28 py-1 text-right">Receive qty</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const remaining = Math.max(0, l.quantity - l.receivedQuantity);
                  return (
                    <tr key={l.id} className="border-t border-border">
                      <td className="py-1.5">{l.description}</td>
                      <td className="py-1.5 text-right tabular-nums">{remaining}</td>
                      <td className="py-1.5">
                        <input type="number" min={0} max={remaining} step="any" aria-label={`Receive quantity for ${l.description}`}
                          value={receiveQty[l.id] ?? ""}
                          onChange={(e) => setReceiveQty((prev) => ({ ...prev, [l.id]: e.target.value }))}
                          disabled={remaining <= 0}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-right text-xs disabled:opacity-40" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <textarea value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} rows={2}
            placeholder="Notes (delivery note number, condition…)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setReceiving(false)} className="rounded-md border border-border px-3 py-1.5 text-sm">Cancel</button>
            <button onClick={submitReceive} disabled={loading}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {loading ? "Saving…" : "Record Receive"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
