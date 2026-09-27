"use client";

import { useState } from "react";

/** Creates (or fetches) the invoice's shareable "Pay now" link and lets the user copy it. */
export function PaymentLinkButton({ invoiceId }: { invoiceId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function getLink() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoiceId}/payment-link`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok || typeof data.url !== "string") {
      setError(data.error ?? "Could not create a payment link.");
      return;
    }
    setUrl(data.url);
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is selectable in the input below */
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-1 text-sm font-medium text-card-foreground">Get paid online</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Share a secure link — your customer pays by card through Stripe, and the payment posts to this invoice automatically.
      </p>
      {url ? (
        <div className="flex flex-wrap gap-2">
          <input
            id={`pay-link-${invoiceId}`}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
          />
          <button onClick={copy} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : (
        <button
          onClick={getLink}
          disabled={loading}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Creating…" : "Get payment link"}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
