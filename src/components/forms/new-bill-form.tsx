"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

type Line = { description: string; quantity: string; unitPrice: string; taxCodeId: string };
const emptyLine = (): Line => ({ description: "", quantity: "1", unitPrice: "", taxCodeId: "" });

export function NewBillForm({
  suppliers,
  taxCodes,
}: {
  suppliers: { id: string; name: string }[];
  taxCodes: { id: string; name: string; rate: number }[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const taxRate = (id: string) => taxCodes.find((t) => t.id === id)?.rate ?? 0;
  const subtotal = lines.reduce((a, l) => a + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
  const taxTotal = lines.reduce((a, l) => {
    const lineTotal = (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0);
    return a + lineTotal * taxRate(l.taxCodeId);
  }, 0);

  async function submit() {
    setError(null);
    setLoading(true);

    const res = await fetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        issueDate,
        dueDate,
        currency: "AED",
        lines: lines
          .filter((l) => l.description && l.unitPrice)
          .map((l) => ({
            description: l.description,
            quantity: parseFloat(l.quantity) || 1,
            unitPrice: parseFloat(l.unitPrice) || 0,
            taxCodeId: l.taxCodeId || undefined,
          })),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }

    const data = await res.json();
    router.push(`/purchases/${data.id}`);
  }

  if (suppliers.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        Add a supplier first before creating a bill.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-lg border border-border bg-card p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-card-foreground">Supplier</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-card-foreground">Issue date</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-card-foreground">Due date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="w-20 px-3 py-2 text-right">Qty</th>
                <th className="w-28 px-3 py-2 text-right">Unit price</th>
                <th className="w-40 px-3 py-2">Tax</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5">
                    <input value={line.description} onChange={(e) => updateLine(i, { description: e.target.value })} className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="number" step="1" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} className="w-full rounded border border-border bg-background px-2 py-1 text-right text-xs" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="number" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} className="w-full rounded border border-border bg-background px-2 py-1 text-right text-xs" />
                  </td>
                  <td className="px-3 py-1.5">
                    <select value={line.taxCodeId} onChange={(e) => updateLine(i, { taxCodeId: e.target.value })} className="w-full rounded border border-border bg-background px-2 py-1 text-xs">
                      <option value="">No tax</option>
                      {taxCodes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className="px-1 text-center">
                    <button onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} disabled={lines.length <= 1} className="text-muted-foreground hover:text-destructive disabled:opacity-30">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <button onClick={() => setLines((prev) => [...prev, emptyLine()])} className="flex items-center gap-1 text-sm text-primary">
            <Plus className="h-4 w-4" /> Add line
          </button>
          <div className="text-sm text-muted-foreground">
            Subtotal {subtotal.toFixed(2)} · Tax {taxTotal.toFixed(2)} ·{" "}
            <span className="font-medium text-card-foreground">Total {(subtotal + taxTotal).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button onClick={submit} disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Saving…" : "Save Draft Bill"}
      </button>
      <p className="text-xs text-muted-foreground">
        This saves a draft — no ledger impact yet. Approving (which posts the expense and payable)
        happens from the bill detail page and requires the Approve permission on Bills.
      </p>
    </div>
  );
}
