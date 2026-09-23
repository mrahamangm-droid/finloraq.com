import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";

function statusColor(status: string) {
  if (status === "POSTED") return "bg-success/10 text-success";
  if (status === "REVERSED") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

export default async function JournalsPage() {
  const { active } = await requireTenantContext();

  const entries = await prisma.journalEntry.findMany({
    where: { companyId: active.companyId },
    orderBy: { date: "desc" },
    take: 100,
    include: { lines: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Journal Entries</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <Link
          href="/accounting/journals/new"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          New Journal Entry
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Entry #</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Memo</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No journal entries yet. Manual entries post here; Sales/Purchases (Phase 3)
                    will post automatically once built.
                  </td>
                </tr>
              )}
              {entries.map((e) => {
                const total = e.lines.reduce((acc, l) => acc + Number(l.debit), 0);
                return (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs text-card-foreground">{e.entryNumber}</td>
                    <td className="px-4 py-2 text-card-foreground">{e.date.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.sourceType}</td>
                    <td className="px-4 py-2 text-card-foreground">{e.memo ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-card-foreground">{total.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(e.status)}`}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
