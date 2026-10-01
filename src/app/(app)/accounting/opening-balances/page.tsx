import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { defaultOpeningDate, openingBalanceStatus } from "@/lib/openingBalances";
import { OpeningBalancesForm, type OpeningAccount } from "@/components/forms/opening-balances-form";

export const metadata = { title: "Opening Balances — Finloraq" };

export default async function OpeningBalancesPage() {
  const { active } = await requireTenantContext();
  const denied = await viewGate(active.id, "accounting");
  if (denied) return denied;

  const [canCreate, canApprove, status, accounts] = await Promise.all([
    can(active.id, "accounting", "CREATE"),
    can(active.id, "journals", "APPROVE"),
    openingBalanceStatus(active.companyId),
    prisma.account.findMany({
      where: { companyId: active.companyId, isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true, type: true, purpose: true },
    }),
  ]);
  const canPost = canCreate && canApprove;
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Opening Balances</h1>
        <p className="text-sm text-muted-foreground">
          Moving from another accounting system or spreadsheets? Enter your starting trial balance once. It posts as a
          single balanced journal entry, the same as any other, so every report starts from the right numbers.
        </p>
      </div>

      {status.entries.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          <h2 className="mb-2 font-semibold text-card-foreground">Posted opening balances</h2>
          <ul className="space-y-1">
            {status.entries.map((e) => (
              <li key={e.id}>
                <Link href={`/accounting/journals/${e.id}`} className="font-mono text-xs text-primary hover:underline">{e.entryNumber}</Link>
                <span className="text-muted-foreground"> · as of {iso(e.date)}{e.reversed ? " · reversed" : ""}</span>
              </li>
            ))}
          </ul>
          {status.live && (
            <p className="mt-3 text-xs text-muted-foreground">
              To change them, open {status.live.entryNumber} and reverse it (posted entries are never edited), then come
              back here to post the corrected balances.
            </p>
          )}
        </div>
      )}

      {status.live ? null : !canPost ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Posting opening balances needs permission to create accounting entries and approve journals. Ask a Company
          Admin, CFO or Finance Manager.
        </p>
      ) : (
        <OpeningBalancesForm
          accounts={accounts as OpeningAccount[]}
          defaultDate={iso(defaultOpeningDate(active.company.fiscalYearEnd))}
          baseCurrency={active.company.baseCurrency}
          otherPostedCount={status.otherPostedCount}
          earliestOtherDate={status.earliestOtherDate ? iso(status.earliestOtherDate) : null}
        />
      )}
    </div>
  );
}
