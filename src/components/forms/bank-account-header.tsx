"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Account name/currency/active-state edit, inline above its transaction
 *  panel. Kept separate from BankTransactionPanel since it edits the
 *  BankAccount row, not a transaction. */
export function BankAccountHeader({
  bankAccountId,
  name,
  currency,
  isActive,
  canEdit,
  canDelete,
}: {
  bankAccountId: string;
  name: string;
  currency: string;
  isActive: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editCurrency, setEditCurrency] = useState(currency);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(init: RequestInit) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/bank-accounts/${bankAccountId}`, init);
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function save() {
    const ok = await call({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, currency: editCurrency }),
    });
    if (ok) setEditing(false);
  }

  async function toggleActive() {
    await call({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
  }

  async function remove() {
    if (!window.confirm(`Permanently delete ${name}? Only possible while it has no transactions.`)) return;
    await call({ method: "DELETE" });
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-3">
        <input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-sm" />
        <input value={editCurrency} maxLength={3} onChange={(e) => setEditCurrency(e.target.value.toUpperCase())} className="w-16 rounded border border-border bg-background px-2 py-1 text-sm uppercase" />
        <button onClick={save} disabled={loading} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Save</button>
        <button onClick={() => setEditing(false)} className="text-xs font-medium text-muted-foreground hover:underline">Cancel</button>
        {error && <p className="w-full text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <h2 className={`text-lg font-medium ${isActive ? "text-foreground" : "text-muted-foreground line-through"}`}>
        {name} <span className="text-sm font-normal text-muted-foreground">({currency})</span>
      </h2>
      {(canEdit || canDelete) && (
        <div className="flex items-center gap-3">
          {canEdit && <button onClick={() => setEditing(true)} className="text-xs font-medium text-foreground hover:underline">Edit</button>}
          {canEdit && <button onClick={toggleActive} disabled={loading} className="text-xs font-medium text-muted-foreground hover:underline disabled:opacity-50">{isActive ? "Deactivate" : "Activate"}</button>}
          {canDelete && <button onClick={remove} disabled={loading} className="text-xs font-medium text-destructive hover:underline disabled:opacity-50">Delete</button>}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
