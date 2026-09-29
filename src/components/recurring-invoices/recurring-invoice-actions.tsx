"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RecurringStatus = "ACTIVE" | "PAUSED" | "ENDED";

interface RecurringInvoiceActionsProps {
  ri: { id: string; status: RecurringStatus };
  canEdit: boolean;
  canDelete: boolean;
  hasInvoices: boolean;
}

export function RecurringInvoiceActions({ ri, canEdit, canDelete, hasInvoices }: RecurringInvoiceActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: RecurringStatus) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/recurring-invoices/${ri.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to update.");
      return;
    }
    router.refresh();
  }

  async function deleteRI() {
    if (!confirm("Delete this recurring invoice schedule? This cannot be undone.")) return;
    setLoading(true);
    const res = await fetch(`/api/recurring-invoices/${ri.id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Delete failed.");
      return;
    }
    router.push("/recurring-invoices");
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {canEdit && ri.status === "ACTIVE" && (
        <button
          onClick={() => setStatus("PAUSED")}
          disabled={loading}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Pause
        </button>
      )}

      {canEdit && ri.status === "PAUSED" && (
        <button
          onClick={() => setStatus("ACTIVE")}
          disabled={loading}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Resume
        </button>
      )}

      {canDelete && !hasInvoices && ri.status !== "ENDED" && (
        <button
          onClick={deleteRI}
          disabled={loading}
          className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50"
        >
          Delete
        </button>
      )}
    </div>
  );
}
