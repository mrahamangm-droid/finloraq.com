# Finloraq — AI Finance Operating System

Accounting, cash flow, tax, automation and financial intelligence in one platform.
Initial market: UAE. Architecture: global from day one.

This repository is a **real, working Phase 1 foundation** — not a mockup. Nothing in it
fakes data or pretends to be functional: pages that aren't built yet say so explicitly
("Coming Soon — Phase N") instead of showing invented numbers.

## What's actually built (Phase 1)

- **Multi-tenant database schema** (`prisma/schema.prisma`) — Company/Branch/Department/
  CostCentre, full RBAC join tables, and the complete accounting/sales/purchases/banking/
  tax/project/document/audit/subscription schema so later phases attach without a schema
  rewrite. Only the Phase 1 tables have working read/write paths today; the rest are
  modeled but their business logic isn't implemented (see "Not built yet" below).
- **Authentication** — NextAuth with a credentials provider, Argon2id password hashing
  (OWASP-tuned), database-backed sessions (server-revocable), constant-shape login
  responses (no account-enumeration via timing), audit-logged login attempts.
- **Multi-tenancy** — `src/lib/tenant.ts` is the single choke point every server
  component/action uses to resolve "which user, acting as which company." Tenant
  isolation is enforced by scoping every query to `companyId` derived server-side, never
  trusted from the client.
- **RBAC** — `src/lib/rbac.ts` defines the full role → module → action permission matrix
  (Company Admin, CFO, Finance Manager, Accountant, Staff, Auditor) plus a per-user
  `PermissionOverride` escape hatch. Fully unit-tested (`src/lib/rbac.test.ts`). This is
  server-side only — the UI hiding a button is a convenience, never the control.
- **Company onboarding** — creates a Company, a starter chart of accounts, the UAE VAT
  tax pack (5% standard / zero-rated / exempt), an open accounting period, and a Starter
  subscription, all inside one DB transaction (`src/lib/onboarding.ts`).
- **Audit log** — append-only `AuditEvent` model, `src/lib/audit.ts` only ever calls
  `create()`. Login, registration and company creation already write to it.
- **UI shell** — the full product navigation from the spec (Dashboard, Accounting, Sales,
  Purchases, Expenses, Banking, Customers, Suppliers, Projects, Taxes, AI Copilot,
  Reports, Documents, Users, Settings, Audit Log), a dashboard that queries real (currently
  zero) data from Postgres, dark-mode-aware design tokens, and a security-headers config.

## What's built (Phase 2 — accounting engine)

- **Posting engine** (`src/lib/ledger.ts`) — the only code path allowed to write
  `JournalEntry`/`JournalLine`. Enforces, in this order: lines balance (debit=credit,
  pure-function-tested), RBAC permission (`CREATE` for a draft, `APPROVE` to post),
  duplicate-source prevention, an open (not locked) accounting period, valid+active
  accounts, atomic DB transaction, gapless sequential entry numbering (Postgres advisory
  lock — see the code comment on why and what to upgrade to at scale), and an audit log
  entry. Posted entries are never updated or deleted anywhere in the codebase —
  `reverseJournalEntry()` only ever creates a new offsetting entry.
- **Posting builders** for the spec's own worked examples (section 6): invoice, customer
  payment, supplier bill, supplier payment — each pure, unit-tested, and guaranteed
  balanced by construction.
- **Reports** (`src/lib/reports.ts`) — Trial Balance, General Ledger, Profit & Loss,
  Balance Sheet, computed live from posted `JournalLine` rows only. No cached/derived
  totals that could drift from the ledger; the balance sheet even reports
  `outOfBalance` (assets − (liabilities + equity)) so a ledger bug would surface loudly
  instead of silently.
- **UI**: Chart of Accounts, Journal Entries list, a manual journal entry form (dynamic
  lines, client-side balance indicator, server re-validates independently), Trial Balance
  and P&L report pages — all reading real Postgres data via the above.
- **Tests** (`src/lib/ledger.test.ts`): the debit=credit invariant, rejection of
  unbalanced/malformed lines, and every one of the spec's four worked posting examples.

## Not built yet (by design — see phase order below)

Email/WhatsApp/voice ingestion, e-invoicing adapters, subscriptions/billing, and
everything after Phase 6 are still "Coming Soon" stubs in the nav, honestly labeled
rather than faked. There is also no live bank feed (Plaid-equivalent) — Banking is manual
entry + matching, the honest state until Phase 7's external integrations.

## What's built (Phase 3 — sales, purchases, expenses)

- **Customers & Suppliers** — CRUD (create + list; edit/deactivate not yet built).
- **Invoices**: draft creation with line items and per-line tax codes computed
  server-side (`src/lib/sales.ts`); posting to the ledger (`postInvoiceToLedger`, DRAFT→SENT)
  calls `buildInvoicePosting()` from Phase 2 — this is the first place a real business
  transaction produces a real, balanced journal entry, not just the manual journal form.
  Customer payments (`recordInvoicePayment`) post `buildInvoicePaymentPosting()` and
  derive PARTIALLY_PAID/PAID status from actual posted payment entries, not a separate
  counter.
- **Bills**: same shape on the purchase side (`src/lib/purchases.ts`) —
  `createBill` → `approveAndPostBill` (DRAFT→APPROVED, posts `buildBillPosting()`) →
  `recordSupplierPayment` (posts `buildSupplierPaymentPosting()`).
- **Expenses** (`src/lib/expenses.ts`): submitted as a DRAFT journal entry (so STAFF, who
  can create expenses but not approve journals, is never blocked), then
  `approveExpense()` transitions it to POSTED via the ledger's new
  `postDraftJournalEntry()` — the one permitted mutation of a `JournalEntry` row, since a
  DRAFT hasn't been posted yet and "posted entries are immutable" doesn't apply to it.
- **UI**: Customers, Suppliers, Sales (invoice list/create/detail with Post + Record
  Payment), Purchases (bill list/create/detail with Approve + Record Payment), Expenses
  (submit + approve) — all real, all backed by the above.
- Known simplification: amount-based approval routing (section 13 — "Expense < AED 500 →
  Manager", etc.) isn't wired up yet; every approval today is a flat
  `journals:APPROVE`/`bills:APPROVE`/`expenses:APPROVE` permission check. The
  `WorkflowRule`/`Approval` tables already model the thresholds for when that lands.

## What's built (Phase 4 — banking, tax, reports)

- **Banking** (`src/lib/banking.ts`) — bank accounts, manual transaction entry (signed
  amount, no live feed yet — see note above), matching a transaction to a posted journal
  entry's Bank line by exact amount (zero tolerance; a mismatch is a human decision, not
  something to fuzz), and a bulk "reconcile" step that moves MATCHED transactions to
  RECONCILED. Requires `banking:APPROVE`, which CFO/Finance Manager/Company Admin hold
  and Accountant/Staff don't — reconciliation sign-off is deliberately a step up from
  day-to-day bookkeeping.
- **Tax** — a real VAT return (`vatReturn()` in `src/lib/reports.ts`): output tax minus
  input tax, computed from posted `JournalLine` rows against the Output/Input Tax
  accounts, not a separate running total. Filing to an actual tax authority (UAE FTA
  e-invoicing/e-filing) is external and belongs to Phase 7.
- **Reports** — AR and AP aging (`arAging()`/`apAging()`), bucketed 0/1-30/31-60/61-90/90+
  from each invoice/bill's own due date and its actual posted payments, plus the
  previously-missing Balance Sheet page, all linked from a new Reports hub.
- **Tests** (`src/lib/reports.test.ts`): the aging-bucket boundary logic (0, 30, 60, 90
  day edges) is pure and unit-tested independent of the database.

## What's built (Phase 5 — projects, budgets, cost centres, cash-flow)

- **Projects** (`src/lib/projects.ts`) — create a project, optionally linked to a customer
  and a budget; profitability is computed from real posted documents (sent/paid invoices'
  subtotal as revenue, approved/paid bills' subtotal as cost), not a guess, with a
  documented gap: direct expenses/labour aren't counted yet because only Invoice/Bill
  carry a `projectId` today, not JournalLine.
- **Cost Centres** (`src/lib/costCentres.ts`) — create/list, and a real spend-by-cost-centre
  report. The manual Journal Entry form (Accounting → Journal Entries → New) now has a
  per-line cost centre picker, so `JournalLine.costCentreId` — modeled since Phase 2 but
  unused until now — has a real writer.
- **Budget vs Actual** — lives on each project's detail page (budget vs. actual cost,
  over/under and by how much) rather than a separate report, since budgets in this schema
  are per-project, not a standalone company-wide budget table yet.
- **Cash-flow intelligence** (`src/lib/cashflow.ts`) — current cash read from the Bank
  account's trial-balance line (same source of truth as every other report); a 30/60/90-day
  forecast built from AR/AP aging due dates — explicitly documented as an "everyone pays on
  time" projection, not a statistical model; and customer payment-behavior (average days
  late, from actual payment postings vs. due date) to eventually inform a smarter model.
- **Dashboard** now shows real cash, MTD net profit, AR/AP outstanding and document counts
  instead of the Phase 1 placeholder note — all from the functions above, so it can never
  disagree with the ledger.

## What's built (Phase 6 — AI Copilot, document extraction, anomaly detection)

**Important — this phase needs a real API key to actually run.** Nothing here was (or
could be) tested against a live model in this sandbox: no AI credentials are configured,
and every code path that needs one degrades explicitly rather than pretending to work —
the copilot falls back to a templated (non-AI) answer, and document extraction returns a
clear "no AI provider configured" error instead of a fabricated result. Set
`ANTHROPIC_API_KEY` in `.env` to turn either on for real.

- **AI abstraction layer** (`src/lib/ai/provider.ts`) — a minimal `AiProvider` interface
  (`complete`, `completeWithImage`) with an Anthropic implementation; adding OpenAI or
  another provider is a new class implementing the same interface, not a rewrite of every
  caller. `getAiProvider()` returns `null` when unconfigured so features degrade instead
  of throwing.
- **AI Copilot** (`src/lib/ai/copilot.ts`) — deliberately NOT a free-form tool-calling
  loop. It classifies the question, fetches the real answer from the existing report
  functions (`profitAndLoss`, `arAging`, `vatReturn`, `cashFlowForecast`,
  `customerPaymentBehavior`, duplicate/largest-expense detection), and only then — if a
  provider is configured — asks the model to phrase that already-computed JSON into
  prose, under a system prompt that explicitly forbids adding or changing any figure.
  Without a provider, a deterministic template built from the same data is the answer.
  Every one of the spec's own example questions (overdue customers, VAT owed, late
  payers, largest expenses, 90-day forecast, duplicate invoices, explain the P&L, why did
  profit drop) is a real, data-backed case, not a mock.
- **Anomaly/duplicate detection** (`src/lib/ai/analysis.ts`) — deliberately NOT an AI
  call: duplicate invoice/bill detection (same party, same amount, within 7 days) and
  expense anomaly flagging (>3x an account's trailing-90-day average) are plain
  deterministic queries, so "why was this flagged" always has an exact, explainable
  answer rather than a model's opinion.
- **Document extraction** (`src/lib/ai/extraction.ts`) — the Document → OCR →
  Extraction step of the spec's pipeline (section 8). Uploads a receipt/bill image, calls
  the vision-capable model with a strict "read only what's printed, use null rather than
  guess" prompt, and returns fields for human review — it never creates an Expense
  itself. `createDraftExpenseFromExtraction()` only runs after that review and produces a
  DRAFT via the same `createExpense()` every manually-typed expense uses — an approver
  still has to post it. Known gap: no object storage is configured yet
  (`OBJECT_STORAGE_*` in `.env.example`), so the source image itself isn't persisted,
  only the extraction result — the `Document.storageKey` is a placeholder pending that
  wiring.
- **UI**: an AI Copilot chat page and a Documents upload/review page, both real, both
  honest about failure (a clear error banner, not a silent fake success) when no provider
  is configured.
- **Tests** (`src/lib/ai/extraction.test.ts`): the code-fence-stripping helper around the
  model's JSON response is pure and unit-tested; the AI calls themselves obviously can't
  be unit-tested without hitting a real API.

## Repository layout

```
prisma/schema.prisma      Full data model (see comments per section)
prisma/seed.ts            Dev-only demo user + company (uses the real onboarding path)
src/lib/db.ts              Prisma client singleton
src/lib/auth.ts            NextAuth config (Argon2id, database sessions)
src/lib/password.ts        Hashing + strength policy
src/lib/rbac.ts            Permission matrix + can()/requirePermission()
src/lib/tenant.ts          getTenantContext()/requireTenantContext() — the isolation choke point
src/lib/audit.ts           Append-only audit logging
src/lib/onboarding.ts      Company creation transaction (COA + tax pack + period + subscription)
src/middleware.ts          Route-level auth gate (defense in depth, not the authz boundary)
src/app/(app)/             Authenticated app shell + all module routes
src/app/login, /register   Auth pages
src/app/onboarding/company Company setup wizard
```

## Getting this running

This sandbox's network policy blocks the npm and PyPI registries, so dependencies could
not be installed or the build verified here. Everything is hand-written, real
TypeScript/Prisma — it needs `npm install` somewhere with registry access (your machine,
or Vercel's build step, both work) before it will run.

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL at minimum
npx prisma migrate dev --name init
npx prisma db seed          # optional: demo@finloraq.com / DemoPassword123!
npm run dev
npm test                    # RBAC + password-policy unit tests
```

## Deploying

1. Push this repository to GitHub (`git init && git add . && git commit -m "Finloraq Phase 1"`,
   then create the GitHub repo and push).
2. Import it into Vercel. Set the environment variables from `.env.example` in Vercel's
   project settings — never commit real secrets.
3. Point Vercel's Postgres (or your own — Neon/Supabase/RDS) at `DATABASE_URL`, then run
   `npx prisma migrate deploy` as a build/release step.
4. finloraq.com's marketing site stays on WordPress/Hostinger as-is; deploy this app on
   its own subdomain (e.g. `app.finloraq.com`) and point that CNAME at Vercel.

## Roadmap (spec's own phase order)

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation, auth, multi-tenancy, company setup, RBAC, DB, UI shell | **Done** |
| 2 | Accounting engine: Chart of Accounts, Journals, Ledger, Trial Balance, financial statements | **Done** |
| 3 | Customers, Suppliers, Invoices, Bills, Payments, Expenses | **Done** |
| 4 | Banking, Reconciliation, Tax, Reports | **Done** |
| 5 | Projects, Budgets, Cost Centres, Cash-flow intelligence | **Done** |
| 6 | AI Copilot, OCR/document extraction, anomaly detection | **Done** (needs a real API key to run live) |
| 7 | Email, WhatsApp, voice architecture, e-invoicing adapters | Not started |
| 8 | Subscriptions, billing, usage metering, enterprise controls | Not started |
| 9 | Security hardening, testing, performance, accessibility, SEO, production deploy | Ongoing as each phase lands |

Phase 7 is next: Email, WhatsApp, voice architecture, e-invoicing adapters — all external
integrations, so this phase is mostly building adapter interfaces (per section 25:
"create adapter interfaces for Tax, E-invoicing, Payment, Banking, Identity, AI
providers") plus a safe development implementation for each, per the spec's own rule 28
("If a feature requires an external service that is not yet configured, build the
integration interface and a safe development implementation rather than pretending the
integration is live"). The natural entry point for email/WhatsApp ingestion is the
Phase 6 document-extraction pipeline already built — an inbound attachment becomes a
`Document` the same way a manual upload does.
