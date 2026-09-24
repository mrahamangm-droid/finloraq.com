// The dashboard's card catalog and the logic that turns a user's saved
// layout into what's rendered. Pure, so it's unit-tested.

export type WidgetSize = "sm" | "lg";

export const WIDGETS = [
  { id: "cash", label: "Cash (Bank)", size: "sm" },
  { id: "profit", label: "Net profit", size: "sm" },
  { id: "revenue", label: "Income", size: "sm" },
  { id: "expenses", label: "Expenses", size: "sm" },
  { id: "receivables", label: "Receivables outstanding", size: "sm" },
  { id: "payables", label: "Payables outstanding", size: "sm" },
  { id: "customers", label: "Customers", size: "sm" },
  { id: "suppliers", label: "Suppliers", size: "sm" },
  { id: "openInvoices", label: "Open invoices", size: "sm" },
  { id: "draftJournals", label: "Draft journal entries", size: "sm" },
  { id: "quickActions", label: "Quick actions", size: "lg" },
  { id: "topReceivables", label: "Who owes you most", size: "lg" },
  { id: "topPayables", label: "Who you owe most", size: "lg" },
  { id: "reports", label: "Report shortcuts", size: "lg" },
] as const satisfies ReadonlyArray<{ id: string; label: string; size: WidgetSize }>;

export type WidgetId = (typeof WIDGETS)[number]["id"];
export interface WidgetSetting { id: WidgetId; visible: boolean }

/** New users see these; everything else is one click away in "Customize". */
const DEFAULT_VISIBLE = new Set<WidgetId>([
  "cash", "profit", "revenue", "expenses", "receivables", "payables", "customers", "suppliers", "openInvoices", "draftJournals", "quickActions", "reports",
]);

export const RANGES = {
  mtd: "Month to date",
  qtd: "Quarter to date",
  ytd: "Year to date",
  last30: "Last 30 days",
} as const;
export type RangeId = keyof typeof RANGES;

export function defaultLayout(): WidgetSetting[] {
  return WIDGETS.map((w) => ({ id: w.id, visible: DEFAULT_VISIBLE.has(w.id) }));
}

const KNOWN = new Set<string>(WIDGETS.map((w) => w.id));

/**
 * Accepts whatever is stored (possibly from an older version, possibly
 * tampered with) and returns a complete, valid layout: saved order first,
 * unknown ids and duplicates dropped, widgets added since then appended.
 */
export function normalizeLayout(saved: unknown): WidgetSetting[] {
  const out: WidgetSetting[] = [];
  const seen = new Set<string>();
  if (Array.isArray(saved)) {
    for (const item of saved) {
      if (!item || typeof item !== "object") continue;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== "string" || !KNOWN.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ id: id as WidgetId, visible: (item as { visible?: unknown }).visible !== false });
    }
  }
  for (const d of defaultLayout()) if (!seen.has(d.id)) out.push(d);
  return out;
}

export function normalizeRange(v: unknown): RangeId {
  return typeof v === "string" && v in RANGES ? (v as RangeId) : "mtd";
}

/** Start of the selected reporting period (UTC). */
export function rangeStart(range: RangeId, now: Date): Date {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  switch (range) {
    case "qtd": return new Date(Date.UTC(y, m - (m % 3), 1));
    case "ytd": return new Date(Date.UTC(y, 0, 1));
    case "last30": return new Date(now.getTime() - 30 * 86400000);
    default: return new Date(Date.UTC(y, m, 1));
  }
}
