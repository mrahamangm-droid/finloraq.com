/**
 * Reporting periods shared by the dashboard and every report: a day, a week,
 * a month, a quarter, a year — any of them in the past or future — or a
 * custom from/to range. Pure (no I/O) so it's unit-tested directly.
 *
 * URL shape: ?period=month&date=2024-03-15   (any date inside the period)
 *            ?period=custom&from=2023-01-01&to=2023-06-30
 * All maths is in UTC to match how journal dates are stored.
 */

export const GRANULARITIES = ["day", "week", "month", "quarter", "year", "custom"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  quarter: "Quarterly",
  year: "Yearly",
  custom: "Custom",
};

export interface PeriodParams {
  period?: string;
  date?: string;
  from?: string;
  to?: string;
}

export interface ResolvedPeriod {
  granularity: Granularity;
  /** Any date inside the period, YYYY-MM-DD — what goes back in the URL. */
  date: string;
  from: Date;
  /** Inclusive end: the last millisecond of the period. */
  to: Date;
  label: string;
  /** Anchor dates for the previous/next period (not for custom). */
  prev: string | null;
  next: string | null;
  /** True when the period contains today. */
  isCurrent: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY = 86_400_000;

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parses a strict YYYY-MM-DD into a UTC midnight Date, or null. */
export function parseIsoDay(s: string | undefined | null): Date | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1900 || y > 9999 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 ? date : null; // rejects 2023-02-30
}

const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const endOfDay = (d: Date) => new Date(utcMidnight(d).getTime() + DAY - 1);

/** Monday-based ISO week start. */
export function startOfWeek(d: Date): Date {
  const m = utcMidnight(d);
  const dow = (m.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(m.getTime() - dow * DAY);
}

/** ISO-8601 week number and week-year. */
export function isoWeek(d: Date): { year: number; week: number } {
  const thursday = new Date(startOfWeek(d).getTime() + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(startOfWeek(new Date(Date.UTC(year, 0, 4))).getTime() + 3 * DAY);
  return { year, week: 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY)) };
}

function bounds(g: Exclude<Granularity, "custom">, anchor: Date): { from: Date; to: Date } {
  const y = anchor.getUTCFullYear(), m = anchor.getUTCMonth();
  switch (g) {
    case "day":
      return { from: utcMidnight(anchor), to: endOfDay(anchor) };
    case "week": {
      const from = startOfWeek(anchor);
      return { from, to: new Date(from.getTime() + 7 * DAY - 1) };
    }
    case "month":
      return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 1) - 1) };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: new Date(Date.UTC(y, q, 1)), to: new Date(Date.UTC(y, q + 3, 1) - 1) };
    }
    case "year":
      return { from: new Date(Date.UTC(y, 0, 1)), to: new Date(Date.UTC(y + 1, 0, 1) - 1) };
  }
}

function shift(g: Exclude<Granularity, "custom">, anchor: Date, n: number): Date {
  const y = anchor.getUTCFullYear(), m = anchor.getUTCMonth();
  switch (g) {
    case "day": return new Date(utcMidnight(anchor).getTime() + n * DAY);
    case "week": return new Date(startOfWeek(anchor).getTime() + n * 7 * DAY);
    case "month": return new Date(Date.UTC(y, m + n, 1));
    case "quarter": return new Date(Date.UTC(y, Math.floor(m / 3) * 3 + n * 3, 1));
    case "year": return new Date(Date.UTC(y + n, 0, 1));
  }
}

function labelFor(g: Exclude<Granularity, "custom">, from: Date, to: Date): string {
  const y = from.getUTCFullYear();
  switch (g) {
    case "day": return `${from.getUTCDate()} ${MONTHS[from.getUTCMonth()]} ${y}`;
    case "week": {
      const { year, week } = isoWeek(from);
      return `Week ${week}, ${year} (${from.getUTCDate()} ${MONTHS[from.getUTCMonth()]} – ${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]})`;
    }
    case "month": return `${MONTHS_LONG[from.getUTCMonth()]} ${y}`;
    case "quarter": return `Q${Math.floor(from.getUTCMonth() / 3) + 1} ${y}`;
    case "year": return String(y);
  }
}

/**
 * Turns URL params into a concrete range. Anything missing or malformed falls
 * back to `fallback` granularity around today, so a bad link never errors.
 */
export function resolvePeriod(params: PeriodParams, now: Date = new Date(), fallback: Granularity = "month"): ResolvedPeriod {
  const g = (GRANULARITIES as readonly string[]).includes(params.period ?? "") ? (params.period as Granularity) : fallback;

  if (g === "custom") {
    let from = parseIsoDay(params.from);
    let to = parseIsoDay(params.to);
    if (from && to && from > to) [from, to] = [to, from];
    if (from && to) {
      const end = endOfDay(to);
      return {
        granularity: "custom",
        date: isoDay(from),
        from,
        to: end,
        label: `${labelFor("day", from, from)} – ${labelFor("day", to, to)}`,
        prev: null,
        next: null,
        isCurrent: now >= from && now <= end,
      };
    }
    return resolvePeriod({ period: "month", date: params.date }, now);
  }

  const anchor = parseIsoDay(params.date) ?? utcMidnight(now);
  const { from, to } = bounds(g, anchor);
  return {
    granularity: g,
    date: isoDay(anchor),
    from,
    to,
    label: labelFor(g, from, to),
    prev: isoDay(shift(g, anchor, -1)),
    next: isoDay(shift(g, anchor, 1)),
    isCurrent: now >= from && now <= to,
  };
}

/** The saved dashboard default ("mtd", "ytd", …) expressed as a period. */
export function periodFromRange(range: string, now: Date = new Date()): ResolvedPeriod {
  const today = isoDay(now);
  if (range === "last30") {
    return resolvePeriod({ period: "custom", from: isoDay(new Date(utcMidnight(now).getTime() - 29 * DAY)), to: today }, now);
  }
  const g: Granularity = range === "ytd" ? "year" : range === "qtd" ? "quarter" : "month";
  const p = resolvePeriod({ period: g, date: today }, now);
  // "…to date": stop at the end of today rather than the end of the period.
  return { ...p, to: endOfDay(now) < p.to ? endOfDay(now) : p.to };
}

/** URL search string for a period, keeping other params (e.g. account filter). */
export function periodQuery(p: { granularity: Granularity; date?: string; from?: string; to?: string }, keep: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(keep)) if (v && !["period", "date", "from", "to"].includes(k)) q.set(k, v);
  q.set("period", p.granularity);
  if (p.granularity === "custom") {
    if (p.from) q.set("from", p.from);
    if (p.to) q.set("to", p.to);
  } else if (p.date) {
    q.set("date", p.date);
  }
  return q.toString();
}

/**
 * For a date written loosely in an imported sheet — "2023", "2023-03",
 * "2023-W12", "2023-Q2" or a full day — the day an entry should be dated:
 * the last day of that period (so a yearly total lands in that year).
 */
export function periodEndDay(value: string): Date | null {
  const s = value.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})$/))) return new Date(Date.UTC(Number(m[1]) + 1, 0, 1) - DAY);
  if ((m = s.match(/^(\d{4})-(\d{1,2})$/))) {
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return new Date(Date.UTC(Number(m[1]), mo, 1) - DAY);
  }
  if ((m = s.match(/^(\d{4})-?Q([1-4])$/i))) return new Date(Date.UTC(Number(m[1]), Number(m[2]) * 3, 1) - DAY);
  if ((m = s.match(/^(\d{4})-?W(\d{1,2})$/i))) {
    const year = Number(m[1]), week = Number(m[2]);
    if (week < 1 || week > 53) return null;
    const week1 = startOfWeek(new Date(Date.UTC(year, 0, 4)));
    const sunday = new Date(week1.getTime() + (week - 1) * 7 * DAY + 6 * DAY);
    return isoWeek(sunday).year === year ? sunday : null;
  }
  return null;
}

/** Serializable props for <PeriodPicker>. */
export function pickerProps(p: ResolvedPeriod) {
  return {
    granularity: p.granularity,
    date: p.date,
    from: isoDay(p.from),
    to: isoDay(p.to),
    label: p.label,
    prev: p.prev,
    next: p.next,
    isCurrent: p.isCurrent,
  };
}

export interface SubPeriod {
  label: string;
  from: Date;
  to: Date;
  /** Link target to drill into this slice. */
  granularity: Exclude<Granularity, "custom">;
  date: string;
}

/**
 * How a period breaks down for a trend table: a year or quarter into months,
 * a month into weeks (clipped to the month), a week into days. A custom range
 * picks days, weeks or months depending on its length. A single day has none.
 */
export function subPeriods(p: ResolvedPeriod): SubPeriod[] {
  const span = (p.to.getTime() - p.from.getTime()) / DAY;
  const step: Exclude<Granularity, "custom"> | null =
    p.granularity === "year" || p.granularity === "quarter" ? "month"
    : p.granularity === "month" ? "week"
    : p.granularity === "week" ? "day"
    : p.granularity === "custom" ? (span <= 31 ? "day" : span <= 120 ? "week" : "month")
    : null;
  if (!step) return [];
  const out: SubPeriod[] = [];
  let cursor = p.from;
  for (let i = 0; i < 400 && cursor <= p.to; i++) {
    const b = bounds(step, cursor);
    const from = b.from < p.from ? p.from : b.from;
    const to = b.to > p.to ? p.to : b.to;
    const label =
      step === "month" ? `${MONTHS[from.getUTCMonth()]} ${from.getUTCFullYear()}`
      : step === "day" ? `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(from.getUTCDay() + 6) % 7]} ${from.getUTCDate()} ${MONTHS[from.getUTCMonth()]}`
      : `Week ${isoWeek(from).week} (${from.getUTCDate()}–${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]})`;
    out.push({ label, from, to, granularity: step, date: isoDay(from) });
    cursor = new Date(b.to.getTime() + 1);
  }
  return out;
}
