"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { MathInput } from "@/components/forms/math-input";

type Line = { description: string; quantity: string; unitPrice: string; taxCodeId: string; productId: string };
const emptyLine = (): Line => ({ description: "", quantity: "1", unitPrice: "", taxCodeId: "", productId: "" });

interface Props {
  /** The company's base currency — the ledger always posts in it. */
  baseCurrency: string;
  products: { id: string; name: string; cost: number; trackInventory: boolean; quantityOnHand: number }[];
  suppliers: { id: string; name: string; currency: string }[];
  taxCodes: { id: string; name: string; rate: number }[];
  projects: { id: string; name: string }[];
}

export function NewPurchaseOrderForm({ baseCurrency, products, suppliers, taxCodes, projects }: Props) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [expectedDate, setExpectedDate] = useState("");
  const [currency, setCurrency] = useState((suppliers[0]?.currency ?? baseCurrency).toUpperCase());
  const [exchangeRate, setExchangeRate] = useState("1");
  const isForeignCurrency = currency.trim().toUpperCase() !== baseCurrency.trim().toUpperCase();
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function selectProduct(i: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) { updateLine(i, { productId: "" }); return; }
    updateLine(i, { productId, description: product.name, unitPrice: String(product.cost) });
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
    if (isForeignCurrency && !(parseFloat(exchangeRate) > 0)) { setError(`Enter the ${currency} → ${baseCurrency} exchange rate.`); return; }
    setLoading(true);

    const res = await fetch("/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        projectId: projectId || undefined,
        issueDate,
        expectedDate: expectedDate || undefined,
        currency,
        exchangeRate: isForeignCurrency ? parseFloat(exchangeRate) : undefined,
        notes: notes || undefined,
        lines: validLines.map((l) => ({
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
    const { purchaseOrder } = await res.json();
    router.push(`/purchase-orders/${purchaseOrder.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-card p-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1">Supplier *</label>
          <select
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              const s = suppliers.find((s) => s.id === e.target.value);
              if (s) setCurrency(s.currency.toUpperCase());
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Issue Date *</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Expected Delivery</label>
          <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Currency</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono" />
        </div>
        {isForeignCurrency && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Exchange rate <span className="font-normal text-muted-foreground">(1 {currency} = ? {baseCurrency})</span>
            </label>
            <input type="number" step="any" min="0" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            <p className="mt-1 text-xs text-muted-foreground">
              No live rate lookup — enter the agreed rate. Received stock is valued in {baseCurrency} at this rate.
            </p>
          </div>
        )}
        {projects.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Project (optional)</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
              <option value="">— None —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="rounded-md border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-40">Item</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Qty</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Unit Price</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-32">Tax</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l, i) => {
              const lt = (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0);
              const tax = lt * taxRate(l.taxCodeId);
              const selected = products.find((p) => p.id === l.productId);
              return (
                <tr key={i}>
                  <td className="px-2 py-1">
                    <select value={l.productId} onChange={(e) => selectProduct(i, e.target.value)}
                      aria-label="Item"
                      className="w-full bg-transparent text-sm outline-none">
                      <option value="">Custom line</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {selected?.trackInventory && (
                      <p className="text-[10px] text-muted-foreground">{selected.quantityOnHand} in stock</p>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })}
                      placeholder="Item / service description"
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
                    {(lt + tax).toFixed(2)}
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
              <td colSpan={7} className="px-2 py-1">
                <button onClick={() => setLines((p) => [...p, emptyLine()])}
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Plus className="h-3 w-3" /> Add line
                </button>
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="px-3 py-1 text-right text-muted-foreground text-sm">Subtotal</td>
              <td className="px-3 py-1 text-right tabular-nums text-sm">{subtotal.toFixed(2)}</td>
              <td />
            </tr>
            <tr>
              <td colSpan={5} className="px-3 py-1 text-right text-muted-foreground text-sm">Tax</td>
              <td className="px-3 py-1 text-right tabular-nums text-sm">{taxTotal.toFixed(2)}</td>
              <td />
            </tr>
            <tr className="font-semibold">
              <td colSpan={5} className="px-3 py-1.5 text-right">Total</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{(subtotal + taxTotal).toFixed(2)} {currency}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          placeholder="Delivery instructions, terms…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-3">
        <button onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-1.5 text-sm">
          Cancel
        </button>
        <button onClick={submit} disabled={loading}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Creating…" : "Create Purchase Order"}
        </button>
      </div>
    </div>
  );
}
