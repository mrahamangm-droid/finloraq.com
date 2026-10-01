"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MathInput } from "@/components/forms/math-input";

export interface OpeningAccount {
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  purpose: string | null;
}

type Amounts = Record<string, { debit: string; credit: string }>;

const TYPE_LABEL: Record<OpeningAccount["type"], string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  REVENUE: "Revenue (year to date)",
  EXPENSE: "Expenses (year to date)",
};

/** "1,234.5" → 123450 cents; display-only — the server re-checks with exact decimals. */
function cents(v: string): number {
  const n = Number.parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const fmt = (c: number) => (c / 100).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OpeningBalancesForm({
  accounts,
  defaultDate,
  baseCurrency,
  otherPostedCount,
  earliestOtherDate,
}: {
  accounts: OpeningAccount[];
  defaultDate: string;
  baseCurrency: string;
  otherPostedCount: number;
  earliestOtherDate: string | null;
}) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [amounts, setAmounts] = useState<Amounts>({});
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const equity = accounts.filter((a) => a.type === "EQUITY");
  const [plugCode, setPlugCode] = useState(equity[0]?.code ?? "");

  const { debit, credit } = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const a of Object.values(amounts)) {
      d += cents(a.debit);
      c += cents(a.credit);
    }
    return { debit: d, credit: c };
  }, [amounts]);
  const diff = debit - credit;
  const balanced = diff === 0 && debit > 0;
  const needsAck = otherPostedCount > 0;

  function set(code: string, side: "debit" | "credit", value: string) {
    setAmounts((prev) => ({ ...prev, [code]: side === "debit" ? { debit: value, credit: "" } : { debit: "", credit: value } }));
  }

  /** Adds the difference to the chosen equity account (as a visible line the user can still edit). */
  function plug() {
    if (!plugCode || diff === 0) return;
    const current = amounts[plugCode] ?? { debit: "", credit: "" };
    const net = cents(current.debit) - cents(current.credit) - diff; // what the plug account must net to
    set(plugCode, net >= 0 ? "debit" : "credit", (Math.abs(net) / 100).toFixed(2));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    const lines = Object.entries(amounts)
      .filter(([, a]) => cents(a.debit) !== 0 || cents(a.credit) !== 0)
      .map(([accountCode, a]) => ({
        accountCode,
        debit: a.debit ? (cents(a.debit) / 100).toFixed(2) : undefined,
        credit: a.credit ? (cents(a.credit) / 100).toFixed(2) : undefined,
      }));
    const res = await fetch("/api/opening-balances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, lines, acknowledgeExistingActivity: needsAck ? ack : undefined }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not post opening balances.");
      return;
    }
    router.refresh();
  }

  const groups = (Object.keys(TYPE_LABEL) as OpeningAccount["type"][])
    .map((t) => ({ type: t, rows: accounts.filter((a) => a.type === t) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-5">
      {needsAck && (
        <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground">
          <p className="font-medium">This company already has {otherPostedCount} posted journal entr{otherPostedCount === 1 ? "y" : "ies"}
            {earliestOtherDate ? `, the earliest dated ${earliestOtherDate}` : ""}.</p>
          <p className="mt-1 text-muted-foreground">
            Opening balances normally go in before any other posting. Posting them now adds to whatever is already in
            these accounts, so enter only what isn&apos;t in Finloraq yet, or the balances will double up.
          </p>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            I understand — post the opening balances anyway.
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-card-foreground">
          Opening balances as of
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Usually the last day before you start recording in Finloraq, e.g. your previous year end.
          </span>
        </label>
        <p className="text-xs text-muted-foreground">
          Enter each account&apos;s closing balance from your old system&apos;s trial balance, in {baseCurrency}. Assets and expenses
          are usually debits; liabilities, equity and revenue usually credits. Accounts Receivable and Payable entered here
          post to the control account only, so they won&apos;t appear in AR/AP aging. To chase them invoice by invoice,
          enter the unpaid invoices and bills instead and leave AR/AP blank here.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Account</th>
              <th className="w-36 px-3 py-2 text-right">Debit</th>
              <th className="w-36 px-3 py-2 text-right">Credit</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.type}>
              <tr className="bg-muted/20">
                <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{TYPE_LABEL[g.type]}</td>
              </tr>
              {g.rows.map((a) => (
                <tr key={a.code} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5">
                    <span className="font-mono text-xs text-muted-foreground">{a.code}</span>{" "}
                    <span className="text-card-foreground">{a.name}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <MathInput
                      decimals={2}
                      value={amounts[a.code]?.debit ?? ""}
                      onChange={(v) => set(a.code, "debit", v)}
                      aria-label={`${a.name} debit`}
                      className="w-full rounded border border-border bg-background px-2 py-1 text-right text-xs"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <MathInput
                      decimals={2}
                      value={amounts[a.code]?.credit ?? ""}
                      onChange={(v) => set(a.code, "credit", v)}
                      aria-label={`${a.name} credit`}
                      className="w-full rounded border border-border bg-background px-2 py-1 text-right text-xs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot className="border-t border-border font-medium">
            <tr>
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(debit)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm">
        <span className={balanced ? "text-success" : "text-destructive"} role="status">
          {balanced ? "Balanced — debits equal credits." : diff === 0 ? "Enter at least one balance." : `Out of balance by ${fmt(Math.abs(diff))} (${diff > 0 ? "more debits" : "more credits"}).`}
        </span>
        {diff !== 0 && equity.length > 0 && (
          <span className="flex items-center gap-2">
            <select value={plugCode} onChange={(e) => setPlugCode(e.target.value)} aria-label="Equity account for the difference" className="rounded-md border border-border bg-background px-2 py-1 text-xs">
              {equity.map((a) => (
                <option key={a.code} value={a.code}>{a.code} {a.name}</option>
              ))}
            </select>
            <button type="button" onClick={plug} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted">
              Put the difference here
            </button>
          </span>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!balanced || busy || (needsAck && !ack)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Posting…" : "Post opening balances"}
      </button>
    </div>
  );
}
