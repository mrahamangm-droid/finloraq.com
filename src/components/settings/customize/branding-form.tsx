"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveBrandingAction } from "@/app/(app)/settings/customize-actions";
import { SaveStatus } from "./settings-tabs";

interface Props {
  canEdit: boolean;
  companyName: string;
  initial: { brandColor: string | null; invoiceFooter: string | null; invoiceTerms: string | null; logoUrl: string | null };
}

const SWATCHES = ["#4F46E5", "#0F9E8E", "#2563EB", "#0EA5E9", "#16A34A", "#CA8A04", "#EA580C", "#DC2626", "#DB2777", "#111827"];

export function BrandingForm({ canEdit, companyName, initial }: Props) {
  const router = useRouter();
  const [color, setColor] = useState(initial.brandColor ?? "");
  const [footer, setFooter] = useState(initial.invoiceFooter ?? "");
  const [terms, setTerms] = useState(initial.invoiceTerms ?? "");
  const logo = initial.logoUrl;
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const preview = /^#?[0-9a-fA-F]{6}$/.test(color) ? (color.startsWith("#") ? color : `#${color}`) : "#4F46E5";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "saving" });
    const res = await saveBrandingAction({
      brandColor: color.trim() || null,
      invoiceFooter: footer,
      invoiceTerms: terms,
    });
    setState(res.ok ? { kind: "saved" } : { kind: "error", message: res.error });
    if (res.ok) router.refresh();
  }

  const disabled = !canEdit;

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-6">
        {!canEdit && (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            You can see the branding, but only company admins can change it.
          </p>
        )}

        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          Logo, tagline and contact details are set in{" "}
          <Link href="/settings" className="font-medium text-primary hover:underline">General → Profile &amp; Branding</Link>.
        </p>

        <fieldset className="rounded-lg border border-border bg-card p-4" disabled={disabled}>
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand colour</legend>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setColor(s)}
                aria-label={`Use ${s}`}
                className={`h-8 w-8 rounded-full border-2 ${preview.toLowerCase() === s.toLowerCase() ? "border-foreground" : "border-transparent"}`}
                style={{ background: s }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input type="color" value={preview} onChange={(e) => setColor(e.target.value)} aria-label="Pick a colour" className="h-9 w-12 cursor-pointer rounded border border-border bg-background" />
            <input id="brand-color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#4F46E5 (default)" className="w-40 rounded-md border border-border bg-background px-3 py-2 text-sm" />
            {color && <button type="button" onClick={() => setColor("")} className="text-sm text-muted-foreground hover:text-foreground">Use default</button>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Used for buttons, highlights and the active menu item for everyone in the company.</p>
        </fieldset>

        <fieldset className="rounded-lg border border-border bg-card p-4" disabled={disabled}>
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoices</legend>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Payment terms</span>
            <textarea id="brand-terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} maxLength={2000}
              placeholder="e.g. Payment due within 30 days. Bank: … IBAN: …" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-muted-foreground">Footer note</span>
            <input id="brand-footer" value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={500}
              placeholder="e.g. Thank you for your business" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">Shown on every invoice and its online payment page.</p>
        </fieldset>

        {canEdit && (
          <div className="flex items-center gap-3">
            <button type="submit" disabled={state.kind === "saving"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Save branding
            </button>
            <SaveStatus state={state} />
          </div>
        )}
        {!canEdit && <SaveStatus state={state} />}
      </div>

      <aside aria-label="Preview" className="h-fit rounded-lg border border-border bg-card p-4 lg:sticky lg:top-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</div>
        <div className="mt-3 flex items-center gap-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-8 w-8 rounded object-contain" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded text-sm font-semibold text-white" style={{ background: preview }}>
              {companyName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="truncate text-sm font-semibold text-card-foreground">{companyName}</span>
        </div>
        <div className="mt-4 rounded-md px-3 py-2 text-sm font-medium" style={{ background: `${preview}1a`, color: preview }}>Sales</div>
        <button type="button" tabIndex={-1} className="mt-3 w-full rounded-md px-3 py-2 text-sm font-medium text-white" style={{ background: preview }}>
          New invoice
        </button>
        {(terms || footer) && (
          <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            {terms && <p className="whitespace-pre-line">{terms}</p>}
            {footer && <p className="mt-2 italic">{footer}</p>}
          </div>
        )}
      </aside>
    </form>
  );
}
