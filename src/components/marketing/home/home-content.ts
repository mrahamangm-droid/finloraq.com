// Copy for the marketing homepage, kept apart from layout so wording changes
// never touch markup. Claims here have to match what the product actually
// does today: anything not live yet is marked `status: "soon"` and rendered
// with a visible "Coming soon" label instead of being presented as shipped.

export type FlowStage = {
  id: "upload" | "ai" | "finance" | "intelligence";
  title: string;
  items: readonly string[];
};

/** How it works: four stages, top to bottom. */
export const FLOW_STAGES: readonly FlowStage[] = [
  { id: "upload", title: "Upload anything", items: ["PDF", "Photo", "Invoice", "Receipt", "Excel", "CSV", "Email"] },
  { id: "ai", title: "Finloraq AI", items: ["Read", "Understand", "Verify", "Classify"] },
  { id: "finance", title: "Finance", items: ["Accounting", "Sales", "Purchases", "Expenses", "Banking", "Taxes"] },
  { id: "intelligence", title: "Intelligence", items: ["Business Pulse", "Forecast", "What-If", "Actions"] },
];

export type Feature = {
  id: string;
  title: string;
  body: string;
  /** SVG path data (24x24, stroked) for the card icon. */
  icon: string;
  status?: "soon";
};

export const FEATURES: readonly Feature[] = [
  {
    id: "ai-accounting",
    title: "AI Accounting",
    icon: "M4 19V5h16v14H4zM12 5v14M7 9h2M7 13h2M15 9h2M15 13h2",
    body: "Real double-entry books. AI drafts the entry, you approve it, the ledger stays balanced and immutable.",
  },
  {
    id: "business-pulse",
    title: "Business Pulse",
    icon: "M3 12h4l2-6 4 12 2-6h6",
    body: "Cash, margin, receivables and payables on one screen, with the few things that need you today.",
  },
  {
    id: "document-intelligence",
    title: "Document Intelligence",
    icon: "M7 3h7l5 5v13H7V3zM14 3v5h5M10 13h6M10 17h4",
    body: "Drop a receipt, invoice or statement. Finloraq reads the supplier, dates, lines and VAT for you to check.",
  },
  {
    id: "finance-automation",
    title: "Finance Automation",
    icon: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
    body: "Approval rules, bank matching and AI-drafted entries, always inside the roles and limits you set.",
  },
  {
    id: "forecast-what-if",
    title: "Forecast & What-If",
    icon: "M4 20h16M6 16l4-5 3 3 5-7M18 7h-3M18 7v3",
    body: "A 30/60/90-day cash forecast from your open invoices and bills. Scenario modelling is on the way.",
  },
  {
    id: "customer-concierge",
    title: "Customer Concierge",
    icon: "M4 5h16v11H9l-5 4V5zM8 10h8M8 13h5",
    body: "Answers customer questions about invoices and payments on chat and email, within rules you approve.",
    status: "soon",
  },
];

export const TRUST_ITEMS: readonly { title: string; detail: string }[] = [
  { title: "Double-entry", detail: "Debits always equal credits" },
  { title: "Audit trail", detail: "Every change recorded" },
  { title: "Security", detail: "MFA and encrypted data" },
  { title: "Permissions", detail: "Server-enforced roles" },
  { title: "Multi-company", detail: "Isolated books per company" },
  { title: "Multi-currency", detail: "Your own base currency" },
];

export const COMPANY_LINE = "PAPPLE WORLD FZE LLC | RAK, UAE | support@finloraq.com";
