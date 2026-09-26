"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Upload, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type Kind = "transactions" | "invoices" | "bills";

interface PreviewRow {
  line: number;
  errors: string[];
  notes: string[];
  row: Record<string, unknown> | null;
  sheet?: string;
}
interface PreviewResponse {
  kind: Kind;
  warning: string | null;
  info: string | null;
  periodTotals: number;
  currency: string;
  rows: PreviewRow[];
  keys: string[];
  duplicates: boolean[];
  accounts: { category: string; type: "income" | "expense"; code: string | null; name: string; create: boolean; problem?: string }[];
  newParties: string[];
  lockedPeriods: string[];
  byYear: { year: string; income: number; expense: number; count: number }[];
}
type Result = { line: number; status: "imported" | "duplicate" | "failed"; message?: string };

const KINDS: { id: Kind; title: string; body: string }[] = [
  { id: "transactions", title: "Income & expenses", body: "One row per transaction — or per month / year total. Goes straight to the ledger." },
  { id: "invoices", title: "Sales invoices", body: "Past invoices with customer, amount and whether they were paid. Fills receivables too." },
  { id: "bills", title: "Supplier bills", body: "Past bills with supplier, category and payment. Fills payables too." },
];

const CHUNK = 25;
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ImportWizard({
  templates,
  currency,
  dateFormat,
  permissions,
}: {
  templates: Record<Kind, string>;
  currency: string;
  dateFormat: string;
  permissions: Record<Kind | "addAccounts", boolean>;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("transactions");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  const good = useMemo(() => {
    if (!preview) return [];
    let k = 0;
    return preview.rows.flatMap((r) => {
      if (!r.row) return [];
      const i = k++;
      return [{ row: r.row, key: preview.keys[i]!, duplicate: preview.duplicates[i]! }];
    });
  }, [preview]);
  // Rows already in Finloraq are always skipped — the server would refuse them anyway.
  const toImport = good.filter((g) => !g.duplicate);
  const bad = preview?.rows.filter((r) => !r.row) ?? [];
  const blockedAccounts = preview?.accounts.filter((a) => a.problem || (a.create && !permissions.addAccounts)) ?? [];

  function downloadTemplate(k: Kind) {
    const blob = new Blob([templates[k]], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `finloraq-${k}-template.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function onFile(file: File) {
    setError(null);
    setPreview(null);
    setResults(null);
    setFileName(file.name);
    if (file.size > 3 * 1024 * 1024) return setError("That file is over 3 MB. Split it into smaller sheets (for example one per year).");
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, fileName: file.name, fileBase64: btoa(bin) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that file.");
      setPreview(data as PreviewResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const all: Result[] = [];
    setProgress({ done: 0, total: toImport.length });
    try {
      for (let i = 0; i < toImport.length; i += CHUNK) {
        const chunk = toImport.slice(i, i + CHUNK);
        const res = await fetch("/api/import/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: preview.kind, rows: chunk.map((c) => c.row), keys: chunk.map((c) => c.key) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "The import stopped part-way. Rows already imported are safe; upload the same sheet again to finish — they'll be skipped.");
        all.push(...(data.results as Result[]));
        setProgress({ done: Math.min(i + CHUNK, toImport.length), total: toImport.length });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import stopped part-way.");
    } finally {
      setResults(all);
      setBusy(false);
      router.refresh();
    }
  }

  function reset() {
    setPreview(null);
    setResults(null);
    setProgress(null);
    setFileName("");
    setError(null);
  }

  const imported = results?.filter((r) => r.status === "imported").length ?? 0;
  const failed = results?.filter((r) => r.status === "failed") ?? [];
  const reportLink = preview?.byYear[0] ? `/accounting/reports/profit-and-loss?period=year&date=${preview.byYear[0].year}-01-01` : "/accounting/reports/profit-and-loss";

  return (
    <div className="space-y-6">
      {/* Step 1 — what's in the sheet */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-card-foreground">1. What&apos;s in your sheet?</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {KINDS.map((k) => {
            const allowed = permissions[k.id];
            return (
              <label key={k.id} className={`relative flex cursor-pointer flex-col rounded-lg border p-3 text-sm ${kind === k.id ? "border-primary ring-1 ring-primary" : "border-border"} ${allowed ? "" : "opacity-60"}`}>
                <input type="radio" name="kind" value={k.id} checked={kind === k.id} disabled={!allowed || busy} onChange={() => { setKind(k.id); reset(); }} className="sr-only" />
                <span className="font-medium text-card-foreground">{k.title}</span>
                <span className="mt-1 text-xs text-muted-foreground">{k.body}</span>
                {!allowed && <span className="mt-2 text-xs text-destructive">You need approval rights to import these.</span>}
                <button type="button" onClick={(e) => { e.preventDefault(); downloadTemplate(k.id); }} className="mt-3 flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <Download className="h-3.5 w-3.5" /> Template (.csv)
                </button>
              </label>
            );
          })}
        </div>
      </section>

      {/* Step 2 — upload */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-card-foreground">2. Upload the sheet</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Excel (.xlsx) or CSV, up to 10,000 rows. If the sheet you need isn&apos;t first, or income and expenses are on
          separate tabs (e.g. an &quot;Income Register&quot; and &quot;Expense Register&quot;), every tab is checked automatically.
          Column names are matched automatically (Date, Amount, Type,
          Category, Customer…). Dates like <b>2023-03-14</b>, <b>14/03/2023</b>, <b>Mar 2023</b>, <b>2023-Q1</b> or just <b>2022</b> all work —
          a month, quarter or year on its own is treated as a total for that period and dated on its last day.
          Slashed dates are read as {dateFormat === "MM/DD/YYYY" ? "month/day/year" : "day/month/year"} (change this under My preferences). Amounts are in {currency}.
        </p>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && !busy && permissions[kind]) void onFile(f); }}
          className="mt-3 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-8 text-center"
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <button type="button" disabled={busy || !permissions[kind]} onClick={() => fileRef.current?.click()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy && !progress ? "Reading…" : "Choose file"}
          </button>
          <span className="text-xs text-muted-foreground">{fileName || "or drop it here"}</span>
        </div>
        {error && <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      </section>

      {/* Step 3 — preview */}
      {preview && !results && (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-card-foreground">3. Check before importing</h2>
          {preview.warning && <p className="text-sm text-destructive">{preview.warning}</p>}
          {preview.info && <p className="text-sm text-muted-foreground">{preview.info}</p>}

          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Ready to import" value={String(toImport.length)} tone="ok" />
            <Stat label="Already imported" value={String(good.filter((g) => g.duplicate).length)} />
            <Stat label="Rows with problems" value={String(bad.length)} tone={bad.length ? "bad" : undefined} />
            <Stat label="Period totals" value={String(preview.periodTotals)} />
          </div>

          {preview.byYear.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="py-1 pr-4">Year</th><th className="py-1 pr-4 text-right">Rows</th><th className="py-1 pr-4 text-right">{preview.kind === "bills" ? "" : "Income"}</th><th className="py-1 text-right">{preview.kind === "invoices" ? "" : "Expenses"}</th></tr>
                </thead>
                <tbody>
                  {preview.byYear.map((y) => (
                    <tr key={y.year} className="border-t border-border">
                      <td className="py-1 pr-4 font-medium">{y.year}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{y.count}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{preview.kind === "bills" ? "" : money(y.income)}</td>
                      <td className="py-1 text-right tabular-nums">{preview.kind === "invoices" ? "" : money(y.expense)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.accounts.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categories → accounts</div>
              <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                {preview.accounts.map((a) => (
                  <li key={`${a.type}-${a.category}`} className="flex items-center gap-2">
                    <span className="truncate">{a.category}</span>
                    <span className="text-muted-foreground">→</span>
                    {a.problem ? <span className="text-destructive">{a.problem}</span>
                      : a.create ? (permissions.addAccounts ? <span className="text-primary">new {a.type} account</span> : <span className="text-destructive">no such account (an admin can add it)</span>)
                      : <span className="text-muted-foreground">{a.code} · {a.name}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.newParties.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {preview.newParties.length} new {preview.kind === "invoices" ? "customer" : "supplier"}{preview.newParties.length === 1 ? "" : "s"} will be added: {preview.newParties.slice(0, 8).join(", ")}{preview.newParties.length > 8 ? "…" : ""}
            </p>
          )}
          {preview.lockedPeriods.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> These months are locked, so their rows will fail: {preview.lockedPeriods.join(", ")}.</p>
          )}
          {blockedAccounts.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Rows using the categories marked in red will fail. Fix the sheet or ask an admin, then upload again.</p>
          )}

          <div className="max-h-80 overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Row</th><th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">{preview.kind === "transactions" ? "Type" : preview.kind === "invoices" ? "Customer" : "Supplier"}</th>
                  <th className="px-2 py-1.5">{preview.kind === "invoices" ? "Description" : "Category"}</th>
                  <th className="px-2 py-1.5 text-right">Amount</th><th className="px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {(() => { let k = 0; return preview.rows.slice(0, 500).map((r) => {
                  const dup = r.row ? preview.duplicates[k++] : false;
                  const row = r.row ?? {};
                  return (
                    <tr key={`${r.sheet ?? ""}-${r.line}`} className={`border-t border-border ${r.errors.length ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-1 text-muted-foreground">{r.sheet ? `${r.sheet} · ` : ""}{r.line}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{String(row.date ?? "—")}</td>
                      <td className="px-2 py-1">{String(row.type ?? row.party ?? "—")}</td>
                      <td className="max-w-[14rem] truncate px-2 py-1">{String((preview.kind === "invoices" ? row.description : row.category) || "—")}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{typeof row.amount === "number" ? money(row.amount) : "—"}</td>
                      <td className="px-2 py-1">
                        {r.errors.length ? <span className="text-destructive">{r.errors.join(" ")}</span>
                          : dup ? <span className="text-muted-foreground">Already imported</span>
                          : <span className="text-success">OK{r.notes.length ? <span className="text-muted-foreground"> · {r.notes.join(" · ")}</span> : null}</span>}
                      </td>
                    </tr>
                  );
                }); })()}
              </tbody>
            </table>
            {preview.rows.length > 500 && <p className="px-2 py-1 text-xs text-muted-foreground">Showing the first 500 of {preview.rows.length} rows.</p>}
          </div>


          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={runImport} disabled={busy || toImport.length === 0} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {busy ? `Importing… ${progress?.done ?? 0} / ${progress?.total ?? 0}` : `Import ${toImport.length} row${toImport.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" onClick={reset} disabled={busy} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            {bad.length > 0 && <span className="text-xs text-muted-foreground">Rows with problems are left out — fix them in the sheet and upload again later.</span>}
          </div>
          {busy && progress && (
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
              <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          )}
        </section>
      )}

      {/* Step 4 — done */}
      {results && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
            {failed.length ? <XCircle className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-success" />}
            Imported {imported} row{imported === 1 ? "" : "s"}
            {results.filter((r) => r.status === "duplicate").length > 0 && ` · ${results.filter((r) => r.status === "duplicate").length} already there`}
            {failed.length > 0 && ` · ${failed.length} failed`}
          </h2>
          {failed.length > 0 && (
            <ul className="max-h-48 overflow-auto text-sm text-destructive">
              {failed.map((f) => <li key={f.line}>Row {f.line}: {f.message}</li>)}
            </ul>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={reportLink} className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">See the yearly report</Link>
            <Link href="/dashboard?period=year" className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Dashboard</Link>
            <button type="button" onClick={reset} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Import another sheet</button>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${tone === "ok" ? "text-success" : tone === "bad" ? "text-destructive" : "text-card-foreground"}`}>{value}</div>
    </div>
  );
}
