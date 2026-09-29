"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CNStatus = "DRAFT" | "POSTED" | "APPLIED" | "VOID";

interface OpenInvoice {
  id: string;
  invoiceNumber: string;
}

interface Props {
  creditNote: { id: string; status: CNStatus; invoiceId?: string | null };
  /** Pre-populated list of open invoices for the same customer — shown when POSTED and not yet linked. */
  openInvoices?: OpenInvoice[];
}

export function CreditNoteActions({ creditNote, openInvoices = [] }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(
    creditNote.invoiceId ?? openInvoices[0]?.id ?? ""
  );

  async function postNote() {
    if (!confirm("Post this credit note to the ledger? This creates a journal entry and cannot be undone (use Void to reverse).")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/credit-notes/${creditNote.id}/post`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Post failed.");
      return;
    }
    router.refresh();
  }

  async function applyToInvoice() {
    if (!selectedInvoiceId) {
      setError("Select an invoice to apply this credit note to.");
      return;
    }
    if (!confirm("Apply this credit note to the selected invoice? This cannot be undone.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/credit-notes/${creditNote.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: selectedInvoiceId }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Apply failed.");
      return;
    }
    router.refresh();
  }

  async function voidNote() {
    if (!confirm("Void this credit note? This will create a reversing journal entry if it has been posted.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/credit-notes/${creditNote.id}/void`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Void failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        {creditNote.status === "DRAFT" && (
          <button onClick={postNote} disabled={loading}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {loading ? "Posting…" : "Post to Ledger"}
          </button>
        )}

        {creditNote.status === "POSTED" && openInvoices.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={selectedInvoiceId}
              onChange={e => setSelectedInvoiceId(e.target.value)}
              disabled={loading}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {openInvoices.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.invoiceNumber}</option>
              ))}
            </select>
            <button onClick={applyToInvoice} disabled={loading || !selectedInvoiceId}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {loading ? "Applying…" : "Apply to Invoice"}
            </button>
          </div>
        )}

        {creditNote.status === "POSTED" && openInvoices.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No open invoices for this customer to apply against.
          </p>
        )}

        {(creditNote.status === "DRAFT" || creditNote.status === "POSTED") && (
          <button onClick={voidNote} disabled={loading}
            className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50">
            {loading ? "Voiding…" : "Void"}
          </button>
        )}
      </div>
    </div>
  );
}
