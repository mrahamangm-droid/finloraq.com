"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReverseButton({ journalId }: { journalId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReverse() {
    if (!confirm("Create a reversing journal entry? This zeros out this entry's ledger effect. The original entry remains immutable.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/journals/${journalId}/reverse`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Reversal failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        onClick={handleReverse}
        disabled={loading}
        className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50"
      >
        {loading ? "Reversing…" : "Reverse Entry"}
      </button>
    </div>
  );
}
