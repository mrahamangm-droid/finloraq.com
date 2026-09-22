"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";

type Line = { accountCode: string; debit: string; credit: string; description: string; costCentreId: string };

const emptyLine = (): Line => ({ accountCode: "", debit: "", credit: "", description: "", costCentreId: "" });

export function NewJournalEntryForm({ costCentres }: { costCentres: { id: string; name: string; code: string }[] }) {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"draft" | "post" | null>(null);

  const totalDebit = lines.reduce((a, l) => a + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((a, l) => a + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(post: boolean) {
    setError(null);
    setLoading(post ? "post" : "draft");

    const res = await fetch("/api/journals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        memo: memo || undefined,
        currency,
        post,
        lines: lines
          .filter((l) => l.accountCode)
          .map((l) => ({
            accountCode: l.accountCode,
            debit: l.debit ? parseFloat(l.debit) : undefined,
            credit: l.credit ? parseFloat(l.credit) : undefined,
            description: l.description || undefined,
            costCentreId: l.costCentreId || undefined,
          })),
      }),
    });

    setLoading(null);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }

    router.push("/accounting/journals");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-card p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-card-foreground">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-card-foreground">Memo</label>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="What is this entry for?"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Account code</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Cost centre</th>
              <th className="w-28 px-3 py-2 text-right">Debit</th>
              <th className="w-28 px-3 py-2 text-right">Credit</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5">
                  <input
                    value={line.accountCode}
                    onChange={(e) => updateLine(i, { accountCode: e.target.value })}
                    placeholder="e.g. 1000"
                    className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={line.costCentreId}
                    onChange={(e) => updateLine(i, { costCentreId: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">—</option>
                    {costCentres.map((cc) => <option key={cc.id} value={cc.id}>{cc.code}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={line.debit}
                    onChange={(e) => updateLine(i, { debit: e.target.value, credit: "" })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-right text-xs"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={line.credit}
                    onChange={(e) => updateLine(i, { credit: e.target.value, debit: "" })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-right text-xs"
                  />
                </td>
                <td className="px-1 text-center">
                  <button
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={lines.length <= 2}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <button
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
            className="flex items-center gap-1 text-sm text-primary"
          >
            <Plus className="h-4 w-4" /> Add line
          </button>
          <div className={`text-sm font-medium ${balanced ? "text-success" : "text-destructive"}`}>
            Debit {totalDebit.toFixed(2)} · Credit {totalCredit.toFixed(2)}{" "}
            {balanced ? "(balanced)" : "(not balanced)"}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => submit(false)}
          disabled={!balanced || loading !== null}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
        >
          {loading === "draft" ? "Saving…" : "Save as Draft"}
        </button>
        <button
          onClick={() => submit(true)}
          disabled={!balanced || loading !== null}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading === "post" ? "Posting…" : "Post Entry"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Posting requires the Approve permission on Journals and an open accounting period. The
        server re-validates debit = credit independently of the check above — this page&apos;s
        balance indicator is a convenience, not the enforcement.
      </p>
    </div>
  );
}
