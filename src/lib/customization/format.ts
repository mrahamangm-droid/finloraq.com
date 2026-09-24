// Display formatting driven by each user's preferences (Settings → Preferences).
// Pure and string-based: amounts are grouped from their exact decimal string,
// never round-tripped through floating point.

export const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD MMM YYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** Keyed by an example so the settings screen can show it directly. */
export const NUMBER_FORMATS = {
  "1,234.56": { group: ",", decimal: ".", india: false },
  "1.234,56": { group: ".", decimal: ",", india: false },
  "1 234,56": { group: " ", decimal: ",", india: false },
  "12,34,567.89": { group: ",", decimal: ".", india: true },
} as const;
export type NumberFormat = keyof typeof NUMBER_FORMATS;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Numeric = number | string | { toFixed(n: number): string };

function group(intPart: string, sep: string, india: boolean): string {
  if (intPart.length <= 3) return intPart;
  if (!india) return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, sep);
  return `${rest}${sep}${last3}`;
}

export function formatAmount(value: Numeric, format: NumberFormat = "1,234.56", decimals = 2): string {
  const spec = NUMBER_FORMATS[format] ?? NUMBER_FORMATS["1,234.56"];
  let s = typeof value === "number" ? value.toFixed(decimals) : typeof value === "string" ? Number(value).toFixed(decimals) : value.toFixed(decimals);
  if (s === "NaN") return "—";
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const [i = "0", f] = s.split(".");
  const out = group(i, spec.group, spec.india) + (f ? spec.decimal + f : "");
  return neg && /[1-9]/.test(s) ? `-${out}` : out;
}

export function formatDate(value: Date | string | null | undefined, format: DateFormat = "YYYY-MM-DD"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const y = String(d.getUTCFullYear());
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  switch (format) {
    case "DD/MM/YYYY": return `${day}/${m}/${y}`;
    case "MM/DD/YYYY": return `${m}/${day}/${y}`;
    case "DD MMM YYYY": return `${day} ${MONTHS[d.getUTCMonth()]} ${y}`;
    default: return `${y}-${m}-${day}`;
  }
}

export interface Formatter {
  money: (v: Numeric) => string;
  date: (v: Date | string | null | undefined) => string;
}

export function makeFormatter(numberFormat: string, dateFormat: string): Formatter {
  const nf = (numberFormat in NUMBER_FORMATS ? numberFormat : "1,234.56") as NumberFormat;
  const df = ((DATE_FORMATS as readonly string[]).includes(dateFormat) ? dateFormat : "YYYY-MM-DD") as DateFormat;
  return { money: (v) => formatAmount(v, nf), date: (v) => formatDate(v, df) };
}
