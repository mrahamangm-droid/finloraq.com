import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { requireTenantContext } from "@/lib/tenant";
import { ForbiddenError, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * ONE-OFF REMEDIATION — not a general-purpose endpoint.
 *
 * Madeen Building Contracting LLC's FY2023 books accumulated thousands of
 * POSTED journal entries from earlier, separate import/entry passes
 * (an English EXP23-#### batch and a parallel Arabic-labelled batch that
 * largely restate the same underlying transactions) before the clean,
 * duplicate-checked "Income Register" / "Expense Register" import landed
 * as two DRAFT entries. Per the user's explicit instruction, FY2023 should
 * reflect ONLY that last clean import.
 *
 * Posted entries are never edited or deleted elsewhere in this codebase
 * (see src/lib/ledger.ts) — corrections are reversal entries only. This
 * route follows that same convention (same shape as reverseJournalEntry
 * in ledger.ts: swapped debit/credit lines, sourceType REVERSAL, sourceId
 * = original entry id for duplicate-prevention) but dates each reversal on
 * the ORIGINAL entry's own date rather than "today", so the FY2023 report
 * actually nets to zero for these entries instead of just shifting the
 * imbalance into whatever period the script happens to run in. It also
 * batches the writes (createMany) instead of one postJournalEntry() call
 * per entry, since there are thousands of rows to reverse.
 *
 * GET  — read-only dry run: counts/sums what would be reversed.
 * POST — executes it. Requires {"confirm":"REVERSE-LEGACY-FY2023"} in the
 *        body so it can't be triggered by an accidental request.
 *
 * Delete this route once the cleanup has been run and confirmed.
 */

const START = new Date("2023-01-01T00:00:00.000Z");
const END = new Date("2023-12-31T23:59:59.999Z");

async function loadTargets(companyId: string) {
  return prisma.journalEntry.findMany({
    where: {
      companyId,
      status: "POSTED",
      date: { gte: START, lte: END },
      sourceType: { not: "REVERSAL" },
    },
    include: { lines: { include: { account: true } } },
    orderBy: { date: "asc" },
  });
}

/**
 * The set loadTargets() returns includes a handful of records that look
 * genuine rather than duplicate-import artifacts: real customer invoices
 * (sourceType INVOICE — confirmed against the Sales page: real customer
 * names, real due dates), and at least one MANUAL entry that's the opening
 * bank balance. Every confirmed duplicate-import posting in this ledger
 * (income and expense alike — this app's own importer tags both as
 * sourceType EXPENSE) falls under sourceType EXPENSE. Restricting the
 * reversal to that sourceType is the conservative choice: worst case it
 * misses something that also needs reversing (nothing is lost — it just
 * stays for a follow-up pass), never that it wrongly reverses a real
 * invoice, receipt or opening balance.
 */
function onlyDuplicateImportArtifacts(targets: Awaited<ReturnType<typeof loadTargets>>) {
  return targets.filter((e) => e.sourceType === "EXPENSE");
}

function summarize(targets: Awaited<ReturnType<typeof loadTargets>>) {
  let income = 0;
  let expense = 0;
  for (const e of targets) {
    for (const l of e.lines) {
      if (l.account.type === "REVENUE") income += Number(l.credit) - Number(l.debit);
      if (l.account.type === "EXPENSE") expense += Number(l.debit) - Number(l.credit);
    }
  }
  return { income, expense };
}

export async function GET() {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const targets = await loadTargets(ctx.active.companyId);
  const { income, expense } = summarize(targets);
  const nonExpense = targets.filter((e) => e.sourceType !== "EXPENSE");
  const willActuallyReverse = onlyDuplicateImportArtifacts(targets);
  const willReverseTotals = summarize(willActuallyReverse);

  return NextResponse.json({
    dryRun: true,
    note: "'willReverse*' is the exact scope POST executes (sourceType EXPENSE only). 'count'/'incomeToBeRemoved'/'expenseToBeRemoved' below describe everything in the 2023 date range for context, including the genuine records in nonExpenseFull that POST does NOT touch.",
    willReverseCount: willActuallyReverse.length,
    willReverseIncome: willReverseTotals.income,
    willReverseExpense: willReverseTotals.expense,
    count: targets.length,
    incomeToBeRemoved: income,
    expenseToBeRemoved: expense,
    sourceTypeBreakdown: targets.reduce<Record<string, number>>((acc, e) => {
      acc[e.sourceType] = (acc[e.sourceType] ?? 0) + 1;
      return acc;
    }, {}),
    sample: targets.slice(0, 8).map((e) => ({
      entryNumber: e.entryNumber,
      date: e.date,
      sourceType: e.sourceType,
      memo: e.memo,
    })),
    // Full detail on every non-EXPENSE entry in scope, so a human can check
    // each one isn't a genuine record (a real invoice, a real receipt, an
    // opening balance) before this route ever reverses anything.
    nonExpenseFull: nonExpense.map((e) => ({
      entryNumber: e.entryNumber,
      date: e.date,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      memo: e.memo,
      lines: e.lines.map((l) => ({ account: l.account.code, accountName: l.account.name, debit: l.debit, credit: l.credit, description: l.description })),
    })),
  });
}

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "REVERSE-LEGACY-FY2023") {
    return NextResponse.json({ error: 'Missing confirmation. Send {"confirm":"REVERSE-LEGACY-FY2023"}.' }, { status: 400 });
  }

  const allowed = await can(ctx.active.id, "journals", "APPROVE");
  if (!allowed) return NextResponse.json({ error: "Requires the APPROVE permission on Journals." }, { status: 403 });

  const allTargets = onlyDuplicateImportArtifacts(await loadTargets(ctx.active.companyId));
  const alreadyReversed = new Set(
    (
      await prisma.journalEntry.findMany({
        where: { companyId: ctx.active.companyId, sourceType: "REVERSAL", sourceId: { in: allTargets.map((t) => t.id) } },
        select: { sourceId: true },
      })
    ).map((r) => r.sourceId),
  );
  // Idempotent: re-running this after a partial or prior run only reverses
  // whatever hasn't already been reversed by this same routine.
  const targets = allTargets.filter((t) => !alreadyReversed.has(t.id));
  if (!targets.length) return NextResponse.json({ reversedCount: 0, incomeRemoved: 0, expenseRemoved: 0, skippedAlreadyReversed: allTargets.length });

  const periods = await prisma.accountingPeriod.findMany({ where: { companyId: ctx.active.companyId } });
  const periodFor = (d: Date) => {
    const p = periods.find((p) => p.startDate <= d && p.endDate >= d);
    if (!p) throw new Error(`No accounting period covers ${d.toISOString()}`);
    if (p.status === "LOCKED") throw new Error(`Period ${p.name} is locked — unlock it before running this.`);
    return p;
  };

  const last = await prisma.journalEntry.findFirst({
    where: { companyId: ctx.active.companyId },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });
  let seq = last ? parseInt(last.entryNumber.replace(/\D/g, ""), 10) || 0 : 0;

  const { income, expense } = summarize(targets);

  const entryRows: Prisma.JournalEntryCreateManyInput[] = [];
  const lineRows: Prisma.JournalLineCreateManyInput[] = [];

  for (const orig of targets) {
    seq += 1;
    const id = randomUUID();
    const period = periodFor(orig.date);
    entryRows.push({
      id,
      companyId: ctx.active.companyId,
      periodId: period.id,
      entryNumber: `JE-${String(seq).padStart(6, "0")}`,
      date: orig.date,
      sourceType: "REVERSAL",
      sourceId: orig.id,
      memo: `Bulk reversal — superseded by the reconciled FY2023 workbook import (was ${orig.entryNumber}: ${orig.memo ?? orig.sourceType})`,
      status: "POSTED",
      currency: orig.currency,
      exchangeRate: orig.exchangeRate,
      postedAt: new Date(),
      postedBy: ctx.userId,
      createdBy: ctx.userId,
    });
    for (const l of orig.lines) {
      lineRows.push({
        id: randomUUID(),
        journalEntryId: id,
        accountId: l.accountId,
        debit: l.credit,
        credit: l.debit,
        costCentreId: l.costCentreId,
        departmentId: l.departmentId,
        projectId: l.projectId,
        description: l.description,
      });
    }
  }

  const CHUNK = 500;
  for (let i = 0; i < entryRows.length; i += CHUNK) {
    const eChunk = entryRows.slice(i, i + CHUNK);
    const ids = new Set(eChunk.map((e) => e.id));
    const lChunk = lineRows.filter((l) => ids.has(l.journalEntryId));
    await prisma.$transaction([
      prisma.journalEntry.createMany({ data: eChunk }),
      prisma.journalLine.createMany({ data: lChunk }),
    ]);
  }

  await recordAuditEvent({
    companyId: ctx.active.companyId,
    userId: ctx.userId,
    action: "journal.bulk_reversal_fy2023_legacy",
    entityType: "JournalEntry",
    entityId: "bulk",
    newValue: { reversedCount: targets.length, incomeRemoved: income, expenseRemoved: expense },
    source: "web",
  });

  return NextResponse.json({
    reversedCount: targets.length,
    incomeRemoved: income,
    expenseRemoved: expense,
    skippedAlreadyReversed: allTargets.length - targets.length,
  });
}
