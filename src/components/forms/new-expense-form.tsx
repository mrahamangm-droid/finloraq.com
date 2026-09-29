"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MathInput } from "@/components/forms/math-input";

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
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 rounded-lg border border-border bg-card p-4">
      <input type="date" aria-label="Expense date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <input required aria-label="Description" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="sm:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <MathInput required aria-label="Amount" decimals={2} placeholder="Amount (e.g. 100+50)" value={amount} onChange={setAmount} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <MathInput aria-label="Tax amount (optional)" decimals={2} placeholder="Tax (optional)" value={taxAmount} onChange={setTaxAmount} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <button type="submit" disabled={loading} className="col-span-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Submitting…" : "Submit Expense (Draft)"}
      </button>
      {error && <p className="col-span-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
