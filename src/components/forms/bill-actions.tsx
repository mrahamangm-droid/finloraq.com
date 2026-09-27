"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MathInput } from "@/components/forms/math-input";

export function BillActions({
  billId,
  status,
  balanceDue,
  canEdit = true,
  canDelete = true,
}: {
  billId: string;
  status: string;
  balanceDue: number;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [amount, setAmount] = useState(balanceDue.toFixed(2));

  async function remove() {
    if (!window.confirm("Delete this draft bill? This can't be undone.")) return;
    setError(null);
    setDeleting(true);
    const res = await fetch(`/api/bills/${billId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.push("/purchases");
    router.refresh();
  }

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
      {status === "DRAFT" && (canEdit || canDelete) && (
        <div className="flex items-center gap-4">
          {canEdit && (
            <Link href={`/purchases/${billId}/edit`} className="text-xs font-medium text-primary hover:underline">
              Edit
            </Link>
          )}
          {canDelete && (
            <button onClick={remove} disabled={deleting} className="text-xs font-medium text-destructive hover:underline disabled:opacity-50">
              {deleting ? "Deleting…" : "Delete draft"}
            </button>
          )}
        </div>
      )}

      {status === "DRAFT" && (
        <button onClick={approve} disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Approving…" : "Approve & Post to Ledger"}
        </button>
      )}

      {["APPROVED", "PARTIALLY_PAID", "OVERDUE"].includes(status) && (
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-card-foreground">Payment amount</label>
            <MathInput decimals={2} value={amount} onChange={setAmount} className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm" />
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
