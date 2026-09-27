# CLAUDE.md

Guidance for Claude (interactive @claude runs and the code-review workflow) working in this repo. Finloraq is an AI finance operating system (accounting, ledger, tax, banking, billing) for real companies -- correctness and tenant isolation matter more than speed here.

## Current merge policy

- `main` requires a pull request and a passing `build-and-test` status check.
- Auto-merge is NOT enabled by default. Always open a PR and stop -- do not enable
  auto-merge or merge to main yourself unless a human explicitly asks you to in
  that specific @claude request. This policy changes only when a human edits this
  file.

## Before calling anything done

Run these locally before opening or updating a PR (CI runs them again, but fix
failures before pushing, don't rely on CI to find them):

```
npm run lint
npm run typecheck
npm test
```

npm run build only when you need to catch a Prisma/Next build error -- it runs
`prisma migrate deploy` first and needs a real DATABASE_URL, which CI provides
via an ephemeral Postgres service container.

## Invariants specific to this codebase

- **Ledger immutability**: only `src/lib/ledger.ts` writes JournalEntry/JournalLine.
  Posted entries are never updated or deleted -- corrections are always a new
  offsetting entry via reverseJournalEntry(). Don't add a second write path.
- **Tenant isolation**: every query scopes to `companyId` resolved server-side in
  `src/lib/tenant.ts` -- never trust a companyId from the client.
- **RBAC is server-side only**: use `src/lib/rbac.ts`'s can()/requirePermission().
  Hiding a button client-side is never the control.
- **Never fake a live integration**: AI, payments, e-invoicing, WhatsApp, and email
  adapters must degrade explicitly (live: false, a clear error) when unconfigured,
matching the existing pattern in src/lib/integrations/*. Never silently no-op or
  fabricate a success.
- **Never commit secrets**: real API keys, DB credentials, or provider tokens
  belong in environment variables (see .env.example), never in code or commits.

## Scope

Keep PRs focused on what was asked. Call out anything you noticed but didn't fix
in the PR description rather than expanding scope silently. If a request would
touch the ledger, RBAC, tenant isolation, auth, or billing in a way that's
ambiguous or risky, say so explicitly in the PR/comment instead of guessing.
