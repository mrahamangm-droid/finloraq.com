"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePreferencesAction } from "@/app/(app)/settings/customize-actions";
import { DATE_FORMATS, NUMBER_FORMATS, formatAmount, formatDate, type DateFormat, type NumberFormat } from "@/lib/customization/format";
import { SaveStatus } from "./settings-tabs";

interface Props {
  initial: { theme: string; density: string; landingPage: string; dateFormat: string; numberFormat: string };
  pages: Array<{ href: string; label: string }>;
}

const field = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function PreferencesForm({ initial, pages }: Props) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const sampleDate = new Date(Date.UTC(2026, 8, 24));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "saving" });
    const res = await savePreferencesAction(p as Parameters<typeof savePreferencesAction>[0]);
    setState(res.ok ? { kind: "saved" } : { kind: "error", message: res.error });
    if (res.ok) router.refresh();
  }

  const set = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setP({ ...p, [k]: e.target.value });

  return (
    <form onSubmit={save} className="space-y-6">
      <fieldset className="rounded-lg border border-border bg-card p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appearance</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Theme</span>
            <div className="mt-1 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
              {(["system", "light", "dark"] as const).map((t) => (
                <label key={t} className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm capitalize ${p.theme === t ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground"}`}>
                  <input type="radio" name="theme" value={t} checked={p.theme === t} onChange={set("theme")} className="sr-only" />
                  {t === "system" ? "Automatic" : t}
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground">Density</span>
            <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Density">
              {(["comfortable", "compact"] as const).map((d) => (
                <label key={d} className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm capitalize ${p.density === d ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground"}`}>
                  <input type="radio" name="density" value={d} checked={p.density === d} onChange={set("density")} className="sr-only" />
                  {d}
                </label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border bg-card p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Formats</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Numbers</span>
            <select id="pref-number" value={p.numberFormat} onChange={set("numberFormat")} className={field}>
              {Object.keys(NUMBER_FORMATS).map((k) => (
                <option key={k} value={k}>{formatAmount("1234567.89", k as NumberFormat)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Dates</span>
            <select id="pref-date" value={p.dateFormat} onChange={set("dateFormat")} className={field}>
              {DATE_FORMATS.map((d) => (
                <option key={d} value={d}>{formatDate(sampleDate, d as DateFormat)} ({d})</option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border bg-card p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start page</legend>
        <label className="block max-w-sm">
          <span className="text-xs font-medium text-muted-foreground">Open this page when I sign in</span>
          <select id="pref-landing" value={p.landingPage} onChange={set("landingPage")} className={field}>
            {pages.map((pg) => <option key={pg.href} value={pg.href}>{pg.label}</option>)}
          </select>
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={state.kind === "saving"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          Save preferences
        </button>
        <SaveStatus state={state} />
      </div>
    </form>
  );
}
