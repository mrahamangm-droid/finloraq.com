"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { MathInput } from "@/components/forms/math-input";

type Line = { description: string; quantity: string; unitPrice: string; taxCodeId: string; productId: string };
const emptyLine = (): Line => ({ description: "", quantity: "1", unitPrice: "", taxCodeId: "", productId: "" });

export function NewBillForm({
  currency: baseCurrency,
  suppliers,
  taxCodes,
  products = [],
  billId,
  initial,
}: {
  /** The company's base currency. Also the default for a new bill's own
   *  currency field below — most bills are base-currency, but this form
   *  lets that be changed to record a supplier bill in a foreign currency
   *  (see resolveDocumentCurrency in src/lib/ledger.ts, which the API
   *  enforces server-side either way). */
  currency: string;
  suppliers: { id: string; name: string }[];
  taxCodes: { id: string; name: string; rate: number }[];
  /** Optional catalog items a line can link to — picking one fills in the
   *  description and price and, for a trackInventory item, is what makes
   *  this line capitalize to Inventory Asset (instead of expensing
   *  immediately) when the bill is approved — see approveAndPostBill in
   *  src/lib/purchases.ts. A line left as "Custom line" behaves exactly as
   *  before: free-text, expensed directly, no inventory effect. */
  products?: { id: string; name: string; unitPrice: number; trackInventory: boolean; quantityOnHand: number }[];
  /** Present only when editing an existing DRAFT bill — switches the form
   *  from POST /api/bills to PATCH /api/bills/:id. */
  billId?: string;
  initial?: {
    supplierId: string;
    issueDate: string;
    dueDate: string;
    lines: Line[];
    /** The bill's own currency/rate when editing — omitted for a new bill,
     *  which starts out in the company's base currency. */
    currency?: string;
    exchangeRate?: string;
  };
}) {
  const editing = Boolean(billId);
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? suppliers[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [currency, setCurrency] = useState((initial?.currency ?? baseCurrency).toUpperCase());
  const [exchangeRate, setExchangeRate] = useState(initial?.exchangeRate ?? "1");
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? [emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isForeignCurrency = currency.trim().toUpperCase() !== baseCurrency.trim().toUpperCase();

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function selectProduct(i: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      updateLine(i, { productId: "" });
      return;
    }
    updateLine(i, {
      productId,
      description: product.name,
      unitPrice: String(product.unitPrice),
    });
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

    const res = await fetch(editing ? `/api/bills/${billId}` : "/api/bills", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        issueDate,
        dueDate,
        currency,
        exchangeRate: isForeignCurrency ? parseFloat(exchangeRate) || undefined : undefined,
        lines: lines
          .filter((l) => l.description && l.unitPrice)
          .map((l) => ({
            description: l.description,
            quantity: parseFloat(l.quantity) || 1,
            unitPrice: parseFloat(l.unitPrice) || 0,
            taxCodeId: l.taxCodeId || undefined,
            productId: l.productId || undefined,
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
    router.push(`/purchases/${editing ? billId : data.id}`);
    router.refresh();
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
        <div>
          <label className="mb-1 block text-sm font-medium text-card-foreground">Currency</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono uppercase" />
        </div>
        {isForeignCurrency && (
          <div>
            <label className="mb-1 block text-sm font-medium text-card-foreground">
              Exchange rate <span className="font-normal text-muted-foreground">(1 {currency} = ? {baseCurrency})</span>
            </label>
            <input type="number" step="any" min="0" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-muted-foreground">
              There&apos;s no live rate lookup — enter today&apos;s rate. The ledger always posts in {baseCurrency}.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-44 px-3 py-2">Product</th>
                <th className="px-3 py-2">Description</th>
                <th className="w-20 px-3 py-2 text-right">Qty</th>
                <th className="w-28 px-3 py-2 text-right">Unit price</th>
                <th className="w-40 px-3 py-2">Tax</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const selected = products.find((p) => p.id === line.productId);
                return (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5">
                    <select value={line.productId} onChange={(e) => selectProduct(i, e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1 text-xs">
                      <option value="">Custom line</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {selected?.trackInventory && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{selected.quantityOnHand} in stock</p>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <input value={line.description} onChange={(e) => updateLine(i, { description: e.target.value })} className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
                  </td>
                  <td className="px-3 py-1.5">
                    <MathInput value={line.quantity} onChange={(v) => updateLine(i, { quantity: v })} className="w-full rounded border border-border bg-background px-2 py-1 text-right text-xs" />
                  </td>
                  <td className="px-3 py-1.5">
                    <MathInput decimals={2} value={line.unitPrice} onChange={(v) => updateLine(i, { unitPrice: v })} className="w-full rounded border border-border bg-background px-2 py-1 text-right text-xs" />
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
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <button onClick={() => setLines((prev) => [...prev, emptyLine()])} className="flex items-center gap-1 text-sm text-primary">
            <Plus className="h-4 w-4" /> Add line
          </button>
          <div className="text-sm text-muted-foreground">
            Subtotal {subtotal.toFixed(2)} · Tax {taxTotal.toFixed(2)} ·{" "}
            <span className="font-medium text-card-foreground">Total {(subtotal + taxTotal).toFixed(2)} {currency}</span>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button onClick={submit} disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Saving…" : editing ? "Save changes" : "Save Draft Bill"}
      </button>
      <p className="text-xs text-muted-foreground">
        {editing
          ? "Editing is only possible while this bill is still a draft — once approved, its numbers are locked and a correction goes through a debit note instead."
          : "This saves a draft — no ledger impact yet. Approving (which posts the expense and payable) happens from the bill detail page and requires the Approve permission on Bills."}
      </p>
    </div>
  );
}
