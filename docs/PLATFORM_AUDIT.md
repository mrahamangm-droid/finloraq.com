# Finloraq Platform Audit — Sept 2026

A capability audit of the Finloraq app against the core feature set of mainstream
small-business accounting products (the Zoho Books / QuickBooks Online class), plus
Finloraq's own AI and modern-SaaS promises. Purpose: agree a priority order before
building, then close gaps one focused PR at a time.

**Method.** Every status below comes from reading the current code on `main`
(`bb0370d`), the Prisma schema, the routes/API surface and the existing tests,
not from the README (parts of it predate recent PRs). The two P0 accuracy bugs
were reproduced against a real Postgres 16 database with a scratch company (numbers
in §1). No competitor code, UI or documentation was copied; the comparison is at
the level of "what a business can do", not how any product implements it.

**Status key.** EXISTS = works end to end today. PARTIAL = usable but with a
material gap. MISSING = no implementation. BROKEN = present but produces wrong
results or unsafe behaviour.

**Priority key.** P0 = accounting accuracy, data integrity, security,
permissions, production stability. P1 = core accounting controls and
correctness a finance team relies on. P2 = expected parity features. P3 =
differentiators and larger builds. P4 = polish.

---

## 1. P0 findings (fix first)

| # | Finding | Status | Evidence | Proposed fix (one PR each) |
|---|---|---|---|---|
| P0-1 | **Balance sheet omits current-period profit.** `balanceSheet()` sums only ASSET/LIABILITY/EQUITY accounts; revenue and expense balances never reach equity and there is no year-end close. Any company with income or expenses sees the red "should be impossible" out-of-balance warning. | BROKEN | Scratch company, one posted AED 1,000 invoice: assets 1,000 · liabilities 0 · equity 0 · **out of balance 1,000**. | Report-only fix: add computed *Retained earnings* (P&L before the current fiscal year) and *Current year earnings* (fiscal-year-to-date P&L) lines to equity. No ledger writes. Unit + real-Postgres test that A = L + E after invoices, bills, payments and expenses. |
| P0-2 | **Foreign-currency documents post unconverted.** The invoice, bill and journal APIs accept any 3-letter currency, and the posting engine records it with `exchangeRate = 1`. Every report then adds those amounts to base-currency totals. | BROKEN | Same company (AED base): a USD 1,000 invoice posted with `currency USD, exchangeRate 1`; P&L revenue reads **2,000** (should be AED 1,000 + USD 1,000 ≈ AED 4,672.50). The UI only offers base currency, so this is reachable through the API, imports or future UI. | Guard now: reject any non-base currency at the server for invoices, bills, expenses, journals and imports, with a clear error, until real multi-currency (P2-4) exists. Add a read-only integrity check listing any existing non-base-currency entries so production data can be reviewed (no rewrites). |
| P0-3 | **Login/MFA rate limiting is per-instance memory.** `src/lib/rateLimit.ts` keeps buckets in a `Map`. On Vercel each serverless instance has its own map, so brute-force limits on login, MFA codes and registration are not reliably enforced. | PARTIAL | `const buckets = new Map()`; `REDIS_URL` is documented as the upgrade but never used. | Postgres-backed sliding-window limiter behind the same function signature (atomic upsert per key, TTL cleanup), so it works across instances with no new provider. Redis stays an optional later swap. |

---

## 2. Area-by-area status

### Accounting core

| Capability | Status | Notes | Priority |
|---|---|---|---|
| Double-entry posting engine, debit = credit, single write path (`ledger.ts`) | EXISTS | Balanced-by-construction builders, gapless numbering, audited, unit + DB tested. | — |
| Posted entries immutable, corrections by reversal | EXISTS | `reverseJournalEntry()` only; no update/delete paths. | — |
| Chart of accounts CRUD | EXISTS | Create/edit/delete guarded by usage. | — |
| Manual journals with cost centres | EXISTS | | — |
| Trial balance, GL, P&L | EXISTS | Live from posted lines. | — |
| Balance sheet | **BROKEN** | See P0-1. | **P0** |
| Accounting periods: lock / close | MISSING | `PeriodStatus.LOCKED` is enforced by the ledger, but nothing can set it; periods auto-create as OPEN. A filed VAT quarter can still be posted into. | **P1** |
| Year-end close / retained earnings roll | MISSING | Resolved for reporting by P0-1's computed lines; formal closing entries optional later. | P2 |
| Opening balances (go-live migration) | PARTIAL | Bank accounts take an opening balance; no general opening-balance journal wizard for AR/AP/fixed assets. | P2 |
| Ledger integrity checks page | EXISTS | `/accounting/integrity`. Should also flag P0-2 entries. | (in P0-2) |
| Fixed assets & depreciation | MISSING | | P3 |
| Accruals / prepayments schedules | MISSING | | P3 |

### Sales (AR)

| Capability | Status | Notes | Priority |
|---|---|---|---|
| Customers CRUD, activate/deactivate | EXISTS | | — |
| Invoices: draft, edit, post, record payment, print/PDF | EXISTS | Per-line tax, server-computed totals. | — |
| Void / credit a posted invoice | MISSING | `InvoiceStatus.VOID` exists with no writer; the only correction is a hand-made reversing journal, which leaves the invoice's status and AR aging wrong. | **P1** |
| Credit notes (partial) | MISSING | | P1 (with void) |
| Quotes / estimates → invoice | MISSING | | P2 |
| Sales orders | MISSING | | P3 |
| Recurring invoices | MISSING | | P2 |
| Email invoice to customer | MISSING | Resend adapter already exists (used for auth emails); invoices are not sent from the app. | P2 |
| Payment reminders / dunning | MISSING | | P2 |
| Online payment links (Stripe Connect) | EXISTS | `/pay/[token]`, webhook-confirmed. | — |
| Customer statements | MISSING | | P2 |
| AR aging | EXISTS | | — |

### Purchases (AP) and expenses

| Capability | Status | Notes | Priority |
|---|---|---|---|
| Suppliers CRUD | EXISTS | | — |
| Bills: draft, approve & post, pay | EXISTS | | — |
| Void / debit-note a posted bill | MISSING | Same gap as invoices. | **P1** |
| Purchase orders | MISSING | | P3 |
| Recurring bills | MISSING | | P2 |
| Expenses: submit as draft, approve & post, reverse | EXISTS | | — |
| Expense approval rules by amount/role | EXISTS | (#69) | — |
| Bill approval rules by amount | PARTIAL | Bills use a flat `bills:APPROVE` check; the rules engine from #69 only covers expenses. | P2 |
| Receipt/source file retained with the expense | PARTIAL | Extraction works but the file isn't stored (no object storage). UAE VAT record-keeping expects source tax invoices to be retained. | P1 — **needs provider decision** |
| AP aging | EXISTS | | — |

### Banking

| Capability | Status | Notes | Priority |
|---|---|---|---|
| Bank accounts, manual transactions | EXISTS | | — |
| Match to posted entry, unmatch, reconcile | EXISTS | Exact-amount matching; reconcile requires `banking:APPROVE`. | — |
| Bank statement import (CSV/OFX) into bank lines | MISSING | The import wizard posts ledger transactions/invoices/bills, not statement lines for reconciliation. | P2 |
| Suggested matches / rules | MISSING | | P2 |
| Live bank feeds | MISSING | **Needs an aggregator provider and account** (region-dependent). | P3 — blocked |
| Transfers between bank accounts | PARTIAL | Possible via manual journal only. | P3 |

### Tax (VAT)

| Capability | Status | Notes | Priority |
|---|---|---|---|
| UAE VAT tax codes (standard / zero / exempt) | EXISTS | Seeded at onboarding. | — |
| VAT return report from the ledger | EXISTS | | — |
| Lock a filed VAT period | MISSING | Covered by period locking (P1). | P1 |
| Tax code management UI | PARTIAL | Seeded pack; no add/edit screen for other rates/jurisdictions. | P2 |
| E-invoicing submission | PARTIAL | Simulated adapter only (`live: false`), yet sold on Growth+. **Needs an accredited provider decision.** | P1 — **needs decision** (see §4) |
| FTA e-filing | MISSING | External; out of scope until a provider/API is chosen. | P3 — blocked |

### Inventory, projects, budgets

| Capability | Status | Notes | Priority |
|---|---|---|---|
| Items / products catalogue on invoice & bill lines | MISSING | Lines are free text. | P2 |
| Inventory quantities, costing (FIFO/average), COGS | MISSING | Large build; depends on items. | P3 |
| Projects with budget vs actual | EXISTS | Revenue/cost from invoices and bills. | — |
| Project cost from expenses / journals | PARTIAL | Documented gap: only invoices/bills carry `projectId`. | P2 |
| Time tracking / billable hours | MISSING | | P3 |
| Cost centres + spend report | EXISTS | | — |
| Company-wide budgets | MISSING | | P3 |

### Reports and exports

| Capability | Status | Notes | Priority |
|---|---|---|---|
| TB, GL, P&L, BS, AR/AP aging, VAT, cost-centre spend | EXISTS | BS fixed by P0-1. | — |
| Cash-flow **statement** (actual, from the ledger) | MISSING | `/reports/cash-flow` is the forecast, not a statement. | P2 |
| Comparative periods (vs prior period / year) | PARTIAL | P&L series exists; not exposed as comparative columns on all reports. | P2 |
| CSV export, print / PDF | EXISTS | Browser print-to-PDF. | — |
| Scheduled / emailed reports | MISSING | | P3 |

### Users, security, multi-company, audit

| Capability | Status | Notes | Priority |
|---|---|---|---|
| RBAC matrix, server-side `can()`/`requirePermission()`, per-user overrides | EXISTS | | — |
| Page-level VIEW gates, sidebar by permission | EXISTS | (#66, #67, #70) | — |
| Custom roles | MISSING | Six fixed roles + overrides. | P3 |
| Invitations, seats enforced, last-admin guard | EXISTS | | — |
| Tenant isolation via `requireTenantContext()` | EXISTS | Spot-checked every id-only query: each follows a company-scoped lookup. | — |
| Automated cross-tenant regression tests | MISSING | Isolation is correct today but has no DB-level test suite guarding it. | **P1** |
| MFA (TOTP + backup codes), required for Admin/CFO with grace | EXISTS | (#71) | — |
| Rate limiting | PARTIAL | See P0-3. | **P0** |
| CSP with per-request nonce, security headers | EXISTS | (#68) | — |
| Audit trail (append-only) + viewer | EXISTS | | — |
| Multi-company membership & switching | EXISTS | Cookie-selected active company, re-validated server-side. | — |
| Consolidated multi-company reports | MISSING | Sold on AI-CFO plan. | P2 |
| Member-file downloads open to all members | (open question) | Standing account-owner decision; unchanged. | — |

### Multi-currency

| Capability | Status | Notes | Priority |
|---|---|---|---|
| Company base currency used everywhere | EXISTS | (#64) | — |
| Foreign-currency documents | **BROKEN** | See P0-2. | **P0** (guard) |
| FX rates, converted posting, realised/unrealised gain/loss, revaluation | MISSING | Proper build after the guard. Needs a rates source decision (free daily source vs paid). | P2 |

### Imports, integrations, platform

| Capability | Status | Notes | Priority |
|---|---|---|---|
| Import wizard (CSV/Excel → transactions, invoices, bills) | EXISTS | Preview, dedupe keys, account matching. | — |
| Dead duplicate import module (`lib/import/import-server.ts`) | — | Leftover from a removed admin route. | P4 |
| Data export / full backup | PARTIAL | Per-report CSV only; no whole-company export. | P2 |
| Public REST API + API keys | MISSING | "API access" is sold on Professional+ but no API or key model exists. | P1 — **needs decision** (§4) |
| Outbound webhooks | MISSING | | P3 |
| Stripe subscriptions + customer portal | EXISTS | | — |
| Customer portal (view/pay invoices, statements) | PARTIAL | Only the single-invoice pay page. | P3 |
| Inbound email → documents | PARTIAL | Shared-secret webhook, not provider HMAC. **Needs provider choice.** | P2 — blocked |
| WhatsApp | PARTIAL | Simulated adapter + verified webhook handshake. **Needs Meta account/token.** | P3 — blocked |
| Outbound email (Resend) | PARTIAL | Auth emails only; invites/invoices/reminders not sent. | P2 |
| Object storage for documents | MISSING | **Needs provider + bucket.** | P1 — blocked |
| PWA (manifest + service worker) | EXISTS | Installable; no offline data. | P4 |
| Pagination on large lists | PARTIAL | Some lists capped rather than paginated. | P2 |

### Automation and workflows

| Capability | Status | Notes | Priority |
|---|---|---|---|
| Approval rules (expenses) | EXISTS | | — |
| Recurring transactions | MISSING | Enum value only. | P2 |
| Bank categorisation rules | MISSING | | P2 |
| Scheduled jobs (reminders, recurring, reports) | MISSING | Needs a scheduler (Vercel Cron is available on the current host). | P2 |

### AI and intelligence

| Capability | Status | Notes | Priority |
|---|---|---|---|
| AI Copilot (data-grounded answers, templated fallback without a key) | EXISTS | Numbers always come from report functions, never the model. | — |
| Document OCR / extraction → draft expense | EXISTS* | *Only live when `ANTHROPIC_API_KEY` is set in production — please confirm. | — |
| Customer-intelligence extraction from documents | EXISTS* | Same dependency. | — |
| Anomaly + duplicate detection (deterministic, explainable) | EXISTS | | — |
| 30/60/90 cash forecast + payment behaviour | EXISTS | "Everyone pays on time" model plus observed lateness. | — |
| Forecast using observed payment behaviour | PARTIAL | Behaviour is computed but not fed into the forecast. | P3 |
| What-If scenarios on real data | MISSING | Marketing demo only (labelled). | P3 |
| AI bank-transaction categorisation | MISSING | | P3 |
| Voice commands | PARTIAL | Typed-text commands work; no speech-to-text provider. Sold on Professional+. | P2 — **needs decision** |
| AI CFO briefings / proactive insights | PARTIAL | Dashboard to-dos + copilot; no scheduled briefing. | P3 |
| Customer Concierge | MISSING | Labelled "Coming soon" on the homepage (#72). | P3 — blocked on channels |

---

## 3. Build order (one focused PR per line, P0 first)

Items touching the same files are sequenced; everything else can be in flight in parallel.

1. **P0-1** Balance sheet: retained + current-year earnings.
2. **P0-2** Reject non-base currency on every posting path, plus an integrity check for existing rows.
3. **P0-3** Postgres-backed rate limiter.
4. **P1** Period close / lock (lock a month or quarter; unlock is an audited Admin/CFO action; ledger already enforces LOCKED).
5. **P1** Void a posted invoice / bill via reversal (status VOID, aging and project figures follow); credit notes build on this.
6. **P1** Cross-tenant isolation integration tests against real Postgres (every API route family).
7. **P1** Plan-feature honesty: plan cards and `/pricing` stop listing features that don't work yet (API access, live e-invoicing, voice) **or** those features get built. **Your call** (§4).
8. **P2** in this order unless you reorder: email invoices + reminders (Resend) · bank statement import + suggested matches · recurring invoices/bills (Vercel Cron) · quotes → invoice · items catalogue · tax code management · cash-flow statement + comparatives · bill approval rules · opening-balance wizard · full data export · real multi-currency (after P0-2) · consolidated reports · pagination.
9. **P3/P4** after the above, re-prioritised with you.

---

## 4. What I need from you (these items stop; everything else continues)

| Item | What's needed |
|---|---|
| Document storage (receipts, source invoices) | Pick object storage (e.g. Vercel Blob, S3, Cloudflare R2) and provide the bucket + credentials as env vars. |
| Plan features sold but not built (API access, e-invoicing, voice) | Decide per feature: remove from plan cards/pricing now, or keep and I build it (API: yes, buildable without a provider; e-invoicing: needs an accredited provider; voice: needs a speech-to-text provider). |
| E-invoicing | Which accredited e-invoicing / Peppol service provider to integrate with, and an account. |
| Inbound email | Which inbound email provider (Postmark / Mailgun / SES / Resend inbound) so the webhook can verify its HMAC signature. |
| WhatsApp | Meta WhatsApp Business account, phone number ID and access token. |
| Live bank feeds | Which aggregator (region-dependent) and an account. |
| FX rates for multi-currency | OK to use a free daily rates source (as `/pricing` already does), or a paid provider? |
| Confirm production config | Whether `ANTHROPIC_API_KEY` and `RESEND_API_KEY` are set in production (they gate OCR/copilot phrasing and outbound email). |
| Member-file downloads | Standing question: keep open to all members, or restrict? |
