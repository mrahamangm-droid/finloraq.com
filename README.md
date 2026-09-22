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

## What's built (Phase 7 — email, WhatsApp, voice, e-invoicing)

**Important — this phase is entirely external integrations, and none are configured in
this sandbox.** Per the spec's own rule 28 ("if a feature requires an external service
that is not yet configured, build the integration interface and a safe development
implementation rather than pretending the integration is live"), every integration here
has a real interface plus a dev/simulated implementation that is observably non-live
(`live: false` in its result, a distinct audit action like `einvoice.submitted_simulated`)
— never a silent no-op or a faked success.

- **Adapter interfaces** (`src/lib/integrations/types.ts`) — `EInvoicingAdapter`,
  `PaymentAdapter`, `WhatsAppAdapter`, each a small interface a real provider
  implementation drops in behind later without touching any caller.
- **E-invoicing** (`src/lib/integrations/einvoicing.ts`) — `DevEInvoicingAdapter` refuses
  to "submit" a still-DRAFT invoice, returns a `SIMULATED-<invoiceNumber>` reference for
  anything already sent, and audit-logs the simulation. Wired to
  `POST /api/invoices/[id]/submit-einvoice` (requires `invoices:EXPORT`).
- **WhatsApp** (`src/lib/integrations/whatsapp.ts`) — `DevWhatsAppAdapter` logs and
  simulates `sendDocumentLink()`/`sendPaymentReminder()` when
  `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` aren't set; `isWhatsAppConfigured()`
  flips the Settings page's status badge the moment they are.
  `src/app/api/webhooks/whatsapp/route.ts` implements Meta's real verification handshake
  (GET) and a POST stub that accepts and clearly labels inbound events as not-yet-wired
  (parsing inbound media into the extraction pipeline is a follow-up, not a fake success).
- **Inbound email → document pipeline** (`src/lib/integrations/email.ts`,
  `src/app/api/webhooks/email/route.ts`) — a shared-secret-authenticated webhook
  (`INBOUND_EMAIL_WEBHOOK_SECRET`, refuses every request until it's set — never silently
  accepts) that reuses the Phase 6 `extractDocument()` pipeline exactly, so an emailed
  receipt goes through the same OCR/review/approve path a manual upload does. Two
  simplifications are documented in code rather than hidden: it attributes ingestion to
  the company's Company Admin membership (no dedicated system-identity concept exists
  yet) and it authenticates by shared secret rather than a per-provider signature scheme
  (Postmark/Mailgun/SES each have their own HMAC — a TODO once one is chosen).
- **Voice command architecture** (`src/lib/ai/voice.ts`) — no speech-to-text provider is
  configured, so this operates on an already-transcribed string; swapping in real STT
  ahead of it is the only missing piece for actual voice input. `parseVoiceCommand()`
  answers a query immediately by delegating to the Phase 6 AI Copilot, but a command that
  would change data (currently: "draft an expense for AED 500") only ever returns a
  proposal — it has zero side effects. `confirmVoiceAction()` is the one function that
  actually writes anything, and it's a separate, explicit call
  (`POST /api/voice/command` → `POST /api/voice/confirm`), so "financial actions via voice
  require confirmation" is enforced by the code's shape, not just a UI dialog a client
  could skip. A confirmed voice expense is a DRAFT like any other — it still needs
  `expenses:APPROVE` to post.
- **UI**: the AI Copilot page now has a Voice tab (types a command since there's no STT)
  that shows query answers immediately and renders a Confirm/Cancel card for proposed
  actions. The Settings page (previously a stub) is real: an editable company-profile form
  (name, legal name, timezone, fiscal year end, TRN — deliberately excludes currency/country,
  since changing those after ledger activity would invalidate historical reports) plus a
  live/simulated status panel for AI, inbound email, WhatsApp, and e-invoicing, each backed
  by the actual env-var check rather than a hardcoded "connected."

## What's built (Phase 8 — subscriptions, billing, usage metering, enterprise controls)

**Important — no payment provider is configured in this sandbox.** Plan changes go
through the same real `PaymentAdapter` interface a Stripe integration would (`charge()`),
but the dev implementation never moves money — it returns a clearly-marked
`live: false` simulated result and audit-logs it as such, same honesty pattern as every
Phase 7 integration. Set `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` and swap in a real
adapter behind that interface to make it live; nothing else in the billing flow changes.

- **Plan catalog** (`src/lib/billing/plans.ts`) — the five plans from the spec
  (Starter/Growth/Professional/AI-CFO/Enterprise) as one typed table: monthly price, seat
  count, a monthly AI-usage cap, and per-feature flags (document extraction, voice
  commands, e-invoicing, multi-company, API access). Every other file — the billing page,
  the usage-limit checks, the plan-change API — reads from this table rather than
  hardcoding a number anywhere else. Unit-tested (`plans.test.ts`) for internal
  consistency: limits and unlocked features never regress on a higher-priced plan.
- **Usage metering & enforcement** (`src/lib/billing/usage.ts`) — every AI Copilot
  question and document extraction records a real `AiUsageEvent` row (previously this was
  only implied by an audit-log entry, never actually persisted — fixed here). Before
  answering, `enforceAiUsageLimit()` checks the company's plan cap for the current
  calendar month and throws a clear, catchable error once it's reached, rather than the
  feature silently degrading or a bill quietly growing unbounded.
- **Feature gating by plan**: document extraction (Starter excluded), voice commands
  (Professional+ only), and e-invoicing submission (Growth+ only) all check
  `planDefinition(...).features` and return a plain "upgrade to unlock this" message
  instead of a generic permission error, so the limit is explainable, not mysterious.
- **Subscription management** (`src/lib/billing/subscription.ts`) — `getBillingSnapshot()`
  (plan, status, seats used/limit, AI usage used/limit — what the Billing page and
  `GET /api/billing/subscription` render) and `changePlan()` (drives the simulated
  checkout above, updates the `Subscription` row, audit-logs the change). Downgrading
  below your current active-seat count is intentionally still allowed — flagged as a TODO
  rather than silently blocked, since deciding *which* members to deactivate isn't a
  billing-form decision.
- **Enterprise controls — real multi-user management** (`src/lib/users.ts`,
  `(app)/users/page.tsx`): the Users & Roles page was a stub since Phase 1; it's real now.
  Invite by email + role (enforced against the plan's seat limit via
  `enforceSeatLimit()`), accept via a tokenized link at `/invite/[token]` (strictly checked
  against the signed-in session's own email — never trusts the token alone), change a
  member's role, deactivate a member — with a guard against demoting or deactivating the
  last Company Admin. No outbound email provider exists to deliver the invite
  automatically (the same gap Phase 7 flagged for receipts), so the link is surfaced
  directly in the UI for an admin to copy and send. The invite page reuses `/login` and
  `/register`, which now support a same-site-only `callbackUrl` so accepting an invite as
  a brand-new user flows straight back to the invitation after signup — open-redirect-safe
  by construction (only ever a relative path).
- **Bug fix carried over from Phase 7**: the auth middleware protected every `/api/*`
  route except NextAuth's own, which would have 401'd the inbound email/WhatsApp/Stripe
  webhooks before they ever reached their own signature/secret verification — those are
  unauthenticated server-to-server callbacks with no user session to check. Fixed by
  excluding `/api/webhooks/*` from the auth gate in `src/middleware.ts`; each webhook
  still authenticates itself independently.
- **UI**: a Billing page (current plan/usage with progress bars, a plan-comparison grid
  with feature checklists, one-click simulated upgrade/downgrade) and the real Users &
  Roles page described above.

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
npm test                    # RBAC + password-policy + billing-plan-catalog unit tests
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
| 7 | Email, WhatsApp, voice architecture, e-invoicing adapters | **Done** (all adapters are dev/simulated pending real provider credentials) |
| 8 | Subscriptions, billing, usage metering, enterprise controls | **Done** (payment adapter is dev/simulated pending real provider credentials) |
| 9 | Security hardening, testing, performance, accessibility, SEO, production deploy | Ongoing as each phase lands |

Phase 9 is next: Security hardening, testing, performance, accessibility, SEO, and
production deploy. Concretely that's the spec's MFA architecture (the schema/auth layer
is ready for a challenge step — see the TODO in `src/lib/auth.ts`), rate limiting on
auth/webhook endpoints, the still-stubbed Audit Log page (every event is already being
recorded via `recordAuditEvent()` throughout every phase — it just isn't rendered
anywhere yet), broader automated test coverage (the ledger/RBAC/reports/plan-catalog
tests that exist today are real but far from exhaustive), and the actual production
deploy checklist (Vercel env vars, `prisma migrate deploy` as a release step, the
`app.finloraq.com` subdomain pointing at Vercel per the "Deploying" section below).
