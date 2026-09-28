"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Void a posted, unpaid invoice or bill. The server reverses its journal
// entry and marks it VOID; this only collects the reason.
export function VoidDocument({ kind, id }: { kind: "invoice" | "bill"; id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/${kind === "invoice" ? "invoices" : "bills"}/${id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-destructive hover:underline">
        Void {kind}
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-card-foreground">
        Voiding posts a reversing journal entry dated today and marks this {kind} as void. The original entry stays in the
        ledger. This can&apos;t be undone.
      </p>
      <label className="block text-sm font-medium text-card-foreground">
        Reason (kept in the audit log)
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={5}
          maxLength={500}
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50">
          {busy ? "Voiding…" : `Void ${kind}`}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-3 py-2 text-sm">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
