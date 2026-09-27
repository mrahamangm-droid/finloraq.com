import { NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { requireTenantContext } from "@/lib/tenant";
import { ForbiddenError, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { parseXlsxWorkbook } from "@/lib/files/xlsx-lite";
import { parseWorkbook, type TxnRow } from "@/lib/import/rows";
import { matchAccount, resolveAccount } from "@/lib/import/server";
import { getPreferences } from "@/lib/customization/server";

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

/**
 * PHASE 2 — rebuilding the two broken lump-sum DRAFT entries (deleted after
 * being caught as structurally wrong: no per-transaction detail, and the
 * income one booked backwards) as individual, correctly-directioned DRAFT
 * entries, one per source-workbook row.
 *
 * The workbook is committed at data/fy2023-source-workbook.xlsx (the exact
 * file the user provided) rather than uploaded through the browser each
 * time, so this route can re-run deterministically. It's parsed with the
 * SAME parseXlsxWorkbook()/parseWorkbook() the real Import feature uses
 * (src/lib/import/rows.ts, src/lib/files/xlsx-lite.ts) — not a bespoke
 * re-implementation — so the row set and totals are guaranteed to match
 * what the app's own import preview would show, sidestepping the two
 * mismatches an earlier from-scratch Python parse produced (a stray
 * "TOTAL" row doubling income; the workbook's own unreliable "Duplicate
 * Status" column for expenses).
 *
 * Each row becomes its own DRAFT journal entry — status DRAFT, post:false
 * equivalent (postedAt/postedBy null) — using the exact same line-building
 * logic as commitRows() in src/lib/import/server.ts (income: debit Bank /
 * credit revenue account [/ credit Output Tax]; expense: debit expense
 * account [/ debit Input Tax] / credit Bank), and the exact same
 * resolveAccount()/matchAccount() category→account resolution, imported
 * from that file rather than duplicated, so accounts are chosen identically
 * to a live import.
 *
 * sourceId uses a distinct "cleanimport2023:" prefix (never "import:") so
 * these never collide with the old duplicate legacy entries' permanent
 * sourceId fingerprints — that collision is exactly why the real Import
 * wizard can't be re-run directly for this data (see route doc above).
 *
 * GET  ?action=build-drafts        — read-only: parses the workbook, shows
 *                                     exact counts/totals/category
 *                                     resolution, creates nothing.
 * POST {"confirm":"BUILD-CLEAN-DRAFTS-2023"} — creates the DRAFT entries.
 *                                     Idempotent: rows whose sourceId
 *                                     already exists are skipped.
 */

const WORKBOOK_PATH = path.join(process.cwd(), "data", "fy2023-source-workbook.xlsx");

function loadFY2023Rows(dayFirst: boolean): { rows: TxnRow[]; warning?: string; sheetsUsed: string[] } {
  const buffer = readFileSync(WORKBOOK_PATH);
  const sheets = parseXlsxWorkbook(buffer);
  const { rows, error, sheetsUsed } = parseWorkbook("transactions", sheets, { dayFirst });
  const good = rows
    .filter((r) => r.row)
    .map((r) => r.row as TxnRow)
    // Belt-and-suspenders per the user's explicit "only 2023-01-01 to
    // 2023-12-31" instruction, even though the workbook is FY2023-only.
    .filter((r) => r.date >= "2023-01-01" && r.date <= "2023-12-31");
  return { rows: good, warning: error, sheetsUsed };
}

/** Deterministic per-row fingerprint for the "cleanimport2023:" sourceId — stable across re-runs of
 *  this route (so it stays idempotent) but namespaced away from refFor()'s "import:" scheme in
 *  src/lib/import/server.ts, which is what the old duplicate entries used. */
function cleanImportRef(r: TxnRow, occurrence: number): string {
  const key = `${r.date}|${r.type}|${r.category}|${r.amount}|${r.tax}|${r.description}|${occurrence}`;
  return "cleanimport2023:" + createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/** Same key shape as cleanImportRef() but without hashing, used to count occurrences of an identical
 *  row (workbooks can legitimately have two rows with the same date/amount/description). */
function occurrenceKey(r: TxnRow): string {
  return `${r.date}|${r.type}|${r.category}|${r.amount}|${r.tax}|${r.description}`;
}

function withOccurrences(rows: TxnRow[]): { row: TxnRow; ref: string }[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const k = occurrenceKey(row);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return { row, ref: cleanImportRef(row, n) };
  });
}

/** Mirrors commitRows()'s transactions branch in src/lib/import/server.ts exactly (debit/credit
 *  direction and tax lines) — duplicated rather than imported only because commitRows() also does
 *  the POSTED-status posting/permission/duplicate machinery this route intentionally does differently
 *  (DRAFT, distinct sourceId scheme, bulk createMany). Any change to commitRows()'s line shape should
 *  be mirrored here. */
function buildLines(r: TxnRow, accountCode: string): { accountCode: string; debit?: number; credit?: number; description: string }[] {
  const net = Math.round((r.amount - r.tax) * 100) / 100;
  return r.type === "income"
    ? [
        { accountCode: "1000", debit: r.amount, description: "Bank" },
        { accountCode, credit: net, description: r.description || r.category || "Income" },
        ...(r.tax ? [{ accountCode: "2100", credit: r.tax, description: "Output Tax Payable" }] : []),
      ]
    : [
        { accountCode, debit: net, description: r.description || r.category || "Expense" },
        ...(r.tax ? [{ accountCode: "1200", debit: r.tax, description: "Input Tax Receivable" }] : []),
        { accountCode: "1000", credit: r.amount, description: "Bank" },
      ];
}

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
 * Reliable duplicate-import detection.
 *
 * The set loadTargets() returns includes a handful of records that are
 * genuine rather than duplicate-import artifacts: 2 real customer invoices
 * (sourceType INVOICE — confirmed against the Sales page: real customer
 * names, real due dates) and 1 real MANUAL entry (the opening RAK Bank
 * balance). Neither of those ever carries "(imported)" in its memo.
 *
 * Every confirmed duplicate-import posting in this ledger DOES carry
 * "(imported)" in its memo — this is true not only for the EXPENSE-tagged
 * entries but also for 66 RECEIPT-tagged entries, which turn out to be 33
 * income transactions each posted twice (once in English to account 4010
 * "Project Income" referencing an INC23-#### number, once in Arabic to
 * account 4000 "Sales Revenue" with no such reference) — the same
 * English/Arabic duplication pattern as the expense side. An initial,
 * more conservative version of this filter used sourceType === "EXPENSE"
 * alone, which correctly excluded the genuine invoices/opening-balance but
 * also missed all 66 of these income duplicates. The "(imported)" memo tag
 * is the precise boundary: it catches every duplicate-import posting,
 * income and expense alike, while still excluding the two real invoices
 * and the real opening balance (none of which carry that tag).
 *
 * One further entry is special-cased: JE-005282, a pre-existing MANUAL
 * entry memo'd "Correction: reverse duplicate FY2023 income import (33
 * rows posted twice - see 4000 vs 4010)". Someone (or an earlier pass)
 * already tried to fix this manually, but it debits Project Income and
 * credits BANK for AED 2,086,726.93 — that's not a valid reversal of a
 * duplicate revenue posting, it actually removes real cash from the books.
 * It needs to be reversed along with everything else rather than left in
 * place, so it's matched explicitly by entry number since it doesn't carry
 * the "(imported)" tag other artifacts do.
 */
function onlyDuplicateImportArtifacts(targets: Awaited<ReturnType<typeof loadTargets>>) {
  return targets.filter(
    (e) =>
      e.sourceType === "EXPENSE" ||
      (e.sourceType === "RECEIPT" && !!e.memo?.includes("(imported)")) ||
      e.entryNumber === "JE-005282",
  );
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

export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  // Read-only diagnostic: inspect the two clean-import DRAFT entries' actual
  // line structure, to decide whether they can be split into one entry per
  // transaction from their own data (vs needing the original source file).
  // Purely a GET read — no state change, unlike the confirm-gated POST above.
  if (new URL(req.url).searchParams.get("inspect") === "drafts") {
    const drafts = await prisma.journalEntry.findMany({
      where: { companyId: ctx.active.companyId, status: "DRAFT" },
      include: { lines: { include: { account: true } } },
      orderBy: { date: "asc" },
    });
    return NextResponse.json({
      draftCount: drafts.length,
      drafts: drafts.map((d) => ({
        id: d.id,
        entryNumber: d.entryNumber,
        date: d.date,
        sourceType: d.sourceType,
        sourceId: d.sourceId,
        memo: d.memo,
        lineCount: d.lines.length,
        lines: d.lines.map((l) => ({
          account: l.account.code,
          accountName: l.account.name,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
        })),
      })),
    });
  }

  if (new URL(req.url).searchParams.get("action") === "build-drafts") {
    let parsed;
    try {
      const prefs = await getPreferences(ctx.userId);
      parsed = loadFY2023Rows(prefs.dateFormat !== "MM/DD/YYYY");
    } catch (err) {
      return NextResponse.json({ error: `Couldn't read/parse the workbook at data/fy2023-source-workbook.xlsx: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
    }
    const withRefs = withOccurrences(parsed.rows);

    const accounts = await prisma.account.findMany({ where: { companyId: ctx.active.companyId }, select: { code: true, name: true, type: true, isActive: true } });
    const categorySeen = new Map<string, { category: string; type: "income" | "expense"; code: string | null; name: string; willCreate: boolean; problem?: string }>();
    for (const r of parsed.rows) {
      const k = `${r.type}|${r.category.toLowerCase()}`;
      if (categorySeen.has(k)) continue;
      const want = r.type === "income" ? "REVENUE" as const : "EXPENSE" as const;
      const m = r.category.trim() ? matchAccount(accounts, r.category, want) : undefined;
      const fallback = r.type === "income" ? "4000" : "5000";
      if (!r.category.trim()) {
        const a = accounts.find((x) => x.code === fallback);
        categorySeen.set(k, { category: "(no category)", type: r.type, code: fallback, name: a?.name ?? fallback, willCreate: false });
      } else if (m) {
        categorySeen.set(k, { category: r.category, type: r.type, code: m.code, name: m.name, willCreate: false, problem: !m.isActive ? `Account ${m.code} is inactive` : m.code === "1000" ? "Bank can't be the category" : undefined });
      } else {
        categorySeen.set(k, { category: r.category, type: r.type, code: null, name: r.category, willCreate: true });
      }
    }

    const refs = withRefs.map((x) => x.ref);
    const existingRefs = new Set(
      (await prisma.journalEntry.findMany({ where: { companyId: ctx.active.companyId, sourceId: { in: refs } }, select: { sourceId: true } })).map((e) => e.sourceId),
    );
    const alreadyBuilt = refs.filter((r) => existingRefs.has(r)).length;

    const income = parsed.rows.filter((r) => r.type === "income");
    const expense = parsed.rows.filter((r) => r.type === "expense");
    const round2 = (n: number) => Math.round(n * 100) / 100;

    return NextResponse.json({
      dryRun: true,
      action: "build-drafts",
      note: "Read-only — parses the committed workbook and shows exactly what POST {\"confirm\":\"BUILD-CLEAN-DRAFTS-2023\"} would create. Creates nothing.",
      workbookWarning: parsed.warning ?? null,
      sheetsUsed: parsed.sheetsUsed,
      totalRows: parsed.rows.length,
      alreadyBuilt,
      willCreate: parsed.rows.length - alreadyBuilt,
      income: { count: income.length, total: round2(income.reduce((s, r) => s + r.amount, 0)) },
      expense: { count: expense.length, total: round2(expense.reduce((s, r) => s + r.amount, 0)) },
      categoryResolution: [...categorySeen.values()],
      sample: parsed.rows.slice(0, 8),
    });
  }

  const targets = await loadTargets(ctx.active.companyId);
  const { income, expense } = summarize(targets);
  const willActuallyReverse = onlyDuplicateImportArtifacts(targets);
  const willReverseTotals = summarize(willActuallyReverse);
  const excluded = targets.filter((e) => !willActuallyReverse.includes(e));

  return NextResponse.json({
    dryRun: true,
    note: "'willReverse*' is the exact scope POST executes (EXPENSE entries, RECEIPT entries whose memo carries \"(imported)\", and the one special-cased broken MANUAL correction JE-005282 — see onlyDuplicateImportArtifacts()). 'count'/'incomeToBeRemoved'/'expenseToBeRemoved' below describe everything in the 2023 date range for context, including the genuine records in excludedFull that POST does NOT touch.",
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
    // Full detail on every entry EXCLUDED from the reversal scope, so a
    // human can check each one really is a genuine record (a real invoice,
    // a real opening balance) before this route ever reverses anything.
    excludedFull: excluded.map((e) => ({
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

  if (body?.confirm === "BUILD-CLEAN-DRAFTS-2023") {
    const allowedCreate = await can(ctx.active.id, "journals", "CREATE");
    if (!allowedCreate) return NextResponse.json({ error: "Requires the CREATE permission on Journals." }, { status: 403 });

    let parsed;
    try {
      const prefs = await getPreferences(ctx.userId);
      parsed = loadFY2023Rows(prefs.dateFormat !== "MM/DD/YYYY");
    } catch (err) {
      return NextResponse.json({ error: `Couldn't read/parse the workbook: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
    }
    const withRefs = withOccurrences(parsed.rows);

    const existingRefs = new Set(
      (
        await prisma.journalEntry.findMany({
          where: { companyId: ctx.active.companyId, sourceId: { in: withRefs.map((x) => x.ref) } },
          select: { sourceId: true },
        })
      ).map((e) => e.sourceId),
    );
    const toBuild = withRefs.filter((x) => !existingRefs.has(x.ref));
    if (!toBuild.length) {
      return NextResponse.json({ createdCount: 0, skippedAlreadyBuilt: withRefs.length, incomeTotal: 0, expenseTotal: 0 });
    }

    const accountCache = new Map<string, string>();
    const resolveCtx = { companyId: ctx.active.companyId, membershipId: ctx.active.id, userId: ctx.userId };

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

    const entryRows: Prisma.JournalEntryCreateManyInput[] = [];
    const lineRows: Prisma.JournalLineCreateManyInput[] = [];
    const failed: { line: number; message: string }[] = [];
    let incomeTotal = 0;
    let expenseTotal = 0;

    // The whole per-row build (date/period/account resolution AND every
    // line's account-id lookup) is one try/catch, matching commitRows()'s
    // behavior of marking a single bad row "failed" rather than aborting
    // the run — a missing tax account (2100/1200) or an inactive account
    // must not crash the batch partway through.
    for (const { row: r, ref } of toBuild) {
      const id = randomUUID();
      try {
        const date = new Date(r.date + "T00:00:00.000Z");
        const period = periodFor(date);
        const accountCode = await resolveAccount(resolveCtx, r.category, r.type, accountCache);

        const entryLineRows: Prisma.JournalLineCreateManyInput[] = [];
        for (const l of buildLines(r, accountCode)) {
          let accountId = accountCache.get("id:" + l.accountCode);
          if (!accountId) {
            const a = await prisma.account.findFirstOrThrow({ where: { companyId: ctx.active.companyId, code: l.accountCode }, select: { id: true } });
            accountId = a.id;
            accountCache.set("id:" + l.accountCode, accountId);
          }
          entryLineRows.push({
            id: randomUUID(),
            journalEntryId: id,
            accountId,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            description: l.description,
          });
        }

        seq += 1;
        entryRows.push({
          id,
          companyId: ctx.active.companyId,
          periodId: period.id,
          entryNumber: `JE-${String(seq).padStart(6, "0")}`,
          date,
          sourceType: r.type === "income" ? "RECEIPT" : "EXPENSE",
          sourceId: ref,
          memo: (r.description || r.category || (r.type === "income" ? "Income" : "Expense")) + " (FY2023 clean import)",
          status: "DRAFT",
          currency: ctx.active.company.baseCurrency,
          exchangeRate: 1,
          postedAt: null,
          postedBy: null,
          createdBy: ctx.userId,
        });
        lineRows.push(...entryLineRows);
        if (r.type === "income") incomeTotal += r.amount; else expenseTotal += r.amount;
      } catch (err) {
        failed.push({ line: r.line, message: err instanceof Error ? err.message : String(err) });
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
      action: "journal.bulk_draft_build_fy2023_clean",
      entityType: "JournalEntry",
      entityId: "bulk",
      newValue: { createdCount: entryRows.length, incomeTotal: Math.round(incomeTotal * 100) / 100, expenseTotal: Math.round(expenseTotal * 100) / 100, failed: failed.length },
      source: "web",
    });

    return NextResponse.json({
      createdCount: entryRows.length,
      skippedAlreadyBuilt: withRefs.length - toBuild.length,
      incomeTotal: Math.round(incomeTotal * 100) / 100,
      expenseTotal: Math.round(expenseTotal * 100) / 100,
      failed,
    });
  }

  if (body?.confirm !== "REVERSE-LEGACY-FY2023") {
    return NextResponse.json({ error: 'Missing confirmation. Send {"confirm":"REVERSE-LEGACY-FY2023"} or {"confirm":"BUILD-CLEAN-DRAFTS-2023"}.' }, { status: 400 });
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
