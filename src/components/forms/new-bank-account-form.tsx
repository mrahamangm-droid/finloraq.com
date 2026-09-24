"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewBankAccountForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, currency, openingBalance: parseFloat(openingBalance) || 0 }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-lg border border-border bg-card p-4">
      <input required placeholder="Account name (e.g. Emirates NBD Current)" value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <input required maxLength={3} placeholder="Currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="rounded-md border border-border bg-background px-3 py-2 text-sm uppercase" />
      <input type="number" step="0.01" placeholder="Opening balance" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <button type="submit" disabled={loading} className="col-span-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Adding…" : "Add bank account"}
      </button>
      {error && <p className="col-span-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
