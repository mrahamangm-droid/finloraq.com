"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExpenseApproveButton } from "@/components/forms/expense-approve-button";

/**
 * Renders the row-level actions for one expense (journal entry), next to
 * its status badge on the Expenses page:
 *  - DRAFT: "Approve & Post" (existing) plus "Delete" — a draft was never
 *    posted, so removing it has no ledger impact and needs no correcting
 *    entry (see deleteDraftJournalEntry() in src/lib/ledger.ts).
 *  - POSTED: "Reverse" — posted entries are immutable by design, so this
 *    creates a correcting reversal entry (reverseJournalEntry()) rather
 *    than touching the original row.
 */
export function ExpenseRowActions({ journalEntryId, status }: { journalEntryId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteDraft() {
    if (!window.confirm("Delete this draft expense? This can't be undone.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/expenses/${journalEntryId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  async function reverse() {
    if (!window.confirm("Reverse this posted expense? This posts a correcting entry — the original stays on record.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/expenses/${journalEntryId}/reverse`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  const btn = "rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50";

  return (
    <div className="flex items-center gap-2">
      {status === "DRAFT" && (
        <>
          <ExpenseApproveButton journalEntryId={journalEntryId} />
          <button onClick={deleteDraft} disabled={loading} className={`${btn} text-destructive`}>
            {loading ? "…" : "Delete"}
          </button>
        </>
      )}
      {status === "POSTED" && (
        <button onClick={reverse} disabled={loading} className={`${btn} text-foreground`}>
          {loading ? "…" : "Reverse"}
        </button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
