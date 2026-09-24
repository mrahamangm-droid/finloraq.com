import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { ledgerReport, type LedgerAccountSection } from "@/lib/reports";
import { GRANULARITY_LABELS, pickerProps, resolvePeriod } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";

type SearchParams = { period?: string; date?: string; from?: string; to?: string; value?: string; account?: string; detail?: string };

const fmt = (d: { toFixed: (n: number) => string }) => d.toFixed(2);
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Links made before the shared picker used ?period=monthly&value=2024-03 / ?period=yearly&value=2024. */
function legacy(sp: SearchParams): SearchParams {
  if (sp.period === "monthly" && /^\d{4}-\d{2}$/.test(sp.value ?? "")) return { ...sp, period: "month", date: `${sp.value}-01` };
  if (sp.period === "yearly" && /^\d{4}$/.test(sp.value ?? "")) return { ...sp, period: "year", date: `${sp.value}-01-01` };
  if (sp.period === "monthly") return { ...sp, period: "month" };
  if (sp.period === "yearly") return { ...sp, period: "year" };
  return sp;
}

export default async function LedgerPage({ searchParams }: { searchParams: SearchParams }) {
  const { active } = await requireTenantContext();
  const sp = legacy(searchParams);
  const range = resolvePeriod(sp);
  const accountCode = sp.account || undefined;
  // Longer periods get a month-by-month summary; entry detail is on request.
  const long = range.to.getTime() - range.from.getTime() > 45 * 86_400_000;
  const showEntries = !long || sp.detail === "1";

  const [sections, accounts] = await Promise.all([
    ledgerReport(active.companyId, range.from, range.to, accountCode),
    prisma.account.findMany({
      where: { companyId: active.companyId, isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Ledger — {GRANULARITY_LABELS[range.granularity]}</h1>
        <p className="text-sm text-muted-foreground">
          {active.company.name} · {range.label} ({day(range.from)} to {day(range.to)})
        </p>
      </div>

      <PeriodPicker {...pickerProps(range)} />

      <form method="get" action="/reports/ledger" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 text-sm">
        <input type="hidden" name="period" value={range.granularity} />
        {range.granularity === "custom" ? (
          <>
            <input type="hidden" name="from" value={day(range.from)} />
            <input type="hidden" name="to" value={day(range.to)} />
          </>
        ) : (
          <input type="hidden" name="date" value={range.date} />
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Account</span>
          <select name="account" defaultValue={accountCode ?? ""} className="rounded-md border border-border bg-background px-2 py-1">
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
            ))}
          </select>
        </label>
        {long && (
          <label className="flex items-center gap-2 pb-1">
            <input type="checkbox" name="detail" value="1" defaultChecked={sp.detail === "1"} />
            <span>Show every entry</span>
          </label>
        )}
        <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">Apply</button>
      </form>

      {sections.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No posted entries or balances for {range.label}.
        </p>
      )}

      {sections.map((s) => (
        <AccountLedger key={s.accountCode} section={s} period={long ? "yearly" : "monthly"} showEntries={showEntries} />
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
