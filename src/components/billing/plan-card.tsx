"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { PlanDefinition } from "@/lib/billing/plans";
import {
  BILLING_CURRENCIES,
  BILLING_CURRENCY_LABELS,
  CURRENCY_COOKIE,
  formatMoney,
  type BillingCurrency,
} from "@/lib/billing/currency";

export function PlanCard({
  def,
  isCurrent,
  canEdit,
  currency = "usd",
}: {
  def: PlanDefinition;
  isCurrent: boolean;
  canEdit: boolean;
  currency?: BillingCurrency;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEnterprise = def.plan === "ENTERPRISE";

  async function changePlan() {
    if (isEnterprise) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/billing/change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: def.plan, currency }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? "Could not change plan.");
      return;
    }
    if (typeof data.redirectUrl === "string") {
      // Stripe Checkout / Customer Portal — keep the button in its loading state while we leave.
      window.location.assign(data.redirectUrl);
      return;
    }
    setLoading(false);
    router.refresh();
  }

  const featureList: [string, boolean][] = [
    ["Document extraction (OCR)", def.features.documentExtraction],
    ["Voice commands", def.features.voiceCommands],
    ["E-invoicing", def.features.eInvoicing],
    ["Multi-company", def.features.multiCompany],
    ["API access", def.features.apiAccess],
  ];

  return (
    <div className={`flex flex-col rounded-lg border p-4 ${isCurrent ? "border-primary ring-1 ring-primary" : "border-border"} bg-card`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold text-card-foreground">{def.label}</span>
        {isCurrent && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Current</span>}
      </div>
      <div className="mb-2 text-2xl font-bold text-card-foreground">
        {isEnterprise ? "Custom" : def.monthlyPriceUsd === 0 ? "Free" : formatMoney(def.prices[currency], currency)}
        {!isEnterprise && def.monthlyPriceUsd > 0 && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
        {!isEnterprise && def.monthlyPriceUsd > 0 && (
          <div className="text-xs font-normal text-muted-foreground">Billed in {currency.toUpperCase()} · incl. VAT where applicable</div>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{def.description}</p>
      <div className="mb-3 text-xs text-muted-foreground">
        {def.seats} seats · {def.aiUsageLimitPerMonth === null ? "Unlimited" : def.aiUsageLimitPerMonth} AI actions/mo
      </div>
      <ul className="mb-4 flex-1 space-y-1 text-xs">
        {featureList.map(([label, on]) => (
          <li key={label} className={`flex items-center gap-1.5 ${on ? "text-card-foreground" : "text-muted-foreground/50 line-through"}`}>
            <Check className={`h-3 w-3 ${on ? "text-green-600" : "text-muted-foreground/30"}`} />
            {label}
          </li>
        ))}
      </ul>
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      {canEdit && !isCurrent && (
        isEnterprise ? (
          <a href="mailto:sales@finloraq.com" className="rounded-md border border-border px-3 py-1.5 text-center text-xs font-medium text-foreground hover:bg-muted">
            Contact us
          </a>
        ) : (
          <button
            onClick={changePlan}
            disabled={loading}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Processing…" : "Switch to this plan"}
          </button>
        )
      )}
    </div>
  );
}

/** Opens the Stripe Customer Portal (payment method, invoices, cancel). */
export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.redirectUrl !== "string") {
      setLoading(false);
      setError(data.error ?? "Could not open billing portal.");
      return;
    }
    window.location.assign(data.redirectUrl);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={open}
        disabled={loading}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
      >
        {loading ? "Opening…" : "Manage billing"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Picks the currency new subscriptions are charged in. Saved in a cookie shared with the homepage switcher. */
export function CurrencyPicker({ value }: { value: BillingCurrency }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Currency
      <select
        value={value}
        onChange={(e) => {
          document.cookie = `${CURRENCY_COOKIE}=${e.target.value.toUpperCase()}; Max-Age=31536000; Path=/; SameSite=Lax`;
          router.refresh();
        }}
        className="rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground"
        aria-label="Billing currency"
      >
        {BILLING_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c.toUpperCase()} — {BILLING_CURRENCY_LABELS[c]}
          </option>
        ))}
      </select>
    </label>
  );
}
