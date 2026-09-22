"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BillActions({ billId, status, balanceDue }: { billId: string; status: string; balanceDue: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState(balanceDue.toFixed(2));

  async function approve() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/bills/${billId}/approve`, { method: "POST" });
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
    const res = await fetch(`/api/bills/${billId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parseFloat(amount) }),
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
      {status === "DRAFT" && (
        <button onClick={approve} disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Approving…" : "Approve & Post to Ledger"}
        </button>
      )}

      {["APPROVED", "PARTIALLY_PAID", "OVERDUE"].includes(status) && (
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-card-foreground">Payment amount</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <button onClick={recordPayment} disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {loading ? "Recording…" : "Record Payment"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
