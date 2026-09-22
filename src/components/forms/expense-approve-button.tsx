"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ExpenseApproveButton({ journalEntryId }: { journalEntryId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/expenses/${journalEntryId}/approve`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={approve} disabled={loading} className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
        {loading ? "Approving…" : "Approve & Post"}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
