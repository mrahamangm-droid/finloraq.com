"use client";

import { useState, useCallback, useRef } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface AccountOption {
  code: string;
  name: string;
  type: string;
}

export interface BudgetEditorProps {
  budgetId: string;
  fiscalYear: number;
  currency: string;
  /** All accounts from the chart of accounts (typically REVENUE + EXPENSE) */
  accounts: AccountOption[];
  /** Existing budget items: accountCode → month → amount */
  initialData: Record<string, Record<number, number>>;
}

interface GridRow {
  key: string; // unique key for React
  accountCode: string;
  amounts: Record<number, string>; // month 1-12 → string value (empty = 0)
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function BudgetEditor({ budgetId, fiscalYear, currency, accounts, initialData }: BudgetEditorProps) {
  const accountMap = Object.fromEntries(accounts.map((a) => [a.code, a]));

  // Build initial rows from initialData (one row per account that has any data)
  const buildInitialRows = (): GridRow[] => {
    const accountsWithData = Object.keys(initialData);
    if (accountsWithData.length === 0) return [];
    return accountsWithData.map((code, i) => ({
      key: `${code}-${i}`,
      accountCode: code,
      amounts: Object.fromEntries(
        Object.entries(initialData[code] ?? {}).map(([m, v]) => [m, v === 0 ? "" : String(v)])
      ),
    }));
  };

  const [rows, setRows] = useState<GridRow[]>(buildInitialRows);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const keyCounter = useRef(0);

  const addRow = useCallback((accountCode = "") => {
    keyCounter.current += 1;
    setRows((prev) => [
      ...prev,
      { key: `new-${keyCounter.current}`, accountCode, amounts: {} },
    ]);
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const setRowAccount = useCallback((key: string, code: string) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, accountCode: code } : r))
    );
  }, []);

  const setCell = useCallback((key: string, month: number, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? { ...r, amounts: { ...r.amounts, [month]: value } }
          : r
      )
    );
  }, []);

  // Tab to next cell: within a row, then first cell of next row
  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, month: number) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const nextMonth = month < 12 ? month + 1 : null;
        const nextRowIndex = month === 12 ? rowIndex + 1 : null;
        if (nextMonth !== null) {
          const el = document.querySelector<HTMLInputElement>(
            `[data-cell="${rows[rowIndex]?.key}-${nextMonth}"]`
          );
          el?.focus();
        } else if (nextRowIndex !== null && nextRowIndex < rows.length) {
          const el = document.querySelector<HTMLInputElement>(
            `[data-cell="${rows[nextRowIndex]?.key}-1"]`
          );
          el?.focus();
        }
      }
    },
    [rows]
  );

  const save = async () => {
    setSaveState("saving");
    setErrorMsg("");

    // Build the items list
    const items: Array<{ accountCode: string; month: number; amount: number }> = [];
    for (const row of rows) {
      if (!row.accountCode) continue;
      for (let m = 1; m <= 12; m++) {
        const raw = row.amounts[m] ?? "";
        const amount = raw === "" ? 0 : parseFloat(raw);
        if (!isNaN(amount) && amount !== 0) {
          items.push({ accountCode: row.accountCode, month: m, amount });
        }
      }
    }

    try {
      const res = await fetch(`/api/budgets/${budgetId}/items`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Save failed");
      setSaveState("error");
    }
  };

  // Row totals
  const rowTotal = (row: GridRow) =>
    Array.from({ length: 12 }, (_, i) => parseFloat(row.amounts[i + 1] ?? "") || 0).reduce(
      (a, b) => a + b,
      0
    );

  // Column totals (per month)
  const colTotal = (month: number) =>
    rows.reduce((a, r) => a + (parseFloat(r.amounts[month] ?? "") || 0), 0);

  const grandTotal = rows.reduce((a, r) => a + rowTotal(r), 0);

  // Group accounts by type for the add-row dropdown
  const grouped = accounts.reduce<Record<string, AccountOption[]>>((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          Fiscal Year <span className="font-medium text-foreground">{fiscalYear}</span>
          {" · "}Currency <span className="font-medium text-foreground">{currency}</span>
        </div>
        <div className="flex items-center gap-2">
          {saveState === "error" && (
            <span className="text-xs text-destructive">{errorMsg}</span>
          )}
          {saveState === "saved" && (
            <span className="text-xs text-emerald-600">✓ Saved</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saveState === "saving"}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saveState === "saving" ? "Saving…" : "Save Budget"}
          </button>
        </div>
      </div>

      {/* Spreadsheet */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium text-muted-foreground min-w-[200px]">
                Account
              </th>
              {MONTHS.map((m, i) => (
                <th key={m} className="px-2 py-2 text-right font-medium text-muted-foreground min-w-[80px] whitespace-nowrap">
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium text-muted-foreground min-w-[90px] border-l border-border">
                Total
              </th>
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={15}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No accounts added yet. Click &quot;+ Add Account Row&quot; below to start.
                </td>
              </tr>
            )}
            {rows.map((row, rowIndex) => {
              const total = rowTotal(row);
              const account = accountMap[row.accountCode];
              return (
                <tr key={row.key} className="border-b border-border last:border-0 hover:bg-muted/20 group">
                  {/* Account selector */}
                  <td className="sticky left-0 bg-card group-hover:bg-muted/20 px-2 py-1.5">
                    <select
                      value={row.accountCode}
                      onChange={(e) => setRowAccount(row.key, e.target.value)}
                      className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      <option value="">— Select account —</option>
                      {Object.entries(grouped).map(([type, accts]) => (
                        <optgroup key={type} label={type}>
                          {accts.map((a) => (
                            <option key={a.code} value={a.code}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {account && (
                      <div className="text-muted-foreground text-xs mt-0.5 pl-1 truncate">
                        {account.type}
                      </div>
                    )}
                  </td>

                  {/* Month cells */}
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <td key={month} className="px-1 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.amounts[month] ?? ""}
                        placeholder="0"
                        data-cell={`${row.key}-${month}`}
                        onChange={(e) => setCell(row.key, month, e.target.value)}
                        onKeyDown={(e) => handleCellKeyDown(e, rowIndex, month)}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-right text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 hover:border-border"
                      />
                    </td>
                  ))}

                  {/* Row total */}
                  <td className="px-3 py-1.5 text-right font-medium border-l border-border text-foreground">
                    {total !== 0 ? total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </td>

                  {/* Remove button */}
                  <td className="px-1 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="invisible group-hover:visible text-muted-foreground hover:text-destructive rounded p-0.5"
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Totals footer */}
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40">
                <td className="sticky left-0 bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground">
                  Total
                </td>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                  const t = colTotal(month);
                  return (
                    <td key={month} className="px-2 py-2 text-right text-xs font-semibold text-foreground">
                      {t !== 0
                        ? t.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : "—"}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right text-xs font-bold text-foreground border-l border-border">
                  {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Add row */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => addRow()}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          + Add Account Row
        </button>
        <span className="text-xs text-muted-foreground">
          Press Tab to move between cells.
        </span>
      </div>

      {/* Keyboard shortcut hint */}
      <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-4 py-2">
        <span className="font-medium">Tips:</span>{" "}
        Enter amounts for each month. Leave blank (or 0) to exclude from the report.
        Click &quot;Save Budget&quot; when done — changes are not auto-saved.
        {" "}
        <a href={`/reports/budget-vs-actual?budgetId=${budgetId}`} className="text-primary hover:underline">
          Open Budget vs Actual report →
        </a>
      </div>
    </div>
  );
}
