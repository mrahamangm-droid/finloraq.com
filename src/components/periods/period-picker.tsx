"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GRANULARITIES, GRANULARITY_LABELS, periodQuery, type Granularity } from "@/lib/periods";

interface Props {
  granularity: Granularity;
  /** YYYY-MM-DD anchor inside the current period. */
  date: string;
  from: string;
  to: string;
  label: string;
  prev: string | null;
  next: string | null;
  isCurrent: boolean;
  /** Hide options a report can't use (e.g. a balance sheet has no "custom"). */
  allow?: Granularity[];
  /** Lists (invoices, bills, expenses) start unfiltered: no tab is selected and "All dates" shows. */
  showingAll?: boolean;
  /** Offer a "Show all dates" link back to the unfiltered list. */
  clearable?: boolean;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Daily / Weekly / Monthly / Quarterly / Yearly / Custom switcher with
 * previous/next arrows and a way to jump to any past period. Everything lives
 * in the URL, so a view can be bookmarked or shared and the server renders the
 * right numbers directly.
 */
export function PeriodPicker({ granularity, date, from, to, label, prev, next, isCurrent, allow, showingAll = false, clearable = false }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const search = useSearchParams();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const options = allow ?? [...GRANULARITIES];
  const clearHref = clearable ? pathname : null;

  const go = (p: { granularity: Granularity; date?: string; from?: string; to?: string }) => {
    const keep: Record<string, string> = {};
    search?.forEach((v: string, k: string) => { keep[k] = v; });
    router.push(`${pathname}?${periodQuery(p, keep)}`);
  };

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const field = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 text-sm" aria-label="Reporting period">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex flex-wrap gap-1 rounded-md bg-muted/60 p-1">
          {options.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={!showingAll && granularity === g}
              onClick={() => (g === "custom" ? go({ granularity: g, from, to: to }) : go({ granularity: g, date }))}
              className={`rounded px-2.5 py-1 text-xs font-medium sm:text-sm ${!showingAll && granularity === g ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {GRANULARITY_LABELS[g]}
            </button>
          ))}
        </div>

        {showingAll && <span className="ml-auto text-muted-foreground">All dates — pick a period to filter</span>}
        {!showingAll && granularity !== "custom" && (
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => prev && go({ granularity, date: prev })} className="rounded-md p-1.5 hover:bg-muted" aria-label="Previous period">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[8rem] text-center font-medium text-foreground">{label}</span>
            <button type="button" onClick={() => next && go({ granularity, date: next })} className="rounded-md p-1.5 hover:bg-muted" aria-label="Next period">
              <ChevronRight className="h-4 w-4" />
            </button>
            {!isCurrent && (
              <button type="button" onClick={() => go({ granularity, date: today() })} className="ml-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                Today
              </button>
            )}
          </div>
        )}
      </div>

      {!showingAll && <div className="flex flex-wrap items-end gap-2">
        {(granularity === "day" || granularity === "week") && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{granularity === "day" ? "Day" : "Any day in the week"}</span>
            <input type="date" value={date} onChange={(e) => e.target.value && go({ granularity, date: e.target.value })} className={field} />
          </label>
        )}
        {granularity === "month" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Month</span>
            <select value={month} onChange={(e) => go({ granularity, date: `${year}-${String(e.target.value).padStart(2, "0")}-01` })} className={field}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
        )}
        {granularity === "quarter" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Quarter</span>
            <select value={Math.floor((month - 1) / 3) + 1} onChange={(e) => go({ granularity, date: `${year}-${String((Number(e.target.value) - 1) * 3 + 1).padStart(2, "0")}-01` })} className={field}>
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </label>
        )}
        {(granularity === "month" || granularity === "quarter" || granularity === "year") && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Year</span>
            <input
              type="number"
              min={1900}
              max={9999}
              defaultValue={year}
              key={year}
              onBlur={(e) => { const y = Number(e.target.value); if (y >= 1900 && y <= 9999 && y !== year) go({ granularity, date: `${y}-${date.slice(5)}` }); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className={`${field} w-24`}
            />
          </label>
        )}
        {granularity === "custom" && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">From</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">To</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={field} />
            </label>
            <button type="button" onClick={() => customFrom && customTo && go({ granularity, from: customFrom, to: customTo })} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              Apply
            </button>
            <span className="pb-1.5 text-muted-foreground">{label}</span>
          </>
        )}
        {clearHref && (
          <a href={clearHref} className="ml-auto pb-1.5 text-xs text-muted-foreground underline hover:text-foreground">Show all dates</a>
        )}
      </div>}
    </div>
  );
}
