import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { can } from "@/lib/rbac";
import { getFormatter } from "@/lib/customization/server";
import { listPeriods, latestLocked, monthName } from "@/lib/periodClose";
import { PeriodCloseManager } from "@/components/accounting/period-close-manager";

export default async function AccountingPeriodsPage() {
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "accounting");
  if (denied) return denied;

  const [periods, canLock, canUnlock, fmt] = await Promise.all([
    listPeriods(active.companyId),
    can(active.id, "journals", "APPROVE"),
    can(active.id, "accounting", "APPROVE"),
    getFormatter(userId),
  ]);
  const latest = latestLocked(periods);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Accounting periods</h1>
        <p className="text-sm text-muted-foreground">
          {active.company.name} · Lock a month once it&apos;s closed (for example after filing VAT). Nothing can be posted into a
          locked month; corrections go into an open month instead.
        </p>
      </div>
      <PeriodCloseManager
        periods={periods.map((p) => ({ ...p, lockedAt: p.lockedAt ? fmt.date(p.lockedAt) : null }))}
        latestLocked={latest}
        currentMonth={monthName(new Date())}
        canLock={canLock}
        canUnlock={canUnlock}
      />
    </div>
  );
}
