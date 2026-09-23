"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewProjectForm({ customers }: { customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        code,
        customerId: customerId || undefined,
        budget: budget ? parseFloat(budget) : undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setName("");
    setCode("");
    setBudget("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 rounded-lg border border-border bg-card p-4">
      <input required placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <input required placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
        <option value="">No customer</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input type="number" step="0.01" placeholder="Budget (optional)" value={budget} onChange={(e) => setBudget(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <button type="submit" disabled={loading} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Adding…" : "Add project"}
      </button>
      {error && <p className="col-span-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
