"use client";

import { useState } from "react";

export function ConnectStripeButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/payments/connect", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.url !== "string") {
      setLoading(false);
      setError(data.error ?? "Could not start Stripe onboarding.");
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <div className="space-y-2">
      <button
        onClick={connect}
        disabled={loading}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? "Opening Stripe…" : label}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
