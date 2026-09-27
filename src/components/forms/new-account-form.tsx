"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

export function NewAccountForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof ACCOUNT_TYPES)[number]>("EXPENSE");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, type }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setCode("");
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-lg border border-border bg-card p-4">
      <input required placeholder="Code (e.g. 5100)" value={code} onChange={(e) => setCode(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <input required placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
        {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
      </select>
      <button type="submit" disabled={loading} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Adding…" : "Add account"}
      </button>
      {error && <p className="col-span-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
