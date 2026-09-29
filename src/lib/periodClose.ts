import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";

/**
 * Closing (locking) accounting periods.
 *
 * Periods are calendar months named "YYYY-MM" (see findOpenPeriod() in
 * ledger.ts, which creates them on demand and refuses to post into a LOCKED
 * one). This module is the only thing that changes a period's status:
 *
 * - lockPeriodsThrough(): closes every month up to and including the chosen
 *   one, so the closed range is always contiguous from the first month.
 *   Needs journals:APPROVE (the people who can post). Refused while drafts are
 *   still dated inside the range, because they could never be posted
 *   afterwards.
 * - unlockPeriod(): reopens only the most recent locked month, with a written
 *   reason. Needs accounting:APPROVE (Company Admin and CFO by default).
 *
 * Both are audited. Nothing here touches journal entries.
 */

export class PeriodCloseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodCloseError";
  }
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parseMonth(name: string): { year: number; month: number } | null {
  const m = MONTH_RE.exec(name);
  return m ? { year: Number(m[1]), month: Number(m[2]) - 1 } : null;
}

export function monthName(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive list of "YYYY-MM" names from `from` to `to` (empty if from > to). */
export function monthsBetween(from: string, to: string): string[] {
  const a = parseMonth(from);
  const b = parseMonth(to);
  if (!a || !b) return [];
  const out: string[] = [];
  for (let y = a.year, m = a.month; y < b.year || (y === b.year && m <= b.month); m === 11 ? (y++, (m = 0)) : m++) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  }
  return out;
}

export function monthBounds(name: string): { startDate: Date; endDate: Date } {
  const p = parseMonth(name);
  if (!p) throw new PeriodCloseError(`"${name}" isn't a month (expected YYYY-MM).`);
  return {
    startDate: new Date(Date.UTC(p.year, p.month, 1)),
    endDate: new Date(Date.UTC(p.year, p.month + 1, 1) - 1),
  };
}

/**
 * Pure: which months a "lock through `through`" would newly lock, given the
 * current statuses. Months already locked are left as they are.
 */
export function planLock(
  periods: { name: string; status: string }[],
  firstMonth: string,
  through: string,
  currentMonth: string
): string[] {
  if (!parseMonth(through)) throw new PeriodCloseError(`"${through}" isn't a month (expected YYYY-MM).`);
  if (through > currentMonth) throw new PeriodCloseError("You can't lock a month that hasn't started yet.");
  const locked = new Set(periods.filter((p) => p.status === "LOCKED").map((p) => p.name));
  const start = firstMonth < through ? firstMonth : through;
  return monthsBetween(start, through).filter((m) => !locked.has(m));
}

/** Pure: the only month that may be reopened, i.e. the latest locked one. */
export function latestLocked(periods: { name: string; status: string }[]): string | null {
  const locked = periods.filter((p) => p.status === "LOCKED").map((p) => p.name).sort();
  return locked.at(-1) ?? null;
}

type Ctx = { companyId: string; membershipId: string; userId: string };

/** First month the books have anything in: the earliest period row or journal entry. */
async function firstMonthOfBooks(companyId: string, fallback: string): Promise<string> {
  const [period, entry] = await Promise.all([
    prisma.accountingPeriod.findFirst({ where: { companyId }, orderBy: { startDate: "asc" }, select: { name: true } }),
    prisma.journalEntry.findFirst({ where: { companyId }, orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  const candidates = [period?.name, entry ? monthName(entry.date) : undefined, fallback].filter((x): x is string => !!x);
  return candidates.sort()[0]!;
}

export interface PeriodRow {
  name: string;
  status: "OPEN" | "CLOSING" | "LOCKED";
  lockedAt: Date | null;
  lockedByName: string | null;
  postedEntries: number;
  draftEntries: number;
}

/** Every month from the start of the books to the current month, newest first. */
export async function listPeriods(companyId: string, now = new Date()): Promise<PeriodRow[]> {
  const current = monthName(now);
  const first = await firstMonthOfBooks(companyId, current);
  type PeriodRecord = { id: string; name: string; status: string; lockedAt: Date | null; lockedBy: string | null };
  const [periods, counts] = await Promise.all([
    prisma.accountingPeriod.findMany({ where: { companyId }, select: { id: true, name: true, status: true, lockedAt: true, lockedBy: true } }) as Promise<PeriodRecord[]>,
    prisma.journalEntry.groupBy({ by: ["periodId", "status"], where: { companyId }, _count: { _all: true } }),
  ]);
  const byName = new Map(periods.map((p) => [p.name, p]));
  const lockerIds = [...new Set(periods.map((p) => p.lockedBy).filter((x): x is string => !!x))];
  type UserRecord = { id: string; name: string | null; email: string };
  const lockers = await prisma.user.findMany({ where: { id: { in: lockerIds } }, select: { id: true, name: true, email: true } }) as UserRecord[];
  const lockerName = new Map(lockers.map((u) => [u.id, u.name ?? u.email] as [string, string]));
  const count = (periodId: string | undefined, status: string) =>
    periodId ? counts.find((c) => c.periodId === periodId && c.status === status)?._count._all ?? 0 : 0;

  const last = periods.map((p) => p.name).concat(current).sort().at(-1)!;
  return monthsBetween(first, last)
    .reverse()
    .map((name) => {
      const p = byName.get(name);
      return {
        name,
        status: (p?.status ?? "OPEN") as PeriodRow["status"],
        lockedAt: p?.lockedAt ?? null,
        lockedByName: p?.lockedBy ? lockerName.get(p.lockedBy) ?? null : null,
        postedEntries: count(p?.id, "POSTED"),
        draftEntries: count(p?.id, "DRAFT"),
      };
    });
}

/** Lock every month from the start of the books through `through` ("YYYY-MM"). */
export async function lockPeriodsThrough(ctx: Ctx & { through: string; now?: Date }) {
  await requirePermission(ctx.membershipId, "journals", "APPROVE");
  const current = monthName(ctx.now ?? new Date());
  const first = await firstMonthOfBooks(ctx.companyId, ctx.through);
  const periods = await prisma.accountingPeriod.findMany({ where: { companyId: ctx.companyId }, select: { name: true, status: true } });
  const toLock = planLock(periods, first, ctx.through, current);
  if (toLock.length === 0) throw new PeriodCloseError(`Everything through ${ctx.through} is already locked.`);

  // Drafts dated inside the range could never be posted once it's locked.
  const rangeStart = monthBounds(toLock[0]!).startDate;
  const rangeEnd = monthBounds(ctx.through).endDate;
  const inRange = { gte: rangeStart, lte: rangeEnd };
  const [draftEntries, draftInvoices, draftBills] = await Promise.all([
    prisma.journalEntry.count({ where: { companyId: ctx.companyId, status: "DRAFT", date: inRange } }),
    prisma.invoice.count({ where: { companyId: ctx.companyId, status: "DRAFT", issueDate: inRange } }),
    prisma.bill.count({ where: { companyId: ctx.companyId, status: "DRAFT", issueDate: inRange } }),
  ]);
  if (draftEntries + draftInvoices + draftBills > 0) {
    const parts = [
      draftEntries && `${draftEntries} draft journal entr${draftEntries === 1 ? "y" : "ies"} (e.g. expenses awaiting approval)`,
      draftInvoices && `${draftInvoices} draft invoice${draftInvoices === 1 ? "" : "s"}`,
      draftBills && `${draftBills} draft bill${draftBills === 1 ? "" : "s"}`,
    ].filter(Boolean);
    throw new PeriodCloseError(
      `Can't lock ${toLock[0] === ctx.through ? ctx.through : `${toLock[0]} to ${ctx.through}`} yet: ${parts.join(", ")} ${draftEntries + draftInvoices + draftBills === 1 ? "is" : "are"} dated in that range. ` +
        `Post, delete or re-date them first, or they could never be posted.`
    );
  }

  const lockedAt = new Date();
  await prisma.$transaction(
    toLock.map((name) =>
      prisma.accountingPeriod.upsert({
        where: { companyId_name: { companyId: ctx.companyId, name } },
        create: { companyId: ctx.companyId, name, ...monthBounds(name), status: "LOCKED", lockedAt, lockedBy: ctx.userId },
        update: { status: "LOCKED", lockedAt, lockedBy: ctx.userId },
      })
    )
  );
  await recordAuditEvent({
    companyId: ctx.companyId,
    userId: ctx.userId,
    action: "period.locked",
    entityType: "AccountingPeriod",
    entityId: ctx.through,
    newValue: { lockedThrough: ctx.through, months: toLock },
  });
  return { lockedThrough: ctx.through, months: toLock };
}

/** Reopen the most recent locked month. Needs a reason; audited. */
export async function unlockPeriod(ctx: Ctx & { name: string; reason: string }) {
  await requirePermission(ctx.membershipId, "accounting", "APPROVE");
  const reason = ctx.reason.trim();
  if (reason.length < 10) throw new PeriodCloseError("Give a reason for reopening this month (at least 10 characters). It's kept in the audit log.");
  const periods = await prisma.accountingPeriod.findMany({ where: { companyId: ctx.companyId }, select: { name: true, status: true, lockedAt: true, lockedBy: true } });
  const latest = latestLocked(periods);
  if (!latest) throw new PeriodCloseError("No month is locked.");
  if (ctx.name !== latest) {
    throw new PeriodCloseError(`Only the most recent locked month (${latest}) can be reopened, so the closed range stays continuous. Reopen later months first.`);
  }
  const before = periods.find((p) => p.name === latest)!;
  await prisma.accountingPeriod.update({
    where: { companyId_name: { companyId: ctx.companyId, name: latest } },
    data: { status: "OPEN", lockedAt: null, lockedBy: null },
  });
  await recordAuditEvent({
    companyId: ctx.companyId,
    userId: ctx.userId,
    action: "period.unlocked",
    entityType: "AccountingPeriod",
    entityId: latest,
    previousValue: { status: "LOCKED", lockedAt: before.lockedAt, lockedBy: before.lockedBy },
    newValue: { status: "OPEN", reason },
  });
  return { reopened: latest };
}
