import type Decimal from "decimal.js";
import { sum, roundMoney } from "@/lib/currency";

/**
 * Pure, dependency-free integrity checks — no Prisma import, so these can
 * run against any already-fetched data (real ledger rows, or a synthetic
 * batch built for a test). src/lib/integrity.ts is the thin DB-touching
 * orchestrator that fetches a company's posted entries and calls these;
 * see that file's header comment for why this module exists at all.
 */

export interface IntegrityIssue {
  [key: string]: string | number;
}

type Money = Decimal | number | string;
type EntryLines = { debit: Money; credit: Money }[];

/**
 * Re-sums every posted entry's own lines and flags any that aren't
 * balanced. This should be structurally impossible — postJournalEntry()
 * calls validateBalanced() before it ever writes — so a hit here means
 * either a hand-edited row or a genuine bug, not routine noise.
 */
export function findUnbalancedEntries<T extends { id: string; entryNumber: string; lines: EntryLines }>(
  entries: T[],
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  for (const entry of entries) {
    const totalDebit = roundMoney(sum(entry.lines.map((l) => l.debit)));
    const totalCredit = roundMoney(sum(entry.lines.map((l) => l.credit)));
    if (!totalDebit.equals(totalCredit)) {
      issues.push({
        entryId: entry.id,
        entryNumber: entry.entryNumber,
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
        difference: roundMoney(totalDebit.minus(totalCredit)).toFixed(2),
      });
    }
  }
  return issues;
}

/**
 * Finds more than one entry sharing the same (sourceType, sourceId) —
 * the idempotency key postJournalEntry() checks with a findFirst() query
 * before it writes (ledger.ts). That check is application-level, not a
 * database unique constraint (there's no @@unique([companyId, sourceType,
 * sourceId]) on JournalEntry in schema.prisma), so two concurrent
 * requests for the same source — a webhook firing twice, a user
 * double-clicking "Post" before the button disables — can both pass the
 * check before either has written, producing two entries for one source
 * document. This is the one check in this module that isn't purely
 * defensive: it can genuinely fire in production today.
 */
export function findDuplicateSourcePostings<T extends { id: string; sourceType: string; sourceId: string | null; entryNumber: string }>(
  entries: T[],
): IntegrityIssue[] {
  const bySource = new Map<string, T[]>();
  for (const entry of entries) {
    if (!entry.sourceId) continue;
    const key = `${entry.sourceType}:${entry.sourceId}`;
    const group = bySource.get(key) ?? [];
    group.push(entry);
    bySource.set(key, group);
  }
  const issues: IntegrityIssue[] = [];
  for (const [key, group] of bySource) {
    if (group.length > 1) {
      issues.push({
        source: key,
        count: group.length,
        entryNumbers: group.map((e) => e.entryNumber).join(", "),
      });
    }
  }
  return issues;
}

/**
 * A REVERSAL entry points at the entry it reverses in two places: sourceId
 * (the ledger's one-reversal-per-entry key, always set) and reversalOfId (the
 * relation, set by reverseJournalEntry() from this fix on; reversals posted
 * before it have it null, and posted rows are never edited to backfill it).
 * The target is reversalOfId, else sourceId. Flags a reversal with no target,
 * a target that doesn't exist in this company's ledger, or the two fields
 * disagreeing. Any of those means the reversal's paper trail is broken, which
 * matters in an audit even though it can't affect the balance.
 */
export function findOrphanedReversals<
  T extends { id: string; entryNumber: string; sourceType: string; sourceId?: string | null; reversalOfId: string | null },
>(entries: T[], existingEntryIds: Set<string>): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  for (const entry of entries) {
    if (entry.sourceType !== "REVERSAL") continue;
    const target = entry.reversalOfId ?? entry.sourceId ?? null;
    if (!target) {
      issues.push({ entryId: entry.id, entryNumber: entry.entryNumber, problem: "REVERSAL entry doesn't reference the entry it reverses" });
    } else if (entry.reversalOfId && entry.sourceId && entry.reversalOfId !== entry.sourceId) {
      issues.push({ entryId: entry.id, entryNumber: entry.entryNumber, problem: `reversalOfId ${entry.reversalOfId} and sourceId ${entry.sourceId} disagree` });
    } else if (!existingEntryIds.has(target)) {
      issues.push({ entryId: entry.id, entryNumber: entry.entryNumber, problem: `reversed entry ${target} does not exist` });
    }
  }
  return issues;
}

/** A negative debit or credit should be impossible (validateBalanced()
 *  rejects it before every write, and a debit/credit split — never a
 *  signed single amount — is the whole point of double-entry), so this
 *  is pure defense-in-depth against a hand-edited row. */
export function findNegativeLines<T extends { id: string; debit: Money; credit: Money }>(lines: T[]): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  for (const line of lines) {
    const debit = roundMoney(line.debit);
    const credit = roundMoney(line.credit);
    if (debit.isNegative() || credit.isNegative()) {
      issues.push({ lineId: line.id, debit: debit.toFixed(2), credit: credit.toFixed(2) });
    }
  }
  return issues;
}
