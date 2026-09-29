"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "INVOICED";

interface QuoteActionsProps {
  quote: { id: string; status: QuoteStatus; invoiceId: string | null };
  canEdit: boolean;
  canDelete: boolean;
}

export function QuoteActions({ quote, canEdit, canDelete }: QuoteActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusOptions = (
    [
      { label: "Mark as Sent", value: "SENT" as QuoteStatus },
      { label: "Mark as Accepted", value: "ACCEPTED" as QuoteStatus },
      { label: "Mark as Rejected", value: "REJECTED" as QuoteStatus },
      { label: "Mark as Expired", value: "EXPIRED" as QuoteStatus },
    ] satisfies { label: string; value: QuoteStatus }[]
  ).filter((o) => o.value !== quote.status && quote.status !== "INVOICED");

  async function setStatus(status: QuoteStatus) {
    setOpen(false);
    setLoading(true);
    const res = await fetch(`/api/quotes/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to update status.");
      return;
    }
    router.refresh();
  }

  async function convertToInvoice() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/quotes/${quote.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Conversion failed.");
      return;
    }
    const { invoice } = await res.json();
    router.push(`/sales/${invoice.id}`);
  }

  async function deleteQuote() {
    if (!confirm("Delete this draft quote?")) return;
    setLoading(true);
    const res = await fetch(`/api/quotes/${quote.id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Delete failed.");
      return;
    }
    router.push("/quotes");
  }

  return (
    <div className="flex items-center gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Convert to invoice — shown when accepted and not yet invoiced */}
      {canEdit && quote.status === "ACCEPTED" && !quote.invoiceId && (
        <>
          {convertOpen ? (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Due Date:</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm" />
              <button onClick={convertToInvoice} disabled={loading}
                className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                {loading ? "Converting…" : "Confirm"}
              </button>
              <button onClick={() => setConvertOpen(false)}
                className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConvertOpen(true)}
              className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-white">
              Convert to Invoice
            </button>
          )}
        </>
      )}

      {/* Status dropdown */}
      {canEdit && statusOptions.length > 0 && (
        <div className="relative">
          <button onClick={() => setOpen((o) => !o)} disabled={loading}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm disabled:opacity-50">
            Update Status <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 z-10 w-44 rounded-md border border-border bg-popover shadow-md py-1">
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

      {/* Delete — draft only */}
      {canDelete && quote.status === "DRAFT" && (
        <button onClick={deleteQuote} disabled={loading}
          className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50">
          Delete
        </button>
      )}
    </div>
  );
}
