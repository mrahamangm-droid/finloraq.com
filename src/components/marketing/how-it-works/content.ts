// Content for the "How Finloraq works" homepage section.
//
// Everything a visitor reads in the section lives here, so copy changes never
// touch the 3D code. The sample documents are clearly fictional ("Demo …"
// parties, DEMO- reference numbers) and every place they are shown carries a
// visible DEMO label — they illustrate the flow, they are not customer data.

export type InputKind =
  | "photo"
  | "screenshot"
  | "pdf"
  | "sheet"
  | "receipt"
  | "invoice"
  | "email"
  | "whatsapp";

export type ModuleId =
  | "accounting"
  | "purchases"
  | "sales"
  | "expenses"
  | "customers"
  | "suppliers"
  | "banking"
  | "taxes";

export type PhaseId = "drop" | "understand" | "record" | "analyze" | "act" | "respond";

export const INPUTS: ReadonlyArray<{ id: InputKind; label: string }> = [
  { id: "photo", label: "Photo" },
  { id: "screenshot", label: "Screenshot" },
  { id: "pdf", label: "PDF" },
  { id: "sheet", label: "Excel / CSV" },
  { id: "receipt", label: "Receipt" },
  { id: "invoice", label: "Invoice" },
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
];

export const CORE_STEPS = ["Read", "Understand", "Verify", "Classify"] as const;

export const MODULES: ReadonlyArray<{ id: ModuleId; label: string }> = [
  { id: "accounting", label: "Accounting" },
  { id: "purchases", label: "Purchases" },
  { id: "sales", label: "Sales" },
  { id: "expenses", label: "Expenses" },
  { id: "customers", label: "Customers" },
  { id: "suppliers", label: "Suppliers" },
  { id: "banking", label: "Banking" },
  { id: "taxes", label: "Taxes" },
];

export const ENGINE_STEPS = ["Journal", "Ledger", "Reconciliation", "Reports"] as const;
export const INTEL_STEPS = ["Business Pulse", "AI Insights", "Forecast", "What-If"] as const;
export const CONCIERGE_CHANNELS = ["Website chat", "Email", "WhatsApp"] as const;

/** The six headline beats — the sentence the animation has to say in seconds. */
export const PHASES: ReadonlyArray<{ id: PhaseId; verb: string; short: string; blurb: string }> = [
  { id: "drop", verb: "Drop anything", short: "Drop anything", blurb: "Photos, PDFs, spreadsheets, receipts, email, WhatsApp — no templates, no sorting." },
  { id: "understand", verb: "Finloraq understands", short: "Understands", blurb: "The AI core reads the document, understands it, verifies it and classifies it." },
  { id: "record", verb: "Records", short: "Records", blurb: "It is routed to the right module and posted as balanced double-entry — journal, ledger, reconciliation, reports." },
  { id: "analyze", verb: "Analyzes", short: "Analyzes", blurb: "Every record updates Business Pulse, AI insights, the cash forecast and your what-if scenarios." },
  { id: "act", verb: "Acts", short: "Acts", blurb: "It prepares the next step — a bill to approve, a reminder, a reconciliation — and waits for your approval where you want control." },
  { id: "respond", verb: "Responds", short: "Responds", blurb: "Customers get answers on website chat, email or WhatsApp, within the rules you set." },
];

/** The six pipeline stages as the brief names them (used for 3D titles + the accessible outline). */
export const STAGES: ReadonlyArray<{ title: string; items: readonly string[] }> = [
  { title: "Any input", items: INPUTS.map((i) => i.label) },
  { title: "Finloraq AI Core", items: CORE_STEPS },
  { title: "Auto routing", items: MODULES.map((m) => m.label) },
  { title: "Accounting engine", items: ENGINE_STEPS },
  { title: "Intelligence", items: INTEL_STEPS },
  { title: "Customer concierge", items: [...CONCIERGE_CHANNELS, "Automatic customer response"] },
];

export interface PostingLine {
  account: string;
  /** Formatted amount, or null when the amount comes from the user's own document. */
  dr?: string | null;
  cr?: string | null;
}

/** What the section shows for one document travelling through the pipeline. */
export interface Trace {
  input: InputKind;
  /** Title shown in the trace header, e.g. "Supplier invoice". */
  detected: string;
  /** Why/how it was detected — short, honest. */
  detectedNote: string;
  /** Extracted fields. `demo` rows are illustrative sample values. */
  fields: ReadonlyArray<{ label: string; value: string }>;
  fieldsAreDemo: boolean;
  modules: readonly ModuleId[];
  routeNote: string;
  posting: readonly PostingLine[];
  postingNote: string;
  action: string;
  /** Two-to-four word version of `action` for the 3D action card. */
  actionShort: string;
  response: { channel: string; text: string };
  /** Short text for the 3D chat bubble. */
  bubble: string;
}

export interface Sample extends Trace {
  id: string;
  chip: string;
  fileName: string;
}

const AED = (n: string) => `AED ${n}`;

export const SAMPLES: readonly Sample[] = [
  {
    id: "invoice",
    chip: "Supplier invoice · PDF",
    fileName: "DEMO-supplier-invoice.pdf",
    input: "invoice",
    detected: "Supplier tax invoice",
    detectedNote: "Issued to you by a supplier, UAE VAT at 5%",
    fields: [
      { label: "Supplier", value: "Demo Supplies LLC" },
      { label: "Invoice no.", value: "INV-DEMO-0142" },
      { label: "Invoice date", value: "14 Sep 2026" },
      { label: "Subtotal", value: AED("4,200.00") },
      { label: "VAT 5%", value: AED("210.00") },
      { label: "Total", value: AED("4,410.00") },
    ],
    fieldsAreDemo: true,
    modules: ["purchases", "suppliers", "taxes"],
    routeNote: "Draft bill in Purchases, supplier matched, input VAT tracked for your return",
    posting: [
      { account: "Office supplies expense", dr: "4,200.00" },
      { account: "VAT recoverable (input)", dr: "210.00" },
      { account: "Accounts payable — Demo Supplies LLC", cr: "4,410.00" },
    ],
    postingNote: "Debits equal credits · posts only after approval",
    action: "Bill sent to you for approval, with a duplicate check already done",
    actionShort: "Approve bill",
    response: { channel: "Email", text: "Receipt of INV-DEMO-0142 acknowledged to the supplier once you approve" },
    bubble: "Invoice received — thank you",
  },
  {
    id: "receipt",
    chip: "Fuel receipt · Photo",
    fileName: "DEMO-receipt-photo.jpg",
    input: "receipt",
    detected: "Expense receipt",
    detectedNote: "Photographed paper receipt, VAT included",
    fields: [
      { label: "Merchant", value: "Demo Fuel Station" },
      { label: "Date", value: "18 Sep 2026" },
      { label: "Category", value: "Fuel & travel" },
      { label: "Net", value: AED("95.24") },
      { label: "VAT 5%", value: AED("4.76") },
      { label: "Total paid", value: AED("100.00") },
    ],
    fieldsAreDemo: true,
    modules: ["expenses", "taxes"],
    routeNote: "Expense claim in Expenses, VAT split out for your return",
    posting: [
      { account: "Fuel & travel", dr: "95.24" },
      { account: "VAT recoverable (input)", dr: "4.76" },
      { account: "Company card", cr: "100.00" },
    ],
    postingNote: "Debits equal credits · receipt attached to the entry",
    action: "Expense claim created and queued for manager approval",
    actionShort: "Approve claim",
    response: { channel: "WhatsApp", text: "Submitter told the claim is in and awaiting approval" },
    bubble: "Claim submitted ✓",
  },
  {
    id: "bank",
    chip: "Bank statement · CSV",
    fileName: "DEMO-bank-statement.csv",
    input: "sheet",
    detected: "Bank statement",
    detectedNote: "Date, description and amount columns",
    fields: [
      { label: "Lines", value: "3" },
      { label: "Credit", value: `${AED("12,600.00")} · Demo Trading LLC` },
      { label: "Debit", value: `${AED("4,410.00")} · Demo Supplies LLC` },
      { label: "Debit", value: `${AED("38.00")} · Bank charge` },
    ],
    fieldsAreDemo: true,
    modules: ["banking", "accounting"],
    routeNote: "Lines matched in Banking against open invoices and bills",
    posting: [
      { account: "Bank — current account", dr: "12,600.00" },
      { account: "Accounts receivable — Demo Trading LLC", cr: "12,600.00" },
    ],
    postingNote: "2 of 3 lines matched · the bank charge is suggested, not posted",
    action: "One unmatched line flagged for your review",
    actionShort: "Review 1 line",
    response: { channel: "Email", text: "Payment receipt sent to Demo Trading LLC" },
    bubble: "Payment received — thank you",
  },
  {
    id: "email",
    chip: "Customer email",
    fileName: "DEMO-customer-email.eml",
    input: "email",
    detected: "Customer request",
    detectedNote: "Asks for an invoice copy and its due date",
    fields: [
      { label: "From", value: "accounts@demo-trading.example" },
      { label: "Intent", value: "Resend invoice + confirm due date" },
      { label: "Refers to", value: "Invoice DEMO-1044" },
      { label: "Open balance", value: AED("7,350.00") },
      { label: "Due", value: "30 Oct 2026" },
    ],
    fieldsAreDemo: true,
    modules: ["customers", "sales"],
    routeNote: "Linked to the customer record and invoice DEMO-1044 in Sales",
    posting: [],
    postingNote: "Nothing to post — the ledger is read, not changed",
    action: "Reply drafted with the invoice PDF attached",
    actionShort: "Reply drafted",
    response: { channel: "Email", text: "Sent automatically — your rules allow invoice-copy requests" },
    bubble: "Here is DEMO-1044, due 30 Oct",
  },
  {
    id: "whatsapp",
    chip: "WhatsApp order",
    fileName: "DEMO-whatsapp-order.txt",
    input: "whatsapp",
    detected: "Customer order",
    detectedNote: "Quantity and product mentioned, price from last order",
    fields: [
      { label: "Customer", value: "Demo Trading LLC" },
      { label: "Item", value: "A-12 cartons × 20" },
      { label: "Unit price", value: `${AED("250.00")} (last order)` },
      { label: "Net", value: AED("5,000.00") },
      { label: "VAT 5%", value: AED("250.00") },
      { label: "Total", value: AED("5,250.00") },
    ],
    fieldsAreDemo: true,
    modules: ["sales", "customers", "taxes"],
    routeNote: "Quote drafted in Sales; posts as an invoice once accepted",
    posting: [
      { account: "Accounts receivable — Demo Trading LLC", dr: "5,250.00" },
      { account: "Sales revenue", cr: "5,000.00" },
      { account: "VAT payable (output)", cr: "250.00" },
    ],
    postingNote: "Shown as it will post on invoicing · debits equal credits",
    action: "Quote DEMO-Q-88 prepared for your approval",
    actionShort: "Approve quote",
    response: { channel: "WhatsApp", text: "Customer told the quote is on its way" },
    bubble: "Order received — quote on its way",
  },
];

/** The ambient loop cycles through the samples in this order. */
export const LOOP_ORDER: readonly string[] = ["invoice", "whatsapp", "receipt", "email", "bank"];
