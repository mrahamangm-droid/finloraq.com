"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExpenseRowActions } from "@/components/forms/expense-row-actions";
import { MathInput } from "@/components/forms/math-input";

export type ExpenseRowData = {
  id: string;
  date: string; // yyyy-mm-dd
  memo: string;
  /** Always the company's base currency — see createExpense in src/lib/expenses.ts. */
  amount: number;
  taxAmount?: number;
  expenseAccountCode?: string;
  status: string;
  /** The expense's own currency (equal to baseCurrency for a base-currency expense). */
  currency: string;
  exchangeRate: number;
};

/**
 * Renders one Expenses-page row, with an inline edit mode for DRAFT
 * expenses (mirrors CustomerRow/SupplierRow) — editing a submitted-but-
 * unapproved expense in place rather than deleting and recreating it.
 * Gated on expenses:EDIT via `canEdit`, same permission updateDraftExpense()
 * in src/lib/expenses.ts enforces server-side.
 */
export function ExpenseRow({
  expense,
  baseCurrency,
  canEdit,
  moneyDisplay,
  originalDisplay,
  dateDisplay,
}: {
  expense: ExpenseRowData;
  baseCurrency: string;
  canEdit: boolean;
  moneyDisplay: string;
  /** The amount in the expense's own currency, e.g. "100.00 USD" — set only
   *  for a foreign-currency expense. */
  originalDisplay?: string;
  dateDisplay: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The existing amount/tax are base currency (see ExpenseRowData); the
  // form edits the expense's OWN currency, so seed it from the original
  // display when there is one, otherwise the base amount is already the
  // own-currency amount (a base-currency expense).
  const initialOwnAmount = expense.currency !== baseCurrency ? expense.amount / expense.exchangeRate : expense.amount;
  const initialOwnTax = expense.taxAmount !== undefined ? (expense.currency !== baseCurrency ? expense.taxAmount / expense.exchangeRate : expense.taxAmount) : undefined;
  const [form, setForm] = useState({
    date: expense.date,
    description: expense.memo,
    amount: String(initialOwnAmount.toFixed(2)),
    taxAmount: initialOwnTax !== undefined ? String(initialOwnTax.toFixed(2)) : "",
    currency: expense.currency,
    exchangeRate: String(expense.exchangeRate),
  });
  const isForeignCurrency = form.currency.trim().toUpperCase() !== baseCurrency.trim().toUpperCase();

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/expenses/${expense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        description: form.description,
        amount: parseFloat(form.amount) || 0,
        taxAmount: form.taxAmount ? parseFloat(form.taxAmount) || 0 : undefined,
        currency: form.currency,
        exchangeRate: isForeignCurrency ? parseFloat(form.exchangeRate) || undefined : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <tr className="border-b border-border bg-muted/20 last:border-0">
        <td className="px-4 py-2">
          <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="w-36 rounded border border-border bg-background px-2 py-1 text-xs" />
        </td>
        <td className="px-4 py-2">
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
        </td>
        <td className="px-4 py-2 text-right">
          <div className="flex flex-wrap items-center justify-end gap-1">
            <MathInput decimals={2} value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} className="w-24 rounded border border-border bg-background px-2 py-1 text-right text-xs" />
            <MathInput decimals={2} placeholder="Tax" value={form.taxAmount} onChange={(v) => setForm((f) => ({ ...f, taxAmount: v }))} className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-xs" />
            <input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} maxLength={3}
              title="Currency" className="w-14 rounded border border-border bg-background px-2 py-1 text-right text-xs font-mono uppercase" />
            {isForeignCurrency && (
              <input type="number" step="any" min="0" value={form.exchangeRate} onChange={(e) => setForm((f) => ({ ...f, exchangeRate: e.target.value }))}
                title={`Exchange rate (1 ${form.currency} = ? ${baseCurrency})`}
                className="w-16 rounded border border-border bg-background px-2 py-1 text-right text-xs" />
            )}
          </div>
        </td>
        <td className="px-4 py-2" colSpan={2}>
          <div className="flex items-center justify-end gap-2">
            {error && <span className="text-xs text-destructive">{error}</span>}
            <button onClick={() => setEditing(false)} disabled={saving} className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2 text-muted-foreground">{dateDisplay}</td>
      <td className="px-4 py-2 text-card-foreground">{expense.memo}</td>
      <td className="px-4 py-2 text-right text-card-foreground">
        {moneyDisplay}
        {originalDisplay && <div className="text-xs text-muted-foreground">{originalDisplay}</div>}
      </td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${expense.status === "POSTED" ? "bg-success/10 text-success" : expense.status === "REVERSED" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
          {expense.status}
        </span>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          {expense.status === "DRAFT" && canEdit && (
            <button onClick={() => setEditing(true)} className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted">
              Edit
            </button>
          )}
          <ExpenseRowActions journalEntryId={expense.id} status={expense.status} />
        </div>
      </td>
    </tr>
  );
}
