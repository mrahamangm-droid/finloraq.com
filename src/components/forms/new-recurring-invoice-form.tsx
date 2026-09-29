"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

interface Customer { id: string; name: string; currency: string | null }
interface TaxCode { id: string; code: string; name: string; rate: string }

interface Props {
  customers: Customer[];
  taxCodes: TaxCode[];
  baseCurrency: string;
}

interface Line {
  description: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
}

const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Bi-weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUALLY", label: "Annually" },
];

export function NewRecurringInvoiceForm({ customers, taxCodes, baseCurrency }: Props) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [currency, setCurrency] = useState(baseCurrency);
  const [frequency, setFrequency] = useState("MONTHLY");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { description: "", quantity: "1", unitPrice: "", taxCodeId: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addLine() {
    setLines((prev) => [...prev, { description: "", quantity: "1", unitPrice: "", taxCodeId: "" }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: keyof Line, value: string) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      customerId,
      currency,
      frequency,
      startDate,
      endDate: endDate || undefined,
      notes: notes || undefined,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: parseFloat(l.quantity) || 1,
        unitPrice: parseFloat(l.unitPrice) || 0,
        taxCodeId: l.taxCodeId || undefined,
      })),
    };

    setLoading(true);
    const res = await fetch("/api/recurring-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to create recurring invoice.");
      return;
    }
    const ri = await res.json();
    router.push(`/recurring-invoices/${ri.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Header fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Customer *</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Currency</label>
          <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3} placeholder="USD"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Frequency *</label>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Start Date *</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">End Date (optional)</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
      </div>

      {/* Lines */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-2">Line Items</h3>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-5">
                <input type="text" value={line.description}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
                  placeholder="Description" required
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              </div>
              <div className="col-span-2">
                <input type="number" value={line.quantity} min="0" step="any"
                  onChange={(e) => updateLine(i, "quantity", e.target.value)}
                  placeholder="Qty" required
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              </div>
              <div className="col-span-2">
                <input type="number" value={line.unitPrice} min="0" step="any"
                  onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                  placeholder="Price" required
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              </div>
              <div className="col-span-2">
                <select value={line.taxCodeId} onChange={(e) => updateLine(i, "taxCodeId", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                  <option value="">No tax</option>
                  {taxCodes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} ({(Number(t.rate) * 100).toFixed(0)}%)
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-1 flex justify-center pt-1.5">
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(i)}
                    className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLine}
          className="mt-2 flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> Add line
        </button>
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <button type="submit" disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Creating…" : "Create Recurring Invoice"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
