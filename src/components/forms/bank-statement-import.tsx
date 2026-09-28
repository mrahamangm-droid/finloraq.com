"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Line = { date: string; description: string; amount: number };
type Preview = {
  format: "csv" | "ofx";
  toImport: number;
  duplicates: number;
  imported: number;
  preview: Line[];
  skipped: { row: number; reason: string }[];
  skippedCount: number;
};

/**
 * Two-step statement import: choose a file → preview (nothing written) →
 * confirm. Parsing happens on the server; this only reads the file as text.
 */
export function BankStatementImport({ bankAccountId }: { bankAccountId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send(body: { fileName: string; content: string; commit: boolean }): Promise<Preview | null> {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/bank-accounts/${bankAccountId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return null;
    }
    return data as Preview;
  }

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPreview(null);
    setDone(null);
    setError(null);
    if (!f) return;
    if (f.size > 2_000_000) {
      setError("That file is over 2 MB. Export a shorter date range.");
      return;
    }
    const content = await f.text();
    setFile({ name: f.name, content });
    const p = await send({ fileName: f.name, content, commit: false });
    if (p) setPreview(p);
  }

  async function confirm() {
    if (!file) return;
    const r = await send({ fileName: file.name, content: file.content, commit: true });
    if (!r) return;
    setDone(`Imported ${r.imported} transaction${r.imported === 1 ? "" : "s"}${r.duplicates ? `, skipped ${r.duplicates} already imported` : ""}.`);
    setPreview(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  function reset() {
    setPreview(null);
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-card-foreground">Import a bank statement</p>
          <p className="text-xs text-muted-foreground">CSV or OFX/QFX export from your bank. Lines come in unmatched; nothing is posted to the ledger.</p>
        </div>
        <label className="cursor-pointer rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
          {loading && !preview ? "Reading…" : "Choose file"}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,.ofx,.qfx,text/csv,application/x-ofx"
            onChange={choose}
            disabled={loading}
            className="sr-only"
            aria-label="Bank statement file"
          />
        </label>
      </div>

      {preview && file && (
        <div className="space-y-3">
          <p className="text-sm text-card-foreground">
            <span className="font-medium">{file.name}</span>: {preview.toImport} new transaction{preview.toImport === 1 ? "" : "s"} to import
            {preview.duplicates > 0 && <>, {preview.duplicates} already imported (will be skipped)</>}
            {preview.skippedCount > 0 && <>, {preview.skippedCount} row{preview.skippedCount === 1 ? "" : "s"} couldn&apos;t be read</>}.
          </p>

          {preview.preview.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5">Date</th>
                    <th className="px-3 py-1.5">Description</th>
                    <th className="px-3 py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-1.5 text-muted-foreground">{l.date}</td>
                      <td className="px-3 py-1.5 text-card-foreground">{l.description}</td>
                      <td className={`px-3 py-1.5 text-right ${l.amount < 0 ? "text-destructive" : "text-success"}`}>{l.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.toImport > preview.preview.length && (
                <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">…and {preview.toImport - preview.preview.length} more.</p>
              )}
            </div>
          )}

          {preview.skipped.length > 0 && (
            <ul className="list-inside list-disc text-xs text-muted-foreground">
              {preview.skipped.slice(0, 5).map((s) => (
                <li key={s.row}>Row {s.row}: {s.reason}</li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={confirm}
              disabled={loading || preview.toImport === 0}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? "Importing…" : preview.toImport === 0 ? "Nothing new to import" : `Import ${preview.toImport}`}
            </button>
            <button onClick={reset} disabled={loading} className="text-sm font-medium text-muted-foreground hover:underline">
              Cancel
            </button>
          </div>
        </div>
      )}

      {done && <p className="text-sm text-success">{done}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
