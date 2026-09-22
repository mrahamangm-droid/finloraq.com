# Deploying Finloraq

This is the concrete, do-this-in-order runbook. It assumes the Vercel + Postgres
architecture called for in the spec. Everything in `README.md`'s "Production checklist"
still applies — this document is the step-by-step version of it, with exact commands and
the reasoning behind each one, and it reflects real issues already hit and fixed against
actual Vercel builds (see `git log` — Suspense boundary, NextAuth adapter typing,
`noUncheckedIndexedAccess`, Prisma generate caching) plus two gaps this pass closed:
there was no committed lockfile (non-reproducible installs) and no `.eslintrc` (so
`npm run lint` — and CI — couldn't actually run). Both are fixed in this same change.

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

Pick one (all support the pooled + direct connection split the schema now expects):

- **Neon** (recommended for Vercel — serverless-native, generous free tier): create a
  project, then copy both connection strings it gives you — the **pooled** one (host ends
  `-pooler`) and the **direct** one (no `-pooler`).
- **Supabase**: Project Settings → Database → Connection string. Use the "Transaction"
  pooler string for `DATABASE_URL` and the "Session"/direct string for `DIRECT_URL`.
- **Vercel Postgres**: gives you `POSTGRES_PRISMA_URL` (pooled) and
  `POSTGRES_URL_NON_POOLING` (direct) automatically when attached to the project — map
  those to `DATABASE_URL` and `DIRECT_URL` respectively.
- **Self-hosted / RDS with no pooler in front**: `DATABASE_URL` and `DIRECT_URL` are the
  same string.

Either way you need **two values**: a pooled string for `DATABASE_URL` (what the running
app uses) and a direct string for `DIRECT_URL` (what `prisma migrate` uses — pool
connections can't reliably run the advisory locks and DDL migrations need). If you skip
`DIRECT_URL`, `prisma migrate deploy` will fail with "Environment variable not found:
DIRECT_URL" — it's a required field in `prisma/schema.prisma`, not optional.

## 2. Push this repository to GitHub

This session's sandbox doesn't have push access to `mrahamangm-droid/finloraq.com` (its
git proxy only authorizes repos explicitly granted to the session), so the changes here —
`package-lock.json`, the `.eslintrc.json` fix, the `directUrl` schema change, the CI
workflow, and this file — are staged as a local commit but not pushed. Apply them from
your own machine or authorize this session's GitHub access and ask me to push. Either way,
once they're on `main`:

```bash
git log --oneline -1   # should show "Fix deployability gaps: lockfile, ESLint config, ..."
git push origin main
```

## 3. Create the Vercel project

1. vercel.com → **Add New… → Project** → import `mrahamangm-droid/finloraq.com`.
2. Framework preset: Next.js (auto-detected). Build command and install command can stay
   default — `package.json`'s `build` script already runs `prisma migrate deploy && next
   build`, and `postinstall` already runs `prisma generate`.
3. **Before the first deploy**, go to Project Settings → Environment Variables and add,
   for **all three environments** (Production, Preview, Development) unless noted:

   | Variable | Value | Notes |
   |---|---|---|
   | `DATABASE_URL` | pooled connection string from step 1 | required |
   | `DIRECT_URL` | direct connection string from step 1 | required |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` | **generate a fresh one per environment** — don't reuse the same value in Preview and Production |
   | `NEXTAUTH_URL` | `https://app.finloraq.com` (Production) / the Vercel preview URL pattern (Preview) | must match the actual serving domain or auth callbacks break |
   | `ANTHROPIC_API_KEY` | your key | optional — AI Copilot/extraction/voice fall back to templated/disabled without it, they don't error |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | from Stripe | optional — billing UI works in simulated mode without them |
   | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | from Meta | optional — simulated without them |
   | `INBOUND_EMAIL_WEBHOOK_SECRET` | any strong random string | required only if you wire up inbound email; the webhook rejects all requests until this is set |
   | `REDIS_URL` | from Upstash/Redis Cloud etc. | optional for now — rate limiting works in-memory per-instance without it, but see the production checklist below |
   | `OBJECT_STORAGE_*` (4 vars) | from your S3-compatible provider | not yet wired to actual uploads (README's documented Phase 6 gap) — leave blank until that's built |

4. Deploy. The build log is where `prisma migrate deploy` runs against your real
   database for the first time — watch it for migration errors, not just a green
   checkmark on `next build`.

## 4. Point the domain

`finloraq.com` itself stays on WordPress/Hostinger per the README (the marketing site is
separate from this app). Add a CNAME (or Vercel's provided A/ALIAS record) for
`app.finloraq.com` pointing at Vercel, then add that domain in Project Settings →
Domains. Update `NEXTAUTH_URL` in Production to match exactly once the domain is live.

## 5. Seed (optional, non-production only)

```bash
DATABASE_URL="..." DIRECT_URL="..." npx prisma db seed
```

Creates `demo@finloraq.com` / `DemoPassword123!` with a starter company. Don't run this
against a production database that will hold real customer data — it's a dev convenience,
not a fixture the app depends on.

## 6. Verify the deployed app, not just the build

A green Vercel build means `next build` succeeded — it does not mean the app works
end-to-end. After deploy, actually exercise:

1. Register a new account → company onboarding wizard completes (creates Company + COA +
   UAE VAT pack + open period + Starter subscription in one transaction).
2. Create a customer, raise a draft invoice, post it, record a payment → check it shows
   up correctly in Trial Balance and P&L (this is the spec's own "Definition of Done"
   test in section 34 — an invoice should flow Invoice → Journal → Ledger → Trial
   Balance → P&L → Balance Sheet).
3. Log out, log back in — session persists (database-backed sessions).
4. If MFA is enabled for your account, confirm the second-factor step actually appears.

## Production checklist (carried over from README, now with exact commands)

- [ ] Every secret above is set in Vercel per-environment, never committed.
- [ ] `DIRECT_URL` is set — migrations fail loudly without it (see step 1).
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
