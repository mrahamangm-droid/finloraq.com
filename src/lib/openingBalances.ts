import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { DuplicatePostingError, InvalidLineError, postJournalEntry, validateBalanced, type LineInput } from "@/lib/ledger";

/**
 * Opening balances for a go-live migration: the starting trial balance of a
 * company moving off another system or spreadsheets, posted as ONE balanced
 * journal entry through postJournalEntry() — the ledger's only write path —
 * so every invariant (balance, journals:APPROVE, open period, active
 * accounts, gapless numbering, audit) applies exactly as for any entry.
 *
 * It's an ADJUSTMENT entry with sourceId "opening-balance". JournalEntry
 * has a partial unique index on (companyId, sourceType, sourceId), so two
 * concurrent submits can't both post. Fixing a mistake is the normal
 * ledger correction: reverse the entry, then post again — the replacement
 * gets sourceId "opening-balance:2", and so on.
 */

export const OPENING_BALANCE_SOURCE_ID = "opening-balance";

export class OpeningBalanceError extends Error {}

/** Posted activity already exists and the caller hasn't acknowledged it. */
export class OpeningBalanceActivityError extends Error {}

export interface OpeningBalanceLine {
  accountCode: string;
  debit?: string | number | null;
  credit?: string | number | null;
  description?: string | null;
}

export function openingBalanceSourceId(n: number): string {
  return n <= 1 ? OPENING_BALANCE_SOURCE_ID : `${OPENING_BALANCE_SOURCE_ID}:${n}`;
}

export function isOpeningBalanceSourceId(sourceId: string | null | undefined): boolean {
  return !!sourceId && (sourceId === OPENING_BALANCE_SOURCE_ID || sourceId.startsWith(`${OPENING_BALANCE_SOURCE_ID}:`));
}

function amount(v: string | number | null | undefined): Prisma.Decimal {
  if (v === null || v === undefined || v === "") return new Prisma.Decimal(0);
  const s = typeof v === "number" ? String(v) : v.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new InvalidLineError(`"${v}" isn't a valid amount (use up to two decimals, no minus sign).`);
  return new Prisma.Decimal(s);
}

/**
 * Pure: turns the wizard's rows into ledger lines. Blank rows are dropped;
 * each account may appear once (its balance is a single debit OR credit);
 * the result must balance to the cent — validateBalanced() is the same
 * check postJournalEntry() runs, so the wizard can never pre-approve
 * something the ledger would refuse.
 */
export function prepareOpeningBalanceLines(rows: OpeningBalanceLine[]): LineInput[] {
  const seen = new Set<string>();
  const lines: LineInput[] = [];
  for (const row of rows) {
    const code = row.accountCode.trim();
    const debit = amount(row.debit);
    const credit = amount(row.credit);
    if (!code && debit.isZero() && credit.isZero()) continue;
    if (!code) throw new InvalidLineError("Every amount needs an account.");
    if (debit.isZero() && credit.isZero()) continue; // a picked account with no balance is just skipped
    if (seen.has(code)) throw new InvalidLineError(`Account ${code} appears twice; enter its net balance once.`);
    seen.add(code);
    lines.push({
      accountCode: code,
      ...(debit.isZero() ? {} : { debit }),
      ...(credit.isZero() ? {} : { credit }),
      description: row.description?.trim() || "Opening balance",
    });
  }
  if (lines.length === 0) throw new InvalidLineError("Enter at least one opening balance.");
  validateBalanced(lines);
  return lines;
}

/**
 * Where the company stands: any opening-balance entries so far (and
 * whether each was reversed), and how much other posted activity exists —
 * opening balances belong before regular postings, so the wizard warns
 * (and the server requires an explicit acknowledgement) when there is some.
 */
export async function openingBalanceStatus(companyId: string) {
  const openings = await prisma.journalEntry.findMany({
    where: { companyId, sourceType: "ADJUSTMENT", sourceId: { startsWith: OPENING_BALANCE_SOURCE_ID } },
    select: { id: true, entryNumber: true, date: true, status: true, sourceId: true, reversals: { select: { id: true, entryNumber: true } } },
    orderBy: { createdAt: "asc" },
  });
  const ours = openings.filter((e) => isOpeningBalanceSourceId(e.sourceId));
  const live = ours.find((e) => e.status === "POSTED" && e.reversals.length === 0) ?? null;

  // Opening entries (and reversals of them) are recognized by sourceId in
  // the same query, not via the id list above: that list and this count are
  // separate reads, and a concurrent post landing between them must not be
  // miscounted as "other activity".
  const isOpening: Prisma.JournalEntryWhereInput = {
    sourceType: "ADJUSTMENT",
    OR: [{ sourceId: OPENING_BALANCE_SOURCE_ID }, { sourceId: { startsWith: `${OPENING_BALANCE_SOURCE_ID}:` } }],
  };
  const otherWhere: Prisma.JournalEntryWhereInput = {
    companyId,
    status: { not: "DRAFT" },
    NOT: [isOpening, { reversalOf: { is: isOpening } }],
  };
  const [otherPostedCount, earliest] = await Promise.all([
    prisma.journalEntry.count({ where: otherWhere }),
    prisma.journalEntry.findFirst({ where: otherWhere, orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  return {
    entries: ours.map((e) => ({ id: e.id, entryNumber: e.entryNumber, date: e.date, reversed: e.reversals.length > 0 })),
    live,
    otherPostedCount,
    earliestOtherDate: earliest?.date ?? null,
  };
}

/**
 * The default "as of" date: the last day of the most recently completed
 * fiscal year (fiscalYearEnd is a month 1–12), the usual cut-over point.
 */
export function defaultOpeningDate(fiscalYearEndMonth: number, today = new Date()): Date {
  const m = Math.min(12, Math.max(1, fiscalYearEndMonth));
  let year = today.getUTCFullYear();
  // Last day of month m in `year`; step back a year if that's not yet past.
  let end = new Date(Date.UTC(year, m, 0));
  if (end >= new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))) {
    year -= 1;
    end = new Date(Date.UTC(year, m, 0));
  }
  return end;
}

export async function postOpeningBalances(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  date: Date;
  lines: OpeningBalanceLine[];
  memo?: string;
  /** Required when the company already has other posted activity. */
  acknowledgeExistingActivity?: boolean;
}) {
  // accounting:CREATE here; posting itself also needs journals:APPROVE,
  // which postJournalEntry() enforces.
  await requirePermission(params.membershipId, "accounting", "CREATE");
  const lines = prepareOpeningBalanceLines(params.lines);

  const status = await openingBalanceStatus(params.companyId);
  if (status.live) {
    throw new OpeningBalanceError(
      `Opening balances are already posted (${status.live.entryNumber}). Reverse that entry first if they need to change.`
    );
  }
  if (status.otherPostedCount > 0 && !params.acknowledgeExistingActivity) {
    throw new OpeningBalanceActivityError(
      `This company already has ${status.otherPostedCount} posted journal entr${status.otherPostedCount === 1 ? "y" : "ies"}. ` +
        "Opening balances normally come before any other posting — confirm you want to post them anyway."
    );
  }

  const company = await prisma.company.findUniqueOrThrow({ where: { id: params.companyId }, select: { baseCurrency: true } });
  const sourceId = openingBalanceSourceId(status.entries.length + 1);
  let entry;
  try {
    entry = await postJournalEntry({
      companyId: params.companyId,
      membershipId: params.membershipId,
      userId: params.userId,
      date: params.date,
      sourceType: "ADJUSTMENT",
      sourceId,
      memo: params.memo?.trim() || `Opening balances as of ${params.date.toISOString().slice(0, 10)}`,
      currency: company.baseCurrency,
      lines,
      post: true,
    });
  } catch (err) {
    // A concurrent submit won the race to the unique (companyId, sourceType,
    // sourceId) index — this one wrote nothing. Say so plainly, not a 500.
    if (err instanceof DuplicatePostingError || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
      throw new OpeningBalanceError("Opening balances were just posted by another request. Refresh to see them.");
    }
    throw err;
  }

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "opening_balance.posted",
    entityType: "JournalEntry",
    entityId: entry.id,
    newValue: {
      entryNumber: entry.entryNumber,
      asOf: params.date.toISOString().slice(0, 10),
      lines: lines.length,
      priorPostedEntries: status.otherPostedCount,
    },
  });
  return entry;
}
