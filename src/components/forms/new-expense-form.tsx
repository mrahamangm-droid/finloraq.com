"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MathInput } from "@/components/forms/math-input";

export function NewExpenseForm({ baseCurrency }: { baseCurrency: string }) {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [currency, setCurrency] = useState(baseCurrency.toUpperCase());
  const [exchangeRate, setExchangeRate] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isForeignCurrency = currency.trim().toUpperCase() !== baseCurrency.trim().toUpperCase();

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
        currency,
        exchangeRate: isForeignCurrency ? parseFloat(exchangeRate) || undefined : undefined,
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
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 rounded-lg border border-border bg-card p-4">
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <input required placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="sm:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <MathInput required decimals={2} placeholder="Amount (e.g. 100+50)" value={amount} onChange={setAmount} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <MathInput decimals={2} placeholder="Tax (optional)" value={taxAmount} onChange={setTaxAmount} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="Currency"
        title="Currency" className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono uppercase" />
      {isForeignCurrency && (
        <div className="sm:col-span-2 lg:col-span-3 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-card-foreground">
              Exchange rate <span className="font-normal text-muted-foreground">(1 {currency} = ? {baseCurrency})</span>
            </label>
            <input type="number" step="any" min="0" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <p className="flex-1 pb-2 text-xs text-muted-foreground">
            No live rate lookup — enter today&apos;s rate. The ledger always posts in {baseCurrency}.
          </p>
        </div>
      )}
      <button type="submit" disabled={loading} className="col-span-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Submitting…" : "Submit Expense (Draft)"}
      </button>
      {error && <p className="col-span-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
