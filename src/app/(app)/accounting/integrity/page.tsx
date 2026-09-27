import { ReportActions } from "@/components/reports/report-actions";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { runIntegrityCheck } from "@/lib/integrity";

/**
 * A whole-ledger integrity/reconciliation sweep, re-run fresh on every
 * page load (router.refresh() from any action elsewhere in the app, or
 * simply reopening this page, gets an up-to-date result — there's no
 * cached "last run" state to go stale). See src/lib/integrity.ts for
 * what each check actually verifies and why.
 */
export default async function IntegrityCheckPage() {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);
  const report = await runIntegrityCheck(active.companyId, new Date());

  return (
    <div id="report-content" className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Ledger Integrity Check</h1>
        <p className="text-sm text-muted-foreground">
          {active.company.name} · as of {fmt.date(report.asOf)}
        </p>
      </div>
      <ReportActions title="Ledger Integrity Check" company={active.company.name} />

      <div
        className={`rounded-lg border p-4 text-sm font-medium ${
          report.allPassed
            ? "border-success/30 bg-success/10 text-success"
            : "border-destructive/30 bg-destructive/10 text-destructive"
        }`}
      >
        {report.allPassed
          ? `All ${report.checks.length} checks passed — no integrity or reconciliation issues found.`
          : `${report.checks.filter((c) => !c.passed).length} of ${report.checks.length} checks found an issue — see below.`}
      </div>

      <div className="space-y-3">
        {report.checks.map((check) => (
          <div key={check.name} className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${check.passed ? "bg-success" : "bg-destructive"}`}
                    aria-hidden
                  />
                  <span className="font-medium text-card-foreground">{check.name}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{check.description}</p>
              </div>
              <span className={`text-xs font-semibold uppercase ${check.passed ? "text-success" : "text-destructive"}`}>
                {check.passed ? "Passed" : `${check.issues.length} issue${check.issues.length === 1 ? "" : "s"}`}
              </span>
            </div>
            {!check.passed && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {Object.keys(check.issues[0]!).map((key) => (
                        <th key={key} className="px-4 py-1.5">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {check.issues.map((issue, i) => (
                      <tr key={i} className="border-t border-border">
                        {Object.values(issue).map((value, j) => (
                          <td key={j} className="px-4 py-1.5 font-mono text-card-foreground">{String(value)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        This page only detects and reports — it never repairs data. A genuine issue found here is
        corrected the same way any posted entry is corrected: a reversal or adjustment entry, never
        an edit to history. If duplicate-source-postings ever shows a real hit, treat it as a
        priority — it means the same invoice/bill/payment/expense posted to the ledger twice.
      </p>
    </div>
  );
}
