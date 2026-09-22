"use client";

import { useState } from "react";

/** Opens Stripe's billing portal (cards, receipts, cancel). */
export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.url !== "string") {
      setLoading(false);
      setError(data.error ?? "Could not open billing.");
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={open}
        disabled={loading}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
      >
        {loading ? "Opening…" : "Manage billing & receipts"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
