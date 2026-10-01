import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { NewAccountForm } from "@/components/forms/new-account-form";
import { AccountRow } from "@/components/forms/account-row";

export default async function ChartOfAccountsPage() {
  const { active } = await requireTenantContext();
  const denied = await viewGate(active.id, "accounting");
  if (denied) return denied;

  const [accounts, canCreate, canEdit, canDelete] = await Promise.all([
    prisma.account.findMany({
      where: { companyId: active.companyId },
      orderBy: { code: "asc" },
    }),
    can(active.id, "accounting", "CREATE"),
    can(active.id, "accounting", "EDIT"),
    can(active.id, "accounting", "DELETE"),
  ]);

  // Which accounts already have posted/draft journal lines against them —
  // those lock their code/type in the edit row (see updateAccount()).
  const used = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: { accountId: { in: accounts.map((a: any) => a.id) } },
  });
  const lockedIds = new Set(used.map((u: any) => u.accountId));

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
            href="/accounting/opening-balances"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            Opening Balances
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
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            Balance Sheet
          </Link>
          <Link
            href="/accounting/integrity"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Integrity Check
          </Link>
          <Link
            href="/accounting/periods"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Periods
          </Link>
        </div>
      </div>

      {canCreate && <NewAccountForm />}

      {grouped.map((type) => {
        const rows = accounts.filter((a: any) => a.type === type);
        if (rows.length === 0) return null;
        return (
          <div key={type} className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {type}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((a: any) => (
                    <AccountRow key={a.id} account={a} canEdit={canEdit} canDelete={canDelete} locked={lockedIds.has(a.id)} />
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
