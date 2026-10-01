"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rateToPercentString as ratePercent } from "@/lib/taxRate";

export interface TaxCodeRow {
  id: string;
  code: string;
  name: string;
  /** Stored fraction as an exact decimal string, e.g. "0.05". */
  rate: string;
  treatment: string;
  isInput: boolean;
  isActive: boolean;
  usageCount: number;
}

const TREATMENTS = [
  { value: "STANDARD", label: "Standard rated" },
  { value: "ZERO_RATED", label: "Zero rated" },
  { value: "EXEMPT", label: "Exempt" },
  { value: "OUT_OF_SCOPE", label: "Out of scope" },
];

const input =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60";

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return typeof data.error === "string" ? data.error : `Request failed (${res.status}).`;
}

export function TaxCodesManager({ rows, canEdit }: { rows: TaxCodeRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) {
      setError(err);
      return false;
    }
    router.refresh();
    return true;
  }

  async function create(form: HTMLFormElement) {
    const f = new FormData(form);
    const ok = await run(() =>
      send("/api/tax-codes", "POST", {
        code: String(f.get("code") ?? ""),
        name: String(f.get("name") ?? ""),
        ratePercent: String(f.get("ratePercent") ?? ""),
        treatment: String(f.get("treatment") ?? "STANDARD"),
        isInput: f.get("isInput") === "true",
      })
    );
    if (ok) form.reset();
  }

  async function save(row: TaxCodeRow, form: HTMLFormElement) {
    const f = new FormData(form);
    const body: Record<string, unknown> = { name: String(f.get("name") ?? "") };
    if (row.usageCount === 0) {
      body.code = String(f.get("code") ?? "");
      body.ratePercent = String(f.get("ratePercent") ?? "");
      body.treatment = String(f.get("treatment") ?? row.treatment);
      body.isInput = f.get("isInput") === "true";
    }
    if (await run(() => send(`/api/tax-codes/${row.id}`, "PATCH", body))) setEditing(null);
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No tax codes yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Treatment</th>
                <th className="px-4 py-3 text-left">Direction</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-left">Status</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((tc) =>
                editing === tc.id ? (
                  <tr key={tc.id} className="bg-muted/20">
                    <td colSpan={canEdit ? 7 : 6} className="px-4 py-3">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void save(tc, e.currentTarget);
                        }}
                        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                      >
                        <label className="text-xs text-muted-foreground">
                          Code
                          <input name="code" defaultValue={tc.code} disabled={tc.usageCount > 0} className={`${input} mt-1 uppercase`} />
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Name
                          <input name="name" defaultValue={tc.name} required className={`${input} mt-1`} />
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Rate (%)
                          <input
                            name="ratePercent"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            defaultValue={ratePercent(tc.rate)}
                            disabled={tc.usageCount > 0}
                            className={`${input} mt-1`}
                          />
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Treatment
                          <select name="treatment" defaultValue={tc.treatment} disabled={tc.usageCount > 0} className={`${input} mt-1`}>
                            {TREATMENTS.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Direction
                          <select name="isInput" defaultValue={String(tc.isInput)} disabled={tc.usageCount > 0} className={`${input} mt-1`}>
                            <option value="false">Output (sales / collected)</option>
                            <option value="true">Input (purchases / recoverable)</option>
                          </select>
                        </label>
                        <div className="flex items-end gap-2">
                          <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                            Save
                          </button>
                          <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-border px-4 py-2 text-sm">
                            Cancel
                          </button>
                        </div>
                        {tc.usageCount > 0 && (
                          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
                            Used on {tc.usageCount} line(s) or product(s), so only the name can change. To use a different rate,
                            deactivate this code and add a new one — past documents keep the rate they were issued with.
                          </p>
                        )}
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={tc.id} className={`hover:bg-muted/20 ${tc.isActive ? "" : "opacity-50"}`}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{tc.code}</td>
                    <td className="px-4 py-3 text-foreground">{tc.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {TREATMENTS.find((t) => t.value === tc.treatment)?.label ?? tc.treatment}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{tc.isInput ? "Input (purchases)" : "Output (sales)"}</td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">{ratePercent(tc.rate)}%</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tc.isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                        {tc.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3 text-xs">
                          <button type="button" onClick={() => { setError(null); setEditing(tc.id); }} className="text-primary hover:underline">
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void run(() => send(`/api/tax-codes/${tc.id}`, "PATCH", { isActive: !tc.isActive }))}
                            className="text-primary hover:underline disabled:opacity-50"
                          >
                            {tc.isActive ? "Deactivate" : "Activate"}
                          </button>
                          {tc.usageCount === 0 && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm(`Delete tax code ${tc.code}? It has never been used.`)) {
                                  void run(() => send(`/api/tax-codes/${tc.id}`, "DELETE"));
                                }
                              }}
                              className="text-destructive hover:underline disabled:opacity-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Add tax code</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create(e.currentTarget);
            }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <label className="text-xs font-medium text-muted-foreground">
              Code (e.g. VAT_STD_5)
              <input name="code" required maxLength={32} placeholder="VAT_STD_5" className={`${input} mt-1 uppercase`} />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Name
              <input name="name" required maxLength={120} placeholder="Standard rate 5%" className={`${input} mt-1`} />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Rate (%)
              <input name="ratePercent" type="number" step="0.01" min="0" max="100" required placeholder="5" className={`${input} mt-1`} />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Treatment
              <select name="treatment" className={`${input} mt-1`}>
                {TREATMENTS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Direction
              <select name="isInput" className={`${input} mt-1`}>
                <option value="false">Output (sales / collected)</option>
                <option value="true">Input (purchases / recoverable)</option>
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" disabled={busy} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy ? "Saving…" : "Add tax code"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
