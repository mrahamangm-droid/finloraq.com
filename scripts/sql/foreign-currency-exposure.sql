-- Foreign-currency exposure report (READ-ONLY: SELECT statements only).
--
-- Lists every journal entry, invoice and bill whose currency differs from its
-- company's base currency. Before the base-currency guard in
-- postJournalEntry(), such records could be created through the API and were
-- posted at an exchange rate of 1, so every report counts their amounts as
-- base currency.
--
-- `kind` separates two very different cases:
--   likely_mislabel    labelled AED in a non-AED company. Before #64 new
--                      documents defaulted to "AED" even when the company's
--                      base currency was something else; the amounts are
--                      usually already in the base currency and only the
--                      label is wrong.
--   foreign_currency   any other currency. Amounts are probably in that
--                      foreign currency and are overstated or understated in
--                      base-currency reports.
--
-- Run against production with a read-only role, e.g.
--   psql "$DATABASE_URL" -f scripts/sql/foreign-currency-exposure.sql
-- Nothing here changes data. Any backfill is a separate, explicit decision.

-- 1. Summary per company and record type.
WITH records AS (
  SELECT je."companyId", 'journal entry' AS record, je.status::text AS status, je.currency,
         (SELECT COALESCE(SUM(jl.debit), 0) FROM "JournalLine" jl WHERE jl."journalEntryId" = je.id) AS amount
  FROM "JournalEntry" je
  UNION ALL
  SELECT i."companyId", 'invoice', i.status::text, i.currency, i.total FROM "Invoice" i
  UNION ALL
  SELECT b."companyId", 'bill', b.status::text, b.currency, b.total FROM "Bill" b
)
SELECT c.id AS company_id,
       c.name AS company,
       c."baseCurrency" AS base_currency,
       r.record,
       r.currency,
       CASE WHEN r.currency = 'AED' AND c."baseCurrency" <> 'AED' THEN 'likely_mislabel' ELSE 'foreign_currency' END AS kind,
       COUNT(*) FILTER (WHERE r.status IN ('POSTED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'APPROVED')) AS posted_count,
       COUNT(*) FILTER (WHERE r.status = 'DRAFT') AS draft_count,
       COUNT(*) FILTER (WHERE r.status = 'VOID') AS void_count,
       SUM(r.amount) FILTER (WHERE r.status <> 'DRAFT' AND r.status <> 'VOID') AS posted_amount
FROM records r
JOIN "Company" c ON c.id = r."companyId"
WHERE r.currency <> c."baseCurrency"
GROUP BY c.id, c.name, c."baseCurrency", r.record, r.currency, kind
ORDER BY c.name, r.record, r.currency;

-- 2. Every affected row (same filter), oldest first, for review.
SELECT c.name AS company, c."baseCurrency" AS base_currency, 'journal entry' AS record,
       je."entryNumber" AS reference, je.status::text AS status, je.date::date AS date, je.currency,
       (SELECT COALESCE(SUM(jl.debit), 0) FROM "JournalLine" jl WHERE jl."journalEntryId" = je.id) AS amount,
       je."sourceType"::text AS source_type, je.id
FROM "JournalEntry" je JOIN "Company" c ON c.id = je."companyId"
WHERE je.currency <> c."baseCurrency"
UNION ALL
SELECT c.name, c."baseCurrency", 'invoice', i."invoiceNumber", i.status::text, i."issueDate"::date, i.currency, i.total, NULL, i.id
FROM "Invoice" i JOIN "Company" c ON c.id = i."companyId"
WHERE i.currency <> c."baseCurrency"
UNION ALL
SELECT c.name, c."baseCurrency", 'bill', b."billNumber", b.status::text, b."issueDate"::date, b.currency, b.total, NULL, b.id
FROM "Bill" b JOIN "Company" c ON c.id = b."companyId"
WHERE b.currency <> c."baseCurrency"
ORDER BY 1, 6, 3;
