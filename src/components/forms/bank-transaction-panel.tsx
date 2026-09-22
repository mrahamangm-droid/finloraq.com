"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Txn = { id: string; date: string; description: string; amount: number; status: string };

export function BankTransactionPanel({ bankAccountId, transactions }: { bankAccountId: string; transactions: Txn[] }) {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [entryNumbers, setEntryNumbers] = useState<Record<string, string>>({});

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault();
    setLoading("add");
    setError(null);
    const res = await fetch(`/api/bank-accounts/${bankAccountId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, description, amount: parseFloat(amount) }),
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setDescription("");
    setAmount("");
    router.refresh();
  }

  async function match(txnId: string) {
    setLoading(txnId);
    setError(null);
    const res = await fetch(`/api/bank-transactions/${txnId}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryNumber: entryNumbers[txnId] ?? "" }),
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  async function reconcile() {
    setLoading("reconcile");
    setError(null);
    const res = await fetch(`/api/bank-accounts/${bankAccountId}/reconcile`, { method: "POST" });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  const matchedCount = transactions.filter((t) => t.status === "MATCHED").length;

  return (
    <div className="space-y-4">
      <form onSubmit={addTransaction} className="grid grid-cols-5 gap-3 rounded-lg border border-border bg-card p-4">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input required placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input required type="number" step="0.01" placeholder="Amount (+ in / − out)" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <button type="submit" disabled={loading === "add"} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          Add
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Match to journal entry #</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No transactions yet.</td></tr>
            )}
            {transactions.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-muted-foreground">{t.date}</td>
                <td className="px-4 py-2 text-card-foreground">{t.description}</td>
                <td className={`px-4 py-2 text-right ${t.amount < 0 ? "text-destructive" : "text-success"}`}>{t.amount.toFixed(2)}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t.status}</span>
                </td>
                <td className="px-4 py-2">
                  {t.status === "UNMATCHED" ? (
                    <div className="flex gap-2">
                      <input
                        placeholder="JE-000123"
                        value={entryNumbers[t.id] ?? ""}
                        onChange={(e) => setEntryNumbers((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        className="w-28 rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                      />
                      <button onClick={() => match(t.id)} disabled={loading === t.id} className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
                        Match
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button onClick={reconcile} disabled={loading === "reconcile" || matchedCount === 0} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
        {loading === "reconcile" ? "Reconciling…" : `Reconcile ${matchedCount} matched transaction(s)`}
      </button>
    </div>
  );
}
