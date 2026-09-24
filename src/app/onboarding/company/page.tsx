"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CompanyOnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", countryCode: "AE", baseCurrency: "AED" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-card-foreground">Set up your company</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          This creates your workspace, a starter chart of accounts, and (for the UAE) your VAT
          codes. You can add branches, departments and more companies later.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-card-foreground">Company name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-card-foreground">Country</label>
              <select
                value={form.countryCode}
                onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
              >
                <option value="AE">United Arab Emirates</option>
                <option value="SA">Saudi Arabia</option>
                <option value="GB">United Kingdom</option>
                <option value="US">United States</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-card-foreground">Base currency</label>
              <input
                required
                maxLength={3}
                value={form.baseCurrency}
                onChange={(e) => setForm({ ...form, baseCurrency: e.target.value.toUpperCase() })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm uppercase outline-none ring-primary focus:ring-2"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create company"}
          </button>
        </form>
      </div>
    </div>
  );
}
