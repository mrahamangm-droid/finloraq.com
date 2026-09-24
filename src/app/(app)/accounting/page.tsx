import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export default async function ChartOfAccountsPage() {
  const { active } = await requireTenantContext();

  const accounts = await prisma.account.findMany({
    where: { companyId: active.companyId },
    orderBy: { code: "asc" },
  });

  const grouped = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/accounting/journals"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            Journal Entries
          </Link>
          <Link
            href="/accounting/reports/trial-balance"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            Trial Balance
          </Link>
          <Link
            href="/accounting/reports/profit-and-loss"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            Profit &amp; Loss
          </Link>
          <Link
            href="/accounting/reports/balance-sheet"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Balance Sheet
          </Link>
        </div>
      </div>

      {grouped.map((type) => {
        const rows = accounts.filter((a) => a.type === type);
        if (rows.length === 0) return null;
        return (
          <div key={type} className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {type}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="w-24 px-4 py-2 text-muted-foreground">{a.code}</td>
                      <td className="px-4 py-2 text-card-foreground">{a.name}</td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                        {a.isSystem ? "System" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
