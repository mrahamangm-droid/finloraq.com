# Finloraq platform audit and upgrade — 29 Sep 2026

Engineering audit of the platform itself (security, tenancy, API, reliability,
performance, accessibility, deployability). The product-capability audit
(what accounting features exist) is separate and still current:
[`docs/PLATFORM_AUDIT.md`](docs/PLATFORM_AUDIT.md).

**Status key:** EXISTS = works end to end · PARTIAL = works with a material gap ·
MISSING = not implemented · BROKEN = present but wrong or unsafe · N/A = doesn't
apply to this codebase.

---

## 0. Scope: the brief described a different codebase

The request was written for a "Softqora" platform: Supabase with RLS migrations,
a tool registry (`lib/tools/registry.ts`, 500+ tools), `/app/[org]/*` routes,
a custom-software intake form, and pdfjs/pdf-lib/qrcode/jsbarcode. **None of
that exists in this repository.** This repo is **Finloraq**: Next.js 16 (App
Router) + Prisma/PostgreSQL + NextAuth v4 + Stripe, with multi-tenancy by
`companyId`.

Several stated premises were also already untrue here: `src/middleware.ts`
exists, as do `src/app/error.tsx`, `global-error.tsx` and `not-found.tsx`.

So I audited what's actually here and mapped each of your suspects onto its real
equivalent (§3). Nothing was rebuilt, and no Softqora-shaped feature was
invented. Routes, data model, branding and architecture are unchanged.

**Branch:** this session is configured to push only to
`claude/audit-platform-upgrade-ystw9r`, so the work is there rather than on
`audit/platform-upgrade`. Nothing was pushed to `main` and nothing was deployed.

---

## 1. Baseline (before any change, on `5505ff2`)

| Check | Result |
|---|---|
| `npm ci` | OK, 526 packages, 0 vulnerabilities |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 0 warnings |
| `npm test` | 312 passed, 6 skipped (the real-Postgres suite skips without a DB) |
| `npm test` with Postgres 16 (`RUN_DB_TESTS=1`) | 318 / 318 passed |
| `npm run build` | OK. Warnings: `middleware` file convention deprecated (use `proxy`); Edge Runtime deprecated; edge runtime on `/opengraph-image` disables its static generation. The build also rewrites `tsconfig.json` (adds `.next/dev/types`), which is a build side effect, not committed. |

**Bundle size (first-load JS per route, gzip; from `.next/diagnostics/route-bundle-stats.json`).**
106 routes, all between 138.6 and 190.5 KB. No route pulls in a heavy library:
there is no pdfjs, pdf-lib, qrcode or jsbarcode, and xlsx parsing is an in-house
server-side module. The size is almost entirely the shared framework chunk.

| Route | Before | After |
|---|---|---|
| `/` | 144.9 | 145.9 |
| `/pricing` | 145.3 | 146.3 |
| `/login` | 150.1 | 151.1 |
| `/dashboard` | 188.9 | 190.0 |
| `/sales/new` | 189.8 | 190.9 |
| `/import` (largest) | 190.5 | 191.6 |
| `/crm/leads` | 186.7 | 187.8 |
| `/settings` | 190.3 | 191.5 |
| `/pay/[token]` (smallest) | 138.6 | 139.6 |

The ~1.1 KB added everywhere is the lazy Sentry loader stub. The SDK itself is a
separate chunk that downloads only when `NEXT_PUBLIC_SENTRY_DSN` is set.

---

## 2. Status by area (before → after)

| Area | Before | After | Evidence / notes |
|---|---|---|---|
| **Tool registry & 500+ tool scalability** | N/A | N/A | No tool registry; Finloraq is a single finance app. The nearest equivalents (the nav list `src/components/nav/nav-items.ts` and the sitemap source `src/components/marketing/marketing-routes.ts`) are data-driven already. |
| **Auth** | EXISTS | EXISTS | NextAuth credentials + optional Google; TOTP MFA required for Admin/CFO with grace (`src/lib/mfaRequirement.ts`); Postgres-backed rate limits on login/MFA/register/reset (`src/lib/rateLimit.ts:109`). |
| **Route protection (middleware)** | PARTIAL | EXISTS | 9 of 27 app sections (`approvals, credit-notes, crm, inventory, products, purchase-orders, quotes, recurring-invoices, sales-orders`) were missing from the matcher and the CSP split. The layout's server-side `redirect("/login")` (`src/app/(app)/layout.tsx:22`) still protected them, so nothing was exposed, but they skipped the edge gate and got the weaker static CSP. Fixed; `src/lib/appRouteProtection.test.ts` now fails if a new section is missed. |
| **Org / multi-tenancy** | BROKEN (CRM) | EXISTS | Membership is resolved server-side from the session (`src/lib/tenant.ts:18`); the active-company cookie is only a hint, re-checked against memberships (`:34`). **But the CRM module wrote body foreign keys unchecked.** Company A could attach company B's assignee, customer, contact, lead, deal or stage, then read B's names and emails back through A's lists. Reproduced: 16 cross-tenant writes accepted. Fixed in `src/lib/crm.ts:20` via `src/lib/tenantRefs.ts`. |
| **DB & row-level security** | PARTIAL | PARTIAL | No Supabase, so no RLS policies. Isolation is application-level (every query scoped by `companyId`, body references checked by `foreignReferenceProblem`), guarded by two real-Postgres suites (`tenantIsolation`, now `crmTenantIsolation`). Postgres RLS as defence-in-depth is a design decision, not a bug; see §5. |
| **API structure & validation** | PARTIAL | EXISTS | 105 route handlers, zod on bodies throughout. Gaps fixed: `ForbiddenError` escaped as a **500** on 9 routes plus all CRM routes; malformed JSON → 500 on CRM; unbounded `?limit=`, NaN/negative `?page=` and unknown `?status=` → Prisma 500; deal `value` overflow → 500. Shared mapping: `withApiErrors`/`pageParams` in `src/lib/apiHandler.ts:28,49`. |
| **Security headers / CSP** | EXISTS | EXISTS | HSTS, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy (`next.config.mjs:61-68`); per-request nonce CSP with `strict-dynamic` for the app (`src/lib/csp.ts`). Now applied to all 27 sections. |
| **Webhooks** | EXISTS | EXISTS | Stripe and Stripe Connect verify the signature over the **raw** body (`req.text()` then `verifyStripeSignature`, `src/app/api/webhooks/stripe/route.ts:39-41`) and answer 501 when unconfigured. Inbound email uses a shared secret with per-IP limiting. WhatsApp POST is an explicit no-op stub (see §5 for the GET handshake). |
| **Rate limiting / spam** | PARTIAL | EXISTS | Auth endpoints were limited; **AI endpoints weren't** (only a monthly per-company cap). Added per-user and per-IP burst limits (`src/lib/ai/limits.ts:13`). No public lead/intake form exists, so there's nothing for Turnstile or a honeypot to protect; registration is rate-limited and email-verified. |
| **File handling** | PARTIAL | PARTIAL | Member files capped at 5 MB, stored as data URLs in Postgres (`src/lib/memberFiles.ts:21`). AI-extracted documents are **not stored** (`storageKey: unstored:…`, `src/lib/ai/extraction.ts:93`) because no object storage is chosen. AI uploads now capped at ~4.5 MB with a 413. Object storage is still a provider decision (see `docs/PLATFORM_AUDIT.md` §4). |
| **Caching** | EXISTS | EXISTS | Per-request `cache()` for tenant context; no stale-data caching of financial data by design. `public/sw.js` only intercepts navigations for an offline page (`:45`) and never caches API, auth or HTML responses. `sw.js` is served `no-cache`. Redis isn't used (the unused `ioredis`/`bullmq` deps were removed). |
| **Performance** | EXISTS | EXISTS | See §1. No heavy client libraries; `next/image` isn't needed for the only `<img>` uses (user-uploaded logos and avatars as data URLs). Added an app-shell `loading.tsx` so navigation shows feedback immediately. |
| **Error pages & monitoring** | PARTIAL | EXISTS | `error.tsx`, `global-error.tsx`, `not-found.tsx` existed; `loading.tsx` didn't. Monitoring was console + optional Slack webhook. Added env-gated Sentry (`src/instrumentation.ts:11,31`, `src/instrumentation-client.ts`) with request data collection off, verified against a local envelope sink. |
| **Env validation** | MISSING | EXISTS | `src/lib/env.ts:18`: production refuses to start without `DATABASE_URL` / `NEXTAUTH_SECRET` (verified with `next start`); warnings for half-configured integrations and live-key/test-key mismatches. Values are never logged. |
| **Mobile UX** | EXISTS | EXISTS | No horizontal overflow at 390 px on 12 audited pages; no WCAG 2.2 target-size violations. |
| **Accessibility** | PARTIAL | EXISTS | axe-core (WCAG 2 A/AA): **30 critical/serious → 2**. Fixed unlabelled inputs (register, company settings, branding, expense quick-add), `<main>` on auth pages, and `--muted-foreground` contrast (4.4 → 4.75:1). The remaining 2 only fire on empty tables (§5). |
| **SEO / schema** | EXISTS | EXISTS | `sitemap.ts` and `robots.ts` are generated from one list (`marketing-routes.ts`), so they can't drift; structured data on marketing pages; the app and portal are `noindex` (`src/app/layout.tsx:36`). |
| **Analytics** | MISSING | MISSING | No product or web analytics at all. Not added: it needs a provider choice and a privacy/consent decision (§6). |
| **Billing** | EXISTS | EXISTS | Checkout and portal are already org-aware (`active.companyId`, `src/app/api/billing/change-plan/route.ts:52-53`) and require `settings:EDIT`; Stripe mode follows the key (test vs live); an unconfigured Stripe answers 501. Added a "Billing & plan" tab in Settings. |
| **AI layer** | PARTIAL | EXISTS | Numbers come from report functions, never the model; `maxTokens` capped per call; monthly plan cap (`src/lib/billing/usage.ts:60`). Added burst limits, upload caps, 402 on cap (was 500), and 502 for provider errors (the provider's response body was being shown to users). |
| **Custom-software lead flow** | N/A | N/A | No public intake exists. Internal CRM leads do (and are now tenant-safe). Building a public intake + Resend notification is a new feature needing product input (§6). |
| **CI** | EXISTS | EXISTS | `.github/workflows/ci.yml:51-63` runs lint, typecheck, migrations, tests against Postgres 16, and build on every PR to `main`. The new integration suites run there automatically (`CI` is set). |
| **Vercel readiness** | PARTIAL | EXISTS | Security headers, crons (`vercel.json`), canonical-host redirect that spares webhooks. Added startup env validation. The `middleware` → `proxy` rename is outstanding (§5). |
| **Dead code / deps** | PARTIAL | EXISTS | Removed `src/lib/import/import-server.ts` (a duplicate of `server.ts`, zero importers) and `bullmq`, `ioredis`, `pino` (zero imports; 45 packages). |

---

## 3. Your ten "known suspects": verdicts

| # | Suspect | Verdict |
|---|---|---|
| 1 | No middleware; `/dashboard`, `/app/[org]/*` unprotected; `[org]` accepts any string; RLS | Middleware **exists**. There is no `[org]` segment: the tenant comes from the session, never the URL. Real gaps found and fixed: 9 app sections missing from the matcher/CSP, and CRM cross-tenant references. No RLS (not Supabase); app-level isolation, now with tests for CRM too. |
| 2 | Route validation, auth, rate limiting, spam, safe errors; Stripe raw-body signature | zod everywhere; auth via middleware + `requireTenantContext` + RBAC. Fixed 500s on permission errors, malformed JSON and bad pagination, plus leaked provider errors. Stripe **does** verify over the raw body. Spam protection: no public form to protect (see #8). |
| 3 | No error/global-error/not-found/loading, no monitoring | First three **existed**; added `loading.tsx` and env-gated Sentry. |
| 4 | Tool registry, `generateStaticParams`, sitemap coverage, 500+ tools | N/A (no registry). The sitemap covers every public route from one source list. |
| 5 | Dynamic-import pdfjs/pdf-lib/qrcode/jsbarcode; next/image; `sw.js` safety | None of those libraries are present; no route is heavy. `sw.js` is safe: navigations only, never API or auth. |
| 6 | Billing hardcoded to a demo org; portal link from settings; test mode | **Not hardcoded**: checkout and portal use the signed-in company. Added the Settings link. Mode follows the Stripe key; env validation now warns on a live key outside production. |
| 7 | AI per-user/per-IP limits, input caps, cost controls | Only a monthly company cap existed. Added 20/min per user + 60/min per IP (chat) and 10 + 30 (extraction), a ~4.5 MB upload cap and a 2000-char question cap (already present). |
| 8 | Custom intake → Supabase + Resend + spam protection | N/A: no such form. Not built without a product decision (§6). |
| 9 | CI runs typecheck/lint/build; env validation; security headers; sitemap/robots | CI **already** runs all of them plus tests against Postgres. Headers, sitemap and robots were already correct. Env validation added. |
| 10 | Accessibility/mobile pass | Done with axe-core on an iPhone 13 viewport: 30 → 2 serious/critical, no overflow, no target-size issues. |

---

## 4. Changes (one commit each, highest risk first)

Each commit passed `typecheck`, `lint`, the full test suite with Postgres, and
`next build`; the UI-facing ones were also checked in Chromium against
`next start`.

1. **`abfcf45` Fix cross-tenant references in CRM.** Validates every body FK (`assignedToId`, `customerId`, `contactId`, `leadId`, `dealId`, `stageId`) against the company. Adds `withApiErrors` / `pageParams` / `enumParam` (`src/lib/apiHandler.ts`) and applies them to all CRM routes.
2. **`b22bf4d` Put the nine newer app sections behind the auth gate and nonce CSP**, plus a parity test.
3. **`8eb5c80` AI burst limits, upload caps, error mapping.** `src/lib/ai/limits.ts`; adds `AiProviderError` in `provider.ts`.
4. **`7352a71` Env-gated Sentry + fail-fast env validation.** `@sentry/nextjs` 11.1.0 (lockfile: +88 packages, no existing version changed); `src/lib/sentryConfig.ts` disables cookie, header, body, query, DB-data and local-variable collection; CSP `connect-src` gains the DSN origin only when set.
5. **`8dfcbfb` Reject deal values that overflow `Decimal(18, 4)`** (found while verifying Sentry).
6. **`e57d607` 403 instead of 500 on 9 more routes** (products, billing change-plan/portal, bill approve, invoice post/payment-link/e-invoice, voice confirm). Only the exports change; the ledger calls behind them are untouched.
7. **`d7aa08f` Accessibility pass** (labels, landmarks, contrast).
8. **`fecfc45` App-shell loading skeleton.**
9. **`9a49409` Remove the dead duplicate import module and unused deps.**
10. **`4950b16` Link Billing & plan from Settings.**

**Tests added:** 6 new files plus additions to `csp.test.ts`, +34 tests (318 → 352), all passing.
- `crmTenantIsolation.integration.test.ts`: real Postgres; fails with 16 accepted cross-tenant writes on the old code.
- `apiRoleErrors.integration.test.ts`: calls **every** session route (found by glob) as STAFF and AUDITOR; fails on any 5xx; listed exactly the 18 leaking cases on the old code.
- `appRouteProtection.test.ts`: middleware and CSP coverage of every app section, and the webhook/cron/public exclusions; listed exactly the 9 missing sections on the old config.
- `apiHandler.test.ts`, `ai/limits.test.ts`, `env.test.ts` (unit).

**Invariants respected:** no new ledger write path (one unused caller removed);
tenant resolution still only via `src/lib/tenant.ts`; RBAC still server-side;
unconfigured integrations still answer 501/503 explicitly; no secrets committed.

---

## 5. Remaining risks (not fixed here, by priority)

1. **No database-level tenant isolation.** A future query that forgets `companyId` leaks across tenants; the only safety nets are code review and the two isolation suites. Options: Postgres RLS keyed on a per-transaction `app.company_id` setting, or a Prisma client extension that injects `companyId`. Either is a cross-cutting change to discuss first, not a drive-by.
2. **Error mapping is per-route, not global.** The probe covers empty-body calls for low-privilege roles. A route that throws `ForbiddenError` only after a valid body parses could still 500. New routes should use `withApiErrors`.
3. **`middleware.ts` → `proxy.ts` (Next 16 deprecation).** Still works; migrating moves the auth gate from the Edge to the Node runtime. Worth its own PR, with the CSP nonce and `withAuth` behaviour re-verified.
4. **WhatsApp verify token reuses `WHATSAPP_ACCESS_TOKEN`** (`src/app/api/webhooks/whatsapp/route.ts:29`), which would put the access token into the Meta dashboard and GET query strings. Before WhatsApp goes live, add a separate `WHATSAPP_VERIFY_TOKEN` and verify `X-Hub-Signature-256` on POST.
5. **Uploaded source documents aren't retained** (no object storage). UAE VAT record-keeping expects source tax invoices to be kept.
6. **CRM data-quality gaps (not security):** `convertLead` creates the deal in hard-coded `USD` rather than the company's base currency (`src/lib/crm.ts:212`); `POST /api/crm/deals` with a `pipelineId` but no `stageId` picks the *default* pipeline's first stage (now a clean 400 rather than a 500); CRM forms show a generic message for non-zod errors.
7. **`scrollable-region-focusable`** on the `/sales` and `/expenses` table wrappers when the table is empty.
8. **Stray root file `finloraq-push-p1-statements.bundle`** (115 KB git bundle from `80001fb`) isn't referenced anywhere. Likely safe to delete, but I left it for you to confirm.
9. **`FIELD_ENCRYPTION_KEY`** isn't documented in `.env.example`. Only `decrypt()` is ever called (it passes plaintext through without a key); `src/lib/userMfa.ts:26` writes TOTP secrets in plaintext. Encrypting them at rest is a small, separate change once the key is provisioned.
10. **Build rewrites `tsconfig.json`** (adds `.next/dev/types/**/*.ts`) on every `next build`. Committing that change once would stop the dirty-tree noise.

---

## 6. What you need to do

| Item | Action |
|---|---|
| **Review the PR** | Nothing is merged or deployed. CI runs the new integration suites automatically. |
| **Sentry** (optional) | Create a project, then set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel (Production + Preview) and **redeploy**, since the public DSN is inlined at build time. Optional `SENTRY_TRACES_SAMPLE_RATE` (default 0 = errors only). Source-map upload (`withSentryConfig` + `SENTRY_AUTH_TOKEN`) is deliberately not wired; stack traces will be minified until you want it. |
| **Env validation** | After deploying, check the Vercel runtime logs for `[env]` lines: they name any half-configured integration. A production deploy without `DATABASE_URL` or `NEXTAUTH_SECRET` now fails at startup instead of on first use. |
| **Stripe live mode** | When ready: swap `STRIPE_SECRET_KEY` to `sk_live_…`, create a live webhook endpoint for `/api/webhooks/stripe` (and `/api/webhooks/stripe-connect` if Connect is used), set the matching `whsec_…` secrets, and set `STRIPE_AUTOMATIC_TAX=true` only after adding the UAE VAT registration in Stripe (see `DEPLOYMENT.md` §3b). Startup logs warn if a live key appears outside production, or a test key in production. |
| **Resend** | Confirm `RESEND_API_KEY` and `EMAIL_FROM` (on a verified domain) are set in production; without `EMAIL_FROM`, mail comes from Resend's shared sender. |
| **CRON_SECRET** | Must be set in production or `/api/cron/*` answers 501 (recurring invoices and reminders won't run). Startup logs now say so. |
| **Supabase / RLS** | Not applicable as written (the DB is Postgres via Prisma). Decide whether you want DB-level isolation (§5.1). |
| **Turnstile** | Not needed today (no public intake form). If you add one, or see bot sign-ups, Turnstile on `/register` is the natural first place. |
| **Decisions** | (a) Analytics provider and consent approach, if any; (b) whether to build a public "custom software" intake; (c) delete the stray `.bundle` file?; (d) object storage provider (still open from `docs/PLATFORM_AUDIT.md` §4). |

---

## 7. How this was verified

- Local Postgres 16 with all 31 migrations applied; `RUN_DB_TESTS=1 npm test` → 352 / 352.
- `next build` + `next start`, then Chromium (Playwright) signed in as the seeded demo admin:
  - all 12 newly covered sections redirect anonymous users to `/login`;
  - signed in, each serves the nonce CSP with zero CSP violations or page errors;
  - CRM lead creation works through the real UI form.
- Sentry: pointed `SENTRY_DSN` at a local HTTP sink, forced a real server 500. The envelope arrived containing only method + URL (no cookies, headers or body), while the client got a bare 500.
- Env validation: `next start` without `NEXTAUTH_SECRET` refuses to boot and names the variable.
- axe-core 4 (WCAG 2 A/AA + best practice, and 2.2 AA) on an iPhone 13 viewport, before and after.
