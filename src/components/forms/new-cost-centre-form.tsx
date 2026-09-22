"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewCostCentreForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/cost-centres", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setName("");
    setCode("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-card p-4">
      <input required placeholder="Cost centre name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <input required placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <button type="submit" disabled={loading} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Adding…" : "Add cost centre"}
      </button>
      {error && <p className="col-span-3 text-sm text-destructive">{error}</p>}
    </form>
  );
}
