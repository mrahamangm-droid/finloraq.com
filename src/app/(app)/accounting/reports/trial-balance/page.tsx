import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { trialBalance } from "@/lib/reports";

export default async function TrialBalancePage() {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);
  const asOf = new Date();
  const rows = await trialBalance(active.companyId, asOf);

  const totalDebit = rows.reduce((a, r) => a + r.debit.toNumber(), 0);
  const totalCredit = rows.reduce((a, r) => a + r.credit.toNumber(), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Trial Balance</h1>
        <p className="text-sm text-muted-foreground">
          {active.company.name} · as of {fmt.date(asOf)}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Account</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2 text-right">Debit</th>
                <th className="px-4 py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No posted journal entries yet — the trial balance is legitimately empty.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.accountCode} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.accountCode}</td>
                  <td className="px-4 py-2 text-card-foreground">{r.accountName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.type}</td>
                  <td className="px-4 py-2 text-right text-card-foreground">{fmt.money(r.debit)}</td>
                  <td className="px-4 py-2 text-right text-card-foreground">{fmt.money(r.credit)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-medium">
                  <td colSpan={3} className="px-4 py-2 text-card-foreground">
                    Total
                  </td>
                  <td className="px-4 py-2 text-right text-card-foreground">{fmt.money(totalDebit)}</td>
                  <td className="px-4 py-2 text-right text-card-foreground">{fmt.money(totalCredit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {rows.length > 0 && !balanced && (
        <p className="text-sm font-medium text-destructive">
          Debits and credits do not match — this indicates a bug in the posting engine, not a
          normal state. It should be structurally impossible given validateBalanced(); flag this
          immediately if you ever see it.
        </p>
      )}
    </div>
  );
}
