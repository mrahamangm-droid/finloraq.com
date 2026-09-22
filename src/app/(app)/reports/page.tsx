import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";

const REPORTS = [
  { href: "/accounting/reports/trial-balance", name: "Trial Balance", description: "Every account's debit/credit balance from posted entries." },
  { href: "/accounting/reports/profit-and-loss", name: "Profit & Loss", description: "Revenue and expenses for the current month." },
  { href: "/accounting/reports/balance-sheet", name: "Balance Sheet", description: "Assets, liabilities and equity as of today." },
  { href: "/reports/ar-aging", name: "AR Aging", description: "Outstanding customer invoices by days overdue." },
  { href: "/reports/ap-aging", name: "AP Aging", description: "Outstanding supplier bills by days overdue." },
  { href: "/taxes", name: "VAT Return", description: "Output tax vs input tax for the period." },
  { href: "/reports/cash-flow", name: "Cash-Flow Forecast", description: "30/60/90-day projection from AR/AP due dates, plus customer payment behavior." },
];

export default async function ReportsPage() {
  const { active } = await requireTenantContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30">
            <div className="font-medium text-card-foreground">{r.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">{r.description}</div>
          </Link>
        ))}
      </div>

      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Project profitability and budget-vs-actual live on each project&apos;s own page
        (Projects in the nav). Customer/supplier statements aren&apos;t built yet.
      </p>
    </div>
  );
}
