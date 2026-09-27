"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExpenseRowActions } from "@/components/forms/expense-row-actions";

export type ExpenseRowData = {
  id: string;
  date: string; // yyyy-mm-dd
  memo: string;
  amount: number;
  taxAmount?: number;
  expenseAccountCode?: string;
  status: string;
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
  canEdit,
  moneyDisplay,
  dateDisplay,
}: {
  expense: ExpenseRowData;
  canEdit: boolean;
  moneyDisplay: string;
  dateDisplay: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: expense.date,
    description: expense.memo,
    amount: String(expense.amount),
    taxAmount: expense.taxAmount ? String(expense.taxAmount) : "",
  });

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
          <div className="flex items-center justify-end gap-1">
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="w-24 rounded border border-border bg-background px-2 py-1 text-right text-xs" />
            <input type="number" step="0.01" placeholder="Tax" value={form.taxAmount} onChange={(e) => setForm((f) => ({ ...f, taxAmount: e.target.value }))} className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-xs" />
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
      <td className="px-4 py-2 text-right text-card-foreground">{moneyDisplay}</td>
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
