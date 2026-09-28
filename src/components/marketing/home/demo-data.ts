// Fictional "Demo Company" numbers for the homepage product preview. The
// figures are kept internally consistent (the forecast, the invoices and the
// to-do list tell the same story) so the preview reads like a real set of
// books, and the preview labels them as demo data wherever they appear.

export type PreviewTab = "pulse" | "cash" | "invoices" | "copilot" | "whatif";

const MONTHLY_REVENUE = 84_600;

type DemoData = {
  cashToday: number;
  kpis: readonly { label: string; value: number; delta: string; trend: "up" | "down" | "flat" }[];
  revenueByMonth: readonly { month: string; value: number }[];
  todos: readonly { text: string; cta: string; tab: PreviewTab }[];
  forecast: readonly [{ days: 30; cash: number }, { days: 60; cash: number }, { days: 90; cash: number }];
  invoices: readonly { no: string; customer: string; due: string; amount: number; status: "overdue" | "sent" | "paid" }[];
  copilot: readonly { q: string; a: string }[];
};

export const DEMO: DemoData = {
  cashToday: 128_450,
  kpis: [
    { label: "Cash", value: 128_450, delta: "+2.0% this month", trend: "up" },
    { label: "Revenue (month)", value: MONTHLY_REVENUE, delta: "+12.4% vs last", trend: "up" },
    { label: "Receivables", value: 46_900, delta: "$18,400 overdue", trend: "down" },
    { label: "Payables", value: 38_250, delta: "Due in 14 days", trend: "flat" },
  ],
  revenueByMonth: [
    { month: "Apr", value: 61_200 },
    { month: "May", value: 66_800 },
    { month: "Jun", value: 64_100 },
    { month: "Jul", value: 71_900 },
    { month: "Aug", value: 75_300 },
    { month: "Sep", value: MONTHLY_REVENUE },
  ],
  todos: [
    { text: "Customer ABC is 12 days overdue on $18,400", cta: "Review", tab: "invoices" },
    { text: "Cash dips to $71,800 in about 30 days", cta: "View forecast", tab: "cash" },
    { text: "Model a slower sales month before hiring", cta: "Try What-If", tab: "whatif" },
  ],
  forecast: [
    { days: 30, cash: 71_800 },
    { days: 60, cash: 80_300 },
    { days: 90, cash: 88_900 },
  ],
  invoices: [
    { no: "INV-1042", customer: "Customer ABC", due: "12 days ago", amount: 18_400, status: "overdue" },
    { no: "INV-1041", customer: "Al Fahim Trading", due: "In 9 days", amount: 6_200, status: "sent" },
    { no: "INV-1040", customer: "Northwind Retail", due: "Paid", amount: 14_900, status: "paid" },
    { no: "INV-1039", customer: "Northwind Retail", due: "Paid", amount: 9_600, status: "paid" },
  ],
  copilot: [
    { q: "What's overdue?", a: "One invoice: Customer ABC, $18,400, 12 days late. I can draft a reminder for you to send." },
    { q: "How did we do this month?", a: "Revenue $84,600, up 12.4% on August. Expenses $68,900, so profit is $15,700 (18.6% margin)." },
    { q: "Any unusual expenses?", a: "Packaging costs rose 23% against flat order volume. It's one supplier; worth checking their new price list." },
  ],
};

/**
 * What-If: projected cash in 90 days after changing sales by `salesPct`
 * percent and having customers pay `delayDays` later. About 70% of three
 * months' revenue is collected inside the window, so that share moves with
 * sales; each day of delay holds back one day of revenue.
 */
export function projectedCash90(salesPct: number, delayDays: number): number {
  const base = DEMO.forecast[2].cash;
  const salesEffect = MONTHLY_REVENUE * 3 * 0.7 * (salesPct / 100);
  const delayEffect = (MONTHLY_REVENUE / 30) * delayDays;
  return Math.round(base + salesEffect - delayEffect);
}
