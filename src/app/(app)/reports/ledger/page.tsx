import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { ledgerPeriodRange, ledgerReport, type LedgerAccountSection } from "@/lib/reports";

type SearchParams = { period?: string; value?: string; account?: string; detail?: string };

const fmt = (d: { toFixed: (n: number) => string }) => d.toFixed(2);
const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function LedgerPage({ searchParams }: { searchParams: SearchParams }) {
  const { active } = await requireTenantContext();
  const range = ledgerPeriodRange(searchParams.period, searchParams.value);
  const accountCode = searchParams.account || undefined;
  const showEntries = range.period === "monthly" || searchParams.detail === "1";

  const [sections, accounts] = await Promise.all([
    ledgerReport(active.companyId, range.from, range.to, accountCode),
    prisma.account.findMany({
      where: { companyId: active.companyId, isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
  ]);

  function href(overrides: Partial<SearchParams>) {
    const params = new URLSearchParams();
    const merged: SearchParams = {
      period: range.period,
      value: range.value,
      account: accountCode,
      detail: searchParams.detail,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/reports/ledger?${params.toString()}`;
  }

  const tab = (p: "monthly" | "yearly", label: string) => (
    <Link
      href={href({ period: p, value: undefined, detail: undefined })}
      className={`rounded-md px-3 py-1.5 text-sm ${
        range.period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Ledger — {range.period === "monthly" ? "Monthly" : "Yearly"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {active.company.name} · {range.label} ({day(range.from)} to {day(range.to)})
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {tab("monthly", "Monthly")}
          {tab("yearly", "Yearly")}
        </div>
      </div>

      <form method="get" action="/reports/ledger" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 text-sm">
        <input type="hidden" name="period" value={range.period} />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{range.period === "monthly" ? "Month" : "Year"}</span>
          {range.period === "monthly" ? (
            <input type="month" name="value" defaultValue={range.value} className="rounded-md border border-border bg-background px-2 py-1" />
          ) : (
            <input type="number" name="value" min={1900} max={9999} defaultValue={range.value} className="w-24 rounded-md border border-border bg-background px-2 py-1" />
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Account</span>
          <select name="account" defaultValue={accountCode ?? ""} className="rounded-md border border-border bg-background px-2 py-1">
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
            ))}
          </select>
        </label>
        {range.period === "yearly" && (
          <label className="flex items-center gap-2 pb-1">
            <input type="checkbox" name="detail" value="1" defaultChecked={searchParams.detail === "1"} />
            <span>Show every entry</span>
          </label>
        )}
        <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">Apply</button>
        <div className="ml-auto flex gap-2">
          <Link href={href({ value: range.prev })} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted/40">← Previous</Link>
          <Link href={href({ value: range.next })} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted/40">Next →</Link>
        </div>
      </form>

      {sections.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No posted entries or balances for {range.label}.
        </p>
      )}

      {sections.map((s) => (
        <AccountLedger key={s.accountCode} section={s} period={range.period} showEntries={showEntries} />
      ))}

      <p className="text-xs text-muted-foreground">
        Computed live from posted journal entries. Balances are shown in each account&apos;s natural
        sign (debit for assets and expenses, credit for liabilities, equity and revenue).
      </p>
    </div>
  );
}

function AccountLedger({
  section: s,
  period,
  showEntries,
}: {
  section: LedgerAccountSection;
  period: "monthly" | "yearly";
  showEntries: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
        <div className="font-medium text-card-foreground">
          {s.accountCode} · {s.accountName}
          <span className="ml-2 text-xs uppercase text-muted-foreground">{s.type}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Opening {fmt(s.opening)} · Closing <span className="font-semibold text-card-foreground">{fmt(s.closing)}</span>
        </div>
      </div>

      {period === "yearly" && (
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Month</th>
              <th className="px-4 py-2 text-right">Debit</th>
              <th className="px-4 py-2 text-right">Credit</th>
              <th className="px-4 py-2 text-right">Closing balance</th>
            </tr>
          </thead>
          <tbody>
            {s.months.map((m) => (
              <tr key={m.month} className="border-b border-border last:border-0">
                <td className="px-4 py-1.5 text-card-foreground">{m.label}</td>
                <td className="px-4 py-1.5 text-right">{m.debit.isZero() ? "—" : fmt(m.debit)}</td>
                <td className="px-4 py-1.5 text-right">{m.credit.isZero() ? "—" : fmt(m.credit)}</td>
                <td className="px-4 py-1.5 text-right text-card-foreground">{fmt(m.closing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showEntries && (
        <table className={`w-full text-sm ${period === "yearly" ? "border-t border-border" : ""}`}>
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Entry</th>
              <th className="px-4 py-2">Memo</th>
              <th className="px-4 py-2 text-right">Debit</th>
              <th className="px-4 py-2 text-right">Credit</th>
              <th className="px-4 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border text-muted-foreground">
              <td className="px-4 py-1.5" colSpan={5}>Opening balance</td>
              <td className="px-4 py-1.5 text-right">{fmt(s.opening)}</td>
            </tr>
            {s.entries.map((e, i) => (
              <tr key={`${e.entryNumber}-${i}`} className="border-b border-border">
                <td className="px-4 py-1.5 text-muted-foreground">{day(e.date)}</td>
                <td className="px-4 py-1.5 text-card-foreground">{e.entryNumber}</td>
                <td className="px-4 py-1.5 text-muted-foreground">{e.memo ?? ""}</td>
                <td className="px-4 py-1.5 text-right">{e.debit.isZero() ? "" : fmt(e.debit)}</td>
                <td className="px-4 py-1.5 text-right">{e.credit.isZero() ? "" : fmt(e.credit)}</td>
                <td className="px-4 py-1.5 text-right text-card-foreground">{fmt(e.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex justify-end gap-6 border-t border-border px-4 py-2 text-sm font-medium text-card-foreground">
        <span>Total debit {fmt(s.totalDebit)}</span>
        <span>Total credit {fmt(s.totalCredit)}</span>
        <span>Closing {fmt(s.closing)}</span>
      </div>
    </div>
  );
}
