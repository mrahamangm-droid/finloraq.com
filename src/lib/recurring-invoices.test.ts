import { describe, it, expect } from "vitest";
import { nextRunDate, firstOccurrenceOnOrAfter, type RecurringFrequency } from "./recurring-invoices";

const d = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("nextRunDate", () => {
  it("advances WEEKLY by 7 days", () => {
    expect(iso(nextRunDate(d("2026-01-05"), "WEEKLY"))).toBe("2026-01-12");
  });

  it("advances BIWEEKLY by 14 days", () => {
    expect(iso(nextRunDate(d("2026-01-05"), "BIWEEKLY"))).toBe("2026-01-19");
  });

  it("advances MONTHLY to the same day next month", () => {
    expect(iso(nextRunDate(d("2026-03-15"), "MONTHLY"))).toBe("2026-04-15");
  });

  it("advances QUARTERLY by 3 months", () => {
    expect(iso(nextRunDate(d("2026-01-15"), "QUARTERLY"))).toBe("2026-04-15");
  });

  it("advances ANNUALLY by 1 year", () => {
    expect(iso(nextRunDate(d("2026-03-15"), "ANNUALLY"))).toBe("2027-03-15");
  });

  it("clamps to the target month's length when it has no matching day", () => {
    // Jan 31 + 1 month: no Feb 31, so Feb 28 (2026 is not a leap year).
    expect(iso(nextRunDate(d("2026-01-31"), "MONTHLY"))).toBe("2026-02-28");
  });

  it("clamps correctly in a leap year", () => {
    expect(iso(nextRunDate(d("2028-01-31"), "MONTHLY"))).toBe("2028-02-29");
  });

  it("without an anchorDay, repeated MONTHLY advancement drifts earlier every short month", () => {
    // This documents the bug the anchorDay param exists to fix: with no
    // anchor, each step advances from the previous (already-clamped) date.
    let cur = d("2026-01-31");
    cur = nextRunDate(cur, "MONTHLY"); // -> Feb 28
    cur = nextRunDate(cur, "MONTHLY"); // -> Mar 28, NOT Mar 31
    expect(iso(cur)).toBe("2026-03-28");
  });

  it("with anchorDay, repeated MONTHLY advancement returns to the 31st once the month is long enough", () => {
    const anchorDay = 31;
    let cur = d("2026-01-31");
    cur = nextRunDate(cur, "MONTHLY", anchorDay); // -> Feb 28 (clamped)
    cur = nextRunDate(cur, "MONTHLY", anchorDay); // -> Mar 31 (anchor restored)
    expect(iso(cur)).toBe("2026-03-31");
  });

  it("with anchorDay, QUARTERLY advancement from a 31st-anchored schedule lands correctly across a short quarter", () => {
    const anchorDay = 31;
    // Nov 30 (quarter after Aug 31) should return to the 30th (Nov has no 31st),
    // then the next quarter (Feb) clamps to 28/29, and May correctly returns to 31.
    let cur = d("2026-02-28"); // e.g. already mid-cycle
    cur = nextRunDate(cur, "QUARTERLY", anchorDay); // -> May 31
    expect(iso(cur)).toBe("2026-05-31");
  });

  it("carries the year rollover correctly for ANNUALLY", () => {
    expect(iso(nextRunDate(d("2026-12-15"), "ANNUALLY"))).toBe("2027-12-15");
  });
});

describe("firstOccurrenceOnOrAfter", () => {
  const frequencies: RecurringFrequency[] = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"];

  it("returns the startDate itself when it's already on or after the target", () => {
    const start = d("2026-06-01");
    expect(iso(firstOccurrenceOnOrAfter(start, "MONTHLY", d("2026-06-01")))).toBe("2026-06-01");
  });

  it("fast-forwards a MONTHLY schedule that's been stale for 6 months without drifting off its anchor day", () => {
    // Schedule started on the 31st; last ran naturally, then went stale.
    const start = d("2026-01-31");
    const resumedAt = d("2026-07-15");
    const next = firstOccurrenceOnOrAfter(start, "MONTHLY", resumedAt);
    // The first occurrence on/after Jul 15 anchored to the 31st is Jul 31 —
    // not some drifted date, and never a burst of every missed month.
    expect(iso(next)).toBe("2026-07-31");
  });

  it("fast-forwards a WEEKLY schedule stale for months to a single upcoming date, not a backlog", () => {
    const start = d("2026-01-01");
    const resumedAt = d("2026-06-01");
    const next = firstOccurrenceOnOrAfter(start, "WEEKLY", resumedAt);
    expect(next.getTime()).toBeGreaterThanOrEqual(resumedAt.getTime());
    // Exactly one occurrence, not an accumulated list — the function's
    // return type alone (a single Date) is the guarantee, but assert the
    // gap from resumedAt is less than one full period to rule out overshoot.
    expect(next.getTime() - resumedAt.getTime()).toBeLessThan(7 * 86_400_000);
  });

  for (const freq of frequencies) {
    it(`never returns a date before onOrAfter for ${freq}`, () => {
      const start = d("2025-01-01");
      const onOrAfter = d("2026-01-01");
      const next = firstOccurrenceOnOrAfter(start, freq, onOrAfter);
      expect(next.getTime()).toBeGreaterThanOrEqual(onOrAfter.getTime());
    });
  }
});
