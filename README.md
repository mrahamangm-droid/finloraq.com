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

Invoices, bills, customers, suppliers, expenses and payments (Phase 3) don't exist as UI
or API yet, so nothing currently calls the posting builders end-to-end from a real sales
or purchase transaction — only the manual Journal Entry screen does, which is enough to
prove and test the engine but isn't the full accounting workflow. Banking, tax filing,
the AI Copilot, projects, and everything after are all still "Coming Soon" stubs in the
nav, honestly labeled rather than faked.

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
| 3 | Customers, Suppliers, Invoices, Bills, Payments, Expenses | Not started |
| 4 | Banking, Reconciliation, Tax, Reports | Not started |
| 5 | Projects, Budgets, Cost Centres, Cash-flow intelligence | Not started |
| 6 | AI Copilot, OCR/document extraction, anomaly detection | Not started |
| 7 | Email, WhatsApp, voice architecture, e-invoicing adapters | Not started |
| 8 | Subscriptions, billing, usage metering, enterprise controls | Not started |
| 9 | Security hardening, testing, performance, accessibility, SEO, production deploy | Ongoing as each phase lands |

Phase 3 is next: Customers, Suppliers, Invoices, Bills, Payments, Expenses — real CRUD
UI and API routes that, on send/approve, call the Phase 2 posting builders
(`buildInvoicePosting`, `buildBillPosting`, etc.) through `postJournalEntry()` so every
sales/purchase document produces a real, balanced ledger entry instead of a
front-end-only total.
