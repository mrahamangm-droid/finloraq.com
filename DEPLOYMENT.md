# Deploying Finloraq

This is the concrete, do-this-in-order runbook. It assumes the Vercel + Postgres
architecture called for in the spec. Everything in `README.md`'s "Production checklist"
still applies — this document is the step-by-step version of it, with exact commands and
the reasoning behind each one, and it reflects real issues already hit and fixed against
actual Vercel builds (see `git log` — Suspense boundary, NextAuth adapter typing,
`noUncheckedIndexedAccess`, Prisma generate caching) plus gaps closed in two later passes:
no committed lockfile (non-reproducible installs), no `.eslintrc` (so `npm run lint` — and
CI — couldn't actually run), and a `directUrl` schema addition that was reverted after it
broke every live deploy — see the callout in step 1 before you add it back.

## 0a. Two production-only bugs found and fixed by actually using the deployed app

A green build and a loading `/login` page are not the same claim as "a person can register and
use this app," and they turned out to hide two bugs that only show up once real requests hit
the deployed functions:

1. **Every register/login 500'd**: `argon2` (native binary) had no prebuilt binding for the
   Node ABI Vercel's serverless functions actually ran (`Error: No native build was found for
   platform=linux arch=x64 ... abi=137`). Changing the project's Node.js Version setting in
   Vercel and redeploying did **not** change the runtime ABI on this account/plan — so this
   isn't a "pick an older Node" problem, it's a "don't depend on a native addon in a serverless
   target" problem. Fixed by switching `src/lib/password.ts` to `hash-wasm`'s Argon2id
   (WebAssembly, zero native deps, same OWASP-recommended algorithm and tuning) — see that
   file's comment and the commit that removed the `argon2` dependency.
2. **Every sign-in 500'd, separately, even after (1) was fixed**: `src/lib/auth.ts` had
   `session: { strategy: "database" }` with NextAuth v4's `CredentialsProvider`. NextAuth v4
   hard-refuses that combination (`CALLBACK_CREDENTIALS_JWT_ERROR` /
   `UnsupportedStrategyError`) — Credentials sign-in only works with JWT sessions. This means
   **login had never worked in this app's production deployment**, independent of the argon2
   bug; registering an account was never sufficient proof the app was usable. Fixed by
   switching to `strategy: "jwt"` and adding an `isActive` recheck in the `jwt` callback so a
   deactivated user still gets locked out immediately instead of only at token expiry (the
   property the original database-session choice was trying to buy).

Both were only caught by actually registering a test account and signing in against the live
Vercel deployment, not by reading logs after the fact — do that (or trust CI's future E2E
coverage, which doesn't exist yet) before calling a deploy "done." After both fixes, the full
register → onboard company → create customer → raise invoice → post it → record payment →
Trial Balance/P&L flow was verified end-to-end against production and balances correctly.

## 0. Why nothing could be verified end-to-end before now

The repo was originally built in a sandboxed environment whose network policy blocked
the npm registry and `binaries.prisma.sh` (the Prisma engine downloads), so `npm install`,
`prisma generate`, `npm run build`, and the four DB-backed test suites (`ledger`, `rbac`,
`reports`, `ai/extraction`) never actually ran there — only the 28 pure-logic unit tests
that don't touch Prisma did. That is the honest state the README describes.

This pass ran from an environment with real npm registry access and confirmed:
`npm install` succeeds, all 28 pure tests pass, and — the two real gaps found —
`npm run lint` was failing outright (no ESLint config existed despite the script and
`eslint-config-next` being present) and there was no `package-lock.json` in git. Both are
fixed here. `prisma generate` and the 4 DB-backed suites are still blocked by this specific
sandbox's egress policy (`binaries.prisma.sh` is denied) — that's unrelated to the app and
will not happen on Vercel or in GitHub Actions, both of which have open registry access.
The CI workflow added at `.github/workflows/ci.yml` now runs `lint` → `typecheck` →
`prisma migrate deploy` → `test` → `build` against a real Postgres service container on
every push, so from the next push onward this is machine-verified, not just claimed.

## 1. Provision Postgres

This project is already running on **Prisma Postgres**, provisioned through the Vercel
Marketplace — that's where `DATABASE_URL`, `POSTGRES_URL`, and `PRISMA_DATABASE_URL` in
the Vercel project's env vars come from. `DATABASE_URL` alone is what both the app and
`prisma migrate deploy` use; nothing else to configure here. If you're setting this project
up fresh, add the same "Prisma Postgres" storage integration from the Vercel dashboard's
Storage tab and it wires `DATABASE_URL` up automatically.

**Do not add a `directUrl` to `prisma/schema.prisma` for this setup.** A prior pass here
did exactly that — reasonable-sounding general advice ("pooled connections need a separate
direct one for migrations") applied without checking it against this specific provider —
and it broke every deploy for about 30 minutes with `Error: P1013: The provided database
string is invalid. The scheme is not recognized`, because Prisma Postgres is
Accelerate-only and has no conventional `postgres://` direct connection string of the kind
`directUrl` expects. It was reverted; see the comment in `prisma/schema.prisma`.

If this project ever migrates to a classic pooled provider instead (Neon, Supabase, RDS
behind PgBouncer), *that's* when `directUrl` earns its place:

- **Neon**: copy both connection strings it gives you — the **pooled** one (host ends
  `-pooler`) for `DATABASE_URL`, the **direct** one (no `-pooler`) for `DIRECT_URL`.
- **Supabase**: Project Settings → Database → Connection string. "Transaction" pooler for
  `DATABASE_URL`, "Session"/direct for `DIRECT_URL`.
- **Self-hosted / RDS with no pooler in front**: `DATABASE_URL` and `DIRECT_URL` are the
  same string.

Whichever provider, verify the actual env var names and connection-string shape against a
real deploy log before wiring up `directUrl` — as this incident showed, guessing the shape
from general Prisma-pooling advice is exactly what broke production here.

## 2. This repository is already on GitHub and already deploying

`main` already has the lockfile, `.eslintrc.json`, the CI workflow, and this file — pushed
directly via the GitHub web UI in a series of small commits (the sandbox this ran in
doesn't have git push access to this repo). Vercel is already connected and redeploys on
every push to `main`. Nothing to do here for a project already at this state; this section
is kept for standing up a *new* environment from scratch — see step 3.

## 3. Create the Vercel project

1. vercel.com → **Add New… → Project** → import `mrahamangm-droid/finloraq.com`.
2. Framework preset: Next.js (auto-detected). Build command and install command can stay
   default — `package.json`'s `build` script already runs `prisma migrate deploy && next
   build`, and `postinstall` already runs `prisma generate`.
3. **Before the first deploy**, go to Project Settings → Environment Variables and add,
   for **all three environments** (Production, Preview, Development) unless noted:

   | Variable | Value | Notes |
   |---|---|---|
   | `DATABASE_URL` | connection string from step 1 | required |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` | **generate a fresh one per environment** — don't reuse the same value in Preview and Production |
   | `NEXTAUTH_URL` | `https://app.finloraq.com` (Production) / the Vercel preview URL pattern (Preview) | must match the actual serving domain or auth callbacks break |
   | `ANTHROPIC_API_KEY` | your key | optional — AI Copilot/extraction/voice fall back to templated/disabled without it, they don't error |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | from Stripe — see section 3b | optional — billing UI works in simulated mode without them |
   | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | from Meta | optional — simulated without them |
   | `INBOUND_EMAIL_WEBHOOK_SECRET` | any strong random string | required only if you wire up inbound email; the webhook rejects all requests until this is set |
   | `REDIS_URL` | from Upstash/Redis Cloud etc. | optional for now — rate limiting works in-memory per-instance without it, but see the production checklist below |
   | `OBJECT_STORAGE_*` (4 vars) | from your S3-compatible provider | not yet wired to actual uploads (README's documented Phase 6 gap) — leave blank until that's built |

4. Deploy. The build log is where `prisma migrate deploy` runs against your real
   database for the first time — watch it for migration errors, not just a green
   checkmark on `next build`.

## 3b. Stripe billing (start in test mode)

The billing integration is real Stripe Checkout + Customer Portal + a signed webhook
(`src/lib/integrations/stripe.ts`, `src/app/api/webhooks/stripe/route.ts`). There is no
manual product setup: the first checkout for a plan creates its Stripe Product and monthly
Price from `src/lib/billing/plans.ts` (lookup key `finloraq_<plan>_monthly`). Re-running
these steps is safe — everything is idempotent.

1. Stripe Dashboard → switch **Test mode** on → Developers → API keys → copy the
   **Secret key** (`sk_test_…`).
2. Developers → Webhooks → **Add endpoint**:
   - URL: `https://<your-app-domain>/api/webhooks/stripe`
     (e.g. `https://finloraq-app.vercel.app/api/webhooks/stripe`)
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`,
     `invoice.payment_failed`
   - Copy the endpoint's **Signing secret** (`whsec_…`).
3. Customer portal: nothing to do. The app creates and maintains its own portal
   configuration via the API (invoices, card updates, cancel at period end, switching
   between Growth / Professional / AI-CFO), tagged `metadata.finloraq=1`.
4. Vercel → Project → Settings → Environment Variables (Production): set
   `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then **Redeploy**.
5. Verify: `POST /api/webhooks/stripe` without a signature now returns **400** (not 501);
   Billing page says "Stripe TEST mode"; upgrade to Growth with card `4242 4242 4242 4242`,
   any future expiry/CVC → you return to Billing with "Payment received" and plan = Growth;
   Stripe → Webhooks shows 200 deliveries; Audit Log shows `billing.stripe_synced`.
6. Currency and VAT: every paid plan is one Stripe Price in USD with an AED option
   (AED 179 / 549 / 1,099 vs US$49 / 149 / 299), both VAT-inclusive. Checkout shows AED to
   UAE buyers and USD to everyone else automatically, and collects the buyer's TRN.
   Once the selling entity has a UAE VAT registration (mandatory above AED 375,000 of
   taxable supplies a year, voluntary from AED 187,500): add it in Stripe → Tax →
   Registrations, set `STRIPE_AUTOMATIC_TAX=true` in Vercel and redeploy. Stripe then
   carves the 5% VAT out of the same totals and puts it on the invoices.
7. Going live later: repeat steps 1–4 with Live mode on (`sk_live_…`, a new live webhook
   endpoint and its own `whsec_…`). Test-mode customer ids are replaced automatically.

## 4. Point the domain

`finloraq.com` itself stays on WordPress/Hostinger per the README (the marketing site is
separate from this app). Add a CNAME (or Vercel's provided A/ALIAS record) for
`app.finloraq.com` pointing at Vercel, then add that domain in Project Settings →
Domains. Update `NEXTAUTH_URL` in Production to match exactly once the domain is live.

**Status as of 2026-09-22: not done yet — this is the one open item blocking the real
domain.** `app.finloraq.com` is already added in Vercel (Project Settings → Domains),
which is why it shows "Invalid Configuration" there rather than being absent — but a DNS
lookup confirms no record exists for it yet:

```
$ dig CNAME app.finloraq.com   →  NXDOMAIN (no answer, only an SOA in Authority)
$ dig NS finloraq.com          →  artemis.dns-parking.com, hermes.dns-parking.com
$ dig A finloraq.com           →  92.113.16.235, 92.113.23.159 (root domain resolves fine)
```

The root domain resolves and serves real content, so the zone itself is live — nobody has
added the `app` record yet, that's all. **Fix (needs the Hostinger account, which this
session has no credentials for):** in Hostinger's DNS zone editor for `finloraq.com`, add
exactly the record Vercel's Domains → `app.finloraq.com` → "View DNS configuration" panel
currently asks for:

| Type | Name | Value |
|---|---|---|
| CNAME | `app` | `998cc5aa12f5d29f.vercel-dns-017.com.` |

(Re-check that panel before entering it — Vercel sometimes rotates the target hostname.)
DNS propagation is usually minutes, occasionally longer. Once `app.finloraq.com` shows
"Valid Configuration" in Vercel, update `NEXTAUTH_URL` in Production to
`https://app.finloraq.com` and redeploy (NextAuth callback URLs must match the serving
domain exactly, or sign-in breaks the same way the bugs in section 0a did).

## 5. Seed (optional, non-production only)

```bash
DATABASE_URL="..." npx prisma db seed
```

Creates `demo@finloraq.com` / `DemoPassword123!` with a starter company. Don't run this
against a production database that will hold real customer data — it's a dev convenience,
not a fixture the app depends on.

## 6. Verify the deployed app, not just the build

A green Vercel build means `next build` succeeded — it does not mean the app works
end-to-end. Section 0a above is exactly why: two separate bugs made every register and
every login 500 in production despite consistently green builds. After deploy, actually
exercise:

1. Register a new account → company onboarding wizard completes (creates Company + COA +
   UAE VAT pack + open period + Starter subscription in one transaction). **Verified
   2026-09-22** against production after the section 0a fixes.
2. Create a customer, raise a draft invoice, post it, record a payment → check it shows
   up correctly in Trial Balance and P&L (this is the spec's own "Definition of Done"
   test in section 34 — an invoice should flow Invoice → Journal → Ledger → Trial
   Balance → P&L → Balance Sheet). **Verified 2026-09-22**: a 1000.00 invoice posted and
   paid produced a balanced Trial Balance (Bank 1000 dr, AR 1000 dr/1000 cr net zero,
   Sales Revenue 1000 cr — 2000.00 total each side) and a P&L showing Revenue 1000.00 /
   Net Profit 1000.00.
3. Log out, log back in — session persists. **Verified 2026-09-22** (now JWT sessions,
   not database — see 0a).
4. If MFA is enabled for your account, confirm the second-factor step actually appears.
   Not exercised in the 2026-09-22 pass (test account had no MFA enabled) — still a real
   gap to check before go-live.

## 7. Branding — logo and favicon

Added 2026-09-22: `src/app/icon.png` (512×512), `src/app/apple-icon.png` (180×180), and
`public/favicon.ico` (multi-res 16/32/64), plus explicit `icons`/`viewport.themeColor`
metadata in `src/app/layout.tsx`. Color (`#5048E5`) was pulled directly from
`globals.css`'s `--primary` custom property (`243 75% 59%` HSL), not guessed, so it's an
exact match to the UI's own indigo, not just a similar shade. Typeface is Poppins,
matching the live app. Source SVGs and the full render set (9 icon sizes, 1x/2x wordmark)
were handed to the user directly rather than committed to the repo — regenerate from
`icon.svg`/`wordmark.svg` with `sharp` if a different size is ever needed.

Verified 2026-09-22 against production: `/favicon.ico`, `/icon.png`, and `/apple-icon.png`
all return 200 with the correct content-type, and `<head>` carries the matching
`<link rel="icon">` / `<link rel="apple-touch-icon">` tags.

## Production checklist (carried over from README, now with exact commands)

- [ ] Every secret above is set in Vercel per-environment, never committed.
- [ ] `prisma/schema.prisma` has no `directUrl` unless the project has actually moved off
      Prisma Postgres to a classic pooled provider — see step 1's incident note before
      adding one back.
- [ ] `NEXTAUTH_SECRET` is a fresh value per environment, not reused from `.env.example`
      or dev.
- [ ] CI (`.github/workflows/ci.yml`) is green on `main` before every deploy — it now
      runs lint, typecheck, migrations, unit tests, and a full build against a real
      Postgres service container.
- [ ] `REDIS_URL` is set and `src/lib/rateLimit.ts` is swapped to its Redis-backed
      implementation once you run more than one server instance — the in-memory limiter's
      counters don't share across instances, so on Vercel's serverless functions
      (effectively many instances) it's weaker than it looks today.
- [ ] Real adapters replace the dev/simulated ones as each provider is chosen: Stripe
      (`src/lib/integrations/payment.ts`), WhatsApp
      (`src/lib/integrations/whatsapp.ts`), e-invoicing
      (`src/lib/integrations/einvoicing.ts`), inbound email secret.
- [ ] Object storage (`OBJECT_STORAGE_*`) is wired up before document extraction is
      relied on for real receipts — right now only the extraction result is persisted,
      not the source image (`Document.storageKey` is a placeholder).
- [ ] MFA is enabled for every admin-level account before go-live.
- [ ] `robots.txt` and `robots: { index: false }` (already in place) keep
      `app.finloraq.com` out of search results — confirm `finloraq.com` is the domain
      that actually ranks.
- [ ] The CSP in `next.config.mjs` moves from `'unsafe-inline'` to a per-request nonce
      once CI is verifying builds (documented in that file).
