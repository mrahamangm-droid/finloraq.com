import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { ReverseButton } from "./reverse-button";

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return { title: `Journal Entry — Finloraq` };
}

export default async function JournalDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const entry = await prisma.journalEntry.findFirst({
    where: { id, companyId: active.companyId },
    include: {
      lines: {
        include: {
          account: true,
          costCentre: true,
          project: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!entry) notFound();

  const canPost = await can(active.id, "journals", "EDIT");

  const totalDebits = entry.lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
  const totalCredits = entry.lines.reduce((s: number, l: any) => s + Number(l.credit), 0);

  const statusColor: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    POSTED: "bg-blue-100 text-blue-700 dark:text-blue-300",
    REVERSED: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/accounting/journals" className="hover:underline">Journal Entries</Link>
            {" / "}
            <span className="font-mono">{entry.entryNumber}</span>
          </p>
          <h1 className="text-xl font-semibold text-foreground mt-1 font-mono">{entry.entryNumber}</h1>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColor[entry.status] ?? ""}`}>
            {entry.status}
          </span>
        </div>
        {canPost && entry.status === "POSTED" && (
          <ReverseButton journalId={entry.id} />
        )}
      </div>

      {/* Metadata */}
      <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Date</p>
          <p className="font-medium">{fmt.date(entry.date)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Source</p>
          <p className="font-medium">{entry.sourceType ?? "MANUAL"}</p>
        </div>
        {entry.sourceId && (
          <div>
            <p className="text-muted-foreground text-xs">Source ref</p>
            <p className="font-medium font-mono text-xs">{entry.sourceId}</p>
          </div>
        )}
        {entry.memo && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-muted-foreground text-xs">Memo</p>
            <p className="font-medium">{entry.memo}</p>
          </div>
        )}
        {entry.reversalOfId && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-muted-foreground text-xs">Reversal of</p>
            <Link href={`/accounting/journals/${entry.reversalOfId}`} className="font-mono text-xs text-primary hover:underline">
              {entry.reversalOfId}
            </Link>
          </div>
        )}
      </div>

      {/* Lines table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Account</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Cost centre</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Project</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Debit</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entry.lines.map((l: any) => (
                <tr key={l.id}>
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs text-muted-foreground">{l.account.code}</span>
                    {" "}
                    <span className="text-card-foreground">{l.account.name}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{l.description ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">{l.costCentre?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">{l.project?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-card-foreground">
                    {Number(l.debit) > 0 ? fmt.money(l.debit) : ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-card-foreground">
                    {Number(l.credit) > 0 ? fmt.money(l.credit) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/20">
              <tr className="font-medium">
                <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground text-xs uppercase tracking-wide">Totals</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.money(totalDebits)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.money(totalCredits)}</td>
              </tr>
              {Math.abs(totalDebits - totalCredits) > 0.005 && (
                <tr>
                  <td colSpan={6} className="px-4 py-2 text-center text-destructive text-xs font-medium">
                    ⚠ Entry is unbalanced: debits {fmt.money(totalDebits)} ≠ credits {fmt.money(totalCredits)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
