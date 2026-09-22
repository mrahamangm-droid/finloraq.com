"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewExpenseForm() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        description,
        amount: parseFloat(amount),
        taxAmount: taxAmount ? parseFloat(taxAmount) : undefined,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setDescription("");
    setAmount("");
    setTaxAmount("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-5 gap-3 rounded-lg border border-border bg-card p-4">
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <input required placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <input required type="number" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <input type="number" step="0.01" placeholder="Tax (optional)" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <button type="submit" disabled={loading} className="col-span-5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Submitting…" : "Submit Expense (Draft)"}
      </button>
      {error && <p className="col-span-5 text-sm text-destructive">{error}</p>}
    </form>
  );
}
