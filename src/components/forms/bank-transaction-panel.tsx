"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MathInput } from "@/components/forms/math-input";

type Txn = { id: string; date: string; description: string; amount: number; status: string };
type Suggestion = { entryNumber: string; date: string; memo: string | null };

export function BankTransactionPanel({
  bankAccountId,
  transactions,
  suggestions = {},
  canEdit = true,
  canDelete = true,
}: {
  bankAccountId: string;
  transactions: Txn[];
  suggestions?: Record<string, Suggestion[]>;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [entryNumbers, setEntryNumbers] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");

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

  async function match(txnId: string, entryNumber?: string) {
    setLoading(txnId);
    setError(null);
    const res = await fetch(`/api/bank-transactions/${txnId}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryNumber: entryNumber ?? entryNumbers[txnId] ?? "" }),
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  async function unmatch(txnId: string) {
    if (!window.confirm("Un-match this transaction? It goes back to Unmatched so it can be matched to the right journal entry.")) return;
    setLoading(txnId);
    setError(null);
    const res = await fetch(`/api/bank-transactions/${txnId}/match`, { method: "DELETE" });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  function startEdit(t: Txn) {
    setEditingId(t.id);
    setEditDate(t.date);
    setEditDescription(t.description);
    setEditAmount(String(t.amount));
    setError(null);
  }

  async function saveEdit(txnId: string) {
    setLoading(txnId);
    setError(null);
    const res = await fetch(`/api/bank-transactions/${txnId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: editDate, description: editDescription, amount: parseFloat(editAmount) }),
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function remove(txnId: string) {
    if (!window.confirm("Delete this transaction? This can't be undone.")) return;
    setLoading(txnId);
    setError(null);
    const res = await fetch(`/api/bank-transactions/${txnId}`, { method: "DELETE" });
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
      <form onSubmit={addTransaction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 rounded-lg border border-border bg-card p-4">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input required placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="sm:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <MathInput required decimals={2} placeholder="Amount (+ in / − out)" value={amount} onChange={setAmount} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <button type="submit" disabled={loading === "add"} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          Add
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Match to journal entry #</th>
                {(canEdit || canDelete) && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 && (
                <tr><td colSpan={5 + (canEdit || canDelete ? 1 : 0)} className="px-4 py-8 text-center text-muted-foreground">No transactions yet.</td></tr>
              )}
              {transactions.map((t) =>
                editingId === t.id ? (
                  <tr key={t.id} className="border-b border-border bg-muted/20 last:border-0">
                    <td colSpan={5 + (canEdit || canDelete ? 1 : 0)} className="px-4 py-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                        <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-sm" />
                        <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Description" className="rounded border border-border bg-background px-2 py-1 text-sm" />
                        <MathInput decimals={2} value={editAmount} onChange={setEditAmount} placeholder="Amount" className="rounded border border-border bg-background px-2 py-1 text-sm" />
                        <div className="flex items-center gap-3">
                          <button onClick={() => saveEdit(t.id)} disabled={loading === t.id} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs font-medium text-muted-foreground hover:underline">Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{t.date}</td>
                    <td className="px-4 py-2 text-card-foreground">{t.description}</td>
                    <td className={`px-4 py-2 text-right ${t.amount < 0 ? "text-destructive" : "text-success"}`}>{t.amount.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t.status}</span>
                    </td>
                    <td className="px-4 py-2">
                      {t.status === "UNMATCHED" ? (
                        <div className="space-y-1.5">
                        {(suggestions[t.id] ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5" aria-label="Suggested matches">
                            {suggestions[t.id]!.map((s) => (
                              <button
                                key={s.entryNumber}
                                onClick={() => match(t.id, s.entryNumber)}
                                disabled={loading === t.id}
                                title={`Match to ${s.entryNumber}${s.memo ? ` — ${s.memo}` : ""} (${s.date})`}
                                className="max-w-[16rem] truncate rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs text-foreground hover:bg-primary/10 disabled:opacity-50"
                              >
                                Match {s.entryNumber} · {s.date.slice(5)}{s.memo ? ` · ${s.memo}` : ""}
                              </button>
                            ))}
                          </div>
                        )}
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
                        </div>
                      ) : t.status === "MATCHED" && canEdit ? (
                        <button onClick={() => unmatch(t.id)} disabled={loading === t.id} className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
                          Un-match
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-2">
                        {t.status === "UNMATCHED" ? (
                          <div className="flex items-center justify-end gap-3">
                            {canEdit && <button onClick={() => startEdit(t)} className="text-xs font-medium text-foreground hover:underline">Edit</button>}
                            {canDelete && <button onClick={() => remove(t.id)} disabled={loading === t.id} className="text-xs font-medium text-destructive hover:underline disabled:opacity-50">Delete</button>}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button onClick={reconcile} disabled={loading === "reconcile" || matchedCount === 0} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
        {loading === "reconcile" ? "Reconciling…" : `Reconcile ${matchedCount} matched transaction(s)`}
      </button>
    </div>
  );
}
