"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { MathInput } from "@/components/forms/math-input";

type Line = { description: string; quantity: string; unitPrice: string; taxCodeId: string };
const emptyLine = (): Line => ({ description: "", quantity: "1", unitPrice: "", taxCodeId: "" });

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  currency: string;
}

interface Props {
  customers: { id: string; name: string; currency: string }[];
  taxCodes: { id: string; name: string; rate: number }[];
  invoices: Invoice[];
  initialInvoiceId?: string;
}

export function NewCreditNoteForm({ customers, taxCodes, invoices, initialInvoiceId }: Props) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const initialInvoice = invoices.find((i) => i.id === initialInvoiceId);

  const [customerId, setCustomerId] = useState(
    initialInvoice?.customerId ?? customers[0]?.id ?? ""
  );
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId ?? "");
  const [issueDate, setIssueDate] = useState(today);
  const [currency, setCurrency] = useState(
    initialInvoice?.currency ?? customers[0]?.currency ?? "USD"
  );
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // When a linked invoice is selected, auto-fill customer + currency
  function onInvoiceChange(id: string) {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv) {
      setCustomerId(inv.customerId);
      setCurrency(inv.currency);
    }
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const taxRate = (id: string) => taxCodes.find((t) => t.id === id)?.rate ?? 0;
  const subtotal = lines.reduce((a, l) => a + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
  const taxTotal = lines.reduce((a, l) => {
    const lt = (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0);
    return a + lt * taxRate(l.taxCodeId);
  }, 0);

  async function submit() {
    setError(null);
    const validLines = lines.filter((l) => l.description && l.unitPrice);
    if (validLines.length === 0) { setError("Add at least one line."); return; }
    if (!customerId) { setError("Select a customer."); return; }
    setLoading(true);

    const res = await fetch("/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        invoiceId: invoiceId || undefined,
        issueDate,
        currency,
        reason: reason || undefined,
        lines: validLines.map((l) => ({
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
    const { creditNote } = await res.json();
    router.push(`/credit-notes/${creditNote.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-card p-4 grid gap-4 sm:grid-cols-2">
        {/* Link to invoice (optional) */}
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1">
            Related Invoice <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <select value={invoiceId} onChange={(e) => onInvoiceChange(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option value="">— General credit (no invoice) —</option>
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>{inv.invoiceNumber}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Customer *</label>
          <select value={customerId} onChange={(e) => {
            setCustomerId(e.target.value);
            const c = customers.find((c) => c.id === e.target.value);
            if (c) setCurrency(c.currency);
          }}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            disabled={!!invoiceId} // locked when invoice is selected
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Issue Date *</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Currency</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3} disabled={!!invoiceId}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono disabled:opacity-60" />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1">Reason for credit</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Returned goods, pricing error…"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
      </div>

      {/* Lines */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Qty</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Unit Price</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-32">Tax</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">Credit</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l, i) => {
              const lt = (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0);
              const tax = lt * taxRate(l.taxCodeId);
              return (
                <tr key={i}>
                  <td className="px-2 py-1">
                    <input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })}
                      placeholder="Item being credited"
                      className="w-full bg-transparent outline-none text-sm" />
                  </td>
                  <td className="px-2 py-1">
                    <MathInput value={l.quantity} onChange={(v) => updateLine(i, { quantity: v })}
                      className="w-full text-right bg-transparent outline-none text-sm tabular-nums" />
                  </td>
                  <td className="px-2 py-1">
                    <MathInput value={l.unitPrice} onChange={(v) => updateLine(i, { unitPrice: v })}
                      className="w-full text-right bg-transparent outline-none text-sm tabular-nums" />
                  </td>
                  <td className="px-2 py-1">
                    <select value={l.taxCodeId} onChange={(e) => updateLine(i, { taxCodeId: e.target.value })}
                      className="w-full bg-transparent text-sm outline-none">
                      <option value="">No tax</option>
                      {taxCodes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({(t.rate * 100).toFixed(0)}%)</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                    ({(lt + tax).toFixed(2)})
                  </td>
                  <td className="px-2 py-1">
                    {lines.length > 1 && (
                      <button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                        className="text-destructive opacity-60 hover:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-border bg-muted/10">
            <tr>
              <td colSpan={6} className="px-2 py-1">
                <button onClick={() => setLines((p) => [...p, emptyLine()])}
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Plus className="h-3 w-3" /> Add line
                </button>
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="px-3 py-1 text-right text-muted-foreground text-sm">Subtotal</td>
              <td className="px-3 py-1 text-right tabular-nums text-sm">({subtotal.toFixed(2)})</td>
              <td />
            </tr>
            <tr>
              <td colSpan={4} className="px-3 py-1 text-right text-muted-foreground text-sm">Tax</td>
              <td className="px-3 py-1 text-right tabular-nums text-sm">({taxTotal.toFixed(2)})</td>
              <td />
            </tr>
            <tr className="font-semibold text-destructive">
              <td colSpan={4} className="px-3 py-1.5 text-right">Credit Total</td>
              <td className="px-3 py-1.5 text-right tabular-nums">({(subtotal + taxTotal).toFixed(2)}) {currency}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-3">
        <button onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-1.5 text-sm">
          Cancel
        </button>
        <button onClick={submit} disabled={loading}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Creating…" : "Create Credit Note"}
        </button>
      </div>
    </div>
  );
}
