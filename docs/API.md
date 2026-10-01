# Finloraq REST API (v1)

Read your company's books from your own tools — BI dashboards, spreadsheets,
scripts — and create draft invoices and bills. Included on the **Professional**
plan and above.

## Authentication

Create a key in **Settings → API keys** (Company Admins). Copy it when it's
shown — only a hash is stored, so it can't be displayed again. Send it on
every request:

```
Authorization: Bearer fq_…
```

A key acts as the person who created it, limited to the access chosen for the
key:

| Key access | Can do |
|---|---|
| Read-only | `GET` everything below |
| Read + create drafts | the above, plus `POST /invoices` and `POST /bills` (drafts only) |

A request succeeds only if **both** the key's access and that person's current
role allow it. If the person is demoted, the key is narrowed the same moment;
if they're deactivated, or the key is revoked, or the company moves to a plan
without API access, the key stops working. No key can post to the ledger,
approve anything, or manage users or settings.

## Conventions

- Base URL: `https://<your Finloraq domain>/api/v1`
- Money is a **string** with the exact stored value (`"1050.10"` → `"1050.1"`),
  never a float. Dates are ISO 8601 (UTC). Date query params are `YYYY-MM-DD`.
- Lists return `{ "data": [...], "nextCursor": "…" | null }`. Pass
  `?limit=` (1–100, default 50) and `?cursor=<nextCursor>` for the next page.
- Errors return `{ "error": { "code", "message" } }` with `400`
  `invalid_request`, `401` `unauthorized`, `403` `forbidden` / `plan_required`,
  `404` `not_found`, or `429` `rate_limited`.
- Rate limit: 120 requests per minute per key. Every response carries
  `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`
  (Unix seconds); a `429` also sends `Retry-After`.

## Endpoints

| Method & path | Needs | Notes |
|---|---|---|
| `GET /me` | any valid key | the company and key role — use it to test a key |
| `GET /accounts` · `/accounts/{id}` | accounting VIEW | filters: `type`, `isActive` |
| `GET /customers` · `/customers/{id}` | customers VIEW | filter: `isActive` |
| `GET /suppliers` · `/suppliers/{id}` | suppliers VIEW | filter: `isActive` |
| `GET /invoices` · `/invoices/{id}` | invoices VIEW | filters: `status`, `customerId`; by id includes `lines` |
| `POST /invoices` | invoices CREATE | creates a **draft** (see below) |
| `GET /bills` · `/bills/{id}` | bills VIEW | filters: `status`, `supplierId`; by id includes `lines` |
| `POST /bills` | bills CREATE | creates a **draft** |
| `GET /journal-entries` · `/journal-entries/{id}` | journals VIEW | filters: `status`, `sourceType`; by id includes `lines` |
| `GET /reports/trial-balance?asOf=` | reports VIEW | `asOf` defaults to today |
| `GET /reports/profit-and-loss?from=&to=` | reports VIEW | both required |
| `GET /reports/balance-sheet?asOf=` | reports VIEW | |
| `GET /reports/ar-aging?asOf=` · `/reports/ap-aging?asOf=` | reports VIEW | |

### Creating a draft invoice

```bash
curl -X POST https://app.finloraq.com/api/v1/invoices \
  -H "Authorization: Bearer $FINLORAQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "…",
    "issueDate": "2026-10-01",
    "dueDate": "2026-10-31",
    "currency": "AED",
    "lines": [{ "description": "Consulting", "quantity": 10, "unitPrice": "450.00", "taxCodeId": "…" }]
  }'
```

`POST /bills` takes the same shape with `supplierId`. For a currency other than
the company's base currency, add `exchangeRate` (units of base currency per 1
unit of `currency`). Unknown fields are rejected. The draft appears in the app
for someone to review and post; the API never posts to the ledger.

## Not in v1 yet

Updating or deleting records, recording payments, webhooks, and OAuth apps.
