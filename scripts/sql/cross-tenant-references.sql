-- Cross-tenant reference report (READ-ONLY: a single SELECT).
--
-- Lists every row whose foreign key points at a record owned by a DIFFERENT
-- company: an invoice whose customer is another company's, a journal line
-- tagged with another company's cost centre, and so on. Until the checks in
-- src/lib/tenantRefs.ts, those ids were taken from the request body without
-- confirming ownership, so such rows could be created through the API. Ids are
-- random cuids, so a hit means someone supplied another company's id on
-- purpose or by a client bug. Expect this to return no rows.
--
-- Run against production with a read-only role, e.g.
--   psql "$DATABASE_URL" -f scripts/sql/cross-tenant-references.sql
-- Nothing here changes data. Posted journal lines are never edited in place;
-- any correction is a separate, explicit decision.

SELECT 'Invoice.customerId' AS reference, i."companyId" AS company_id, i.id AS row_id, i."customerId" AS points_at, c."companyId" AS points_at_company
  FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId" WHERE c."companyId" <> i."companyId"
UNION ALL
SELECT 'Invoice.projectId', i."companyId", i.id, i."projectId", p."companyId"
  FROM "Invoice" i JOIN "Project" p ON p.id = i."projectId" WHERE p."companyId" <> i."companyId"
UNION ALL
SELECT 'InvoiceLine.taxCodeId', i."companyId", il.id, il."taxCodeId", t."companyId"
  FROM "InvoiceLine" il JOIN "Invoice" i ON i.id = il."invoiceId" JOIN "TaxCode" t ON t.id = il."taxCodeId" WHERE t."companyId" <> i."companyId"
UNION ALL
SELECT 'Bill.supplierId', b."companyId", b.id, b."supplierId", s."companyId"
  FROM "Bill" b JOIN "Supplier" s ON s.id = b."supplierId" WHERE s."companyId" <> b."companyId"
UNION ALL
SELECT 'Bill.projectId', b."companyId", b.id, b."projectId", p."companyId"
  FROM "Bill" b JOIN "Project" p ON p.id = b."projectId" WHERE p."companyId" <> b."companyId"
UNION ALL
SELECT 'BillLine.taxCodeId', b."companyId", bl.id, bl."taxCodeId", t."companyId"
  FROM "BillLine" bl JOIN "Bill" b ON b.id = bl."billId" JOIN "TaxCode" t ON t.id = bl."taxCodeId" WHERE t."companyId" <> b."companyId"
UNION ALL
SELECT 'Project.customerId', p."companyId", p.id, p."customerId", c."companyId"
  FROM "Project" p JOIN "Customer" c ON c.id = p."customerId" WHERE c."companyId" <> p."companyId"
UNION ALL
SELECT 'Account.parentId', a."companyId", a.id, a."parentId", pa."companyId"
  FROM "Account" a JOIN "Account" pa ON pa.id = a."parentId" WHERE pa."companyId" <> a."companyId"
UNION ALL
SELECT 'JournalLine.costCentreId', je."companyId", jl.id, jl."costCentreId", cc."companyId"
  FROM "JournalLine" jl JOIN "JournalEntry" je ON je.id = jl."journalEntryId" JOIN "CostCentre" cc ON cc.id = jl."costCentreId" WHERE cc."companyId" <> je."companyId"
UNION ALL
SELECT 'JournalLine.departmentId', je."companyId", jl.id, jl."departmentId", d."companyId"
  FROM "JournalLine" jl JOIN "JournalEntry" je ON je.id = jl."journalEntryId" JOIN "Department" d ON d.id = jl."departmentId" WHERE d."companyId" <> je."companyId"
UNION ALL
SELECT 'JournalLine.projectId', je."companyId", jl.id, jl."projectId", p."companyId"
  FROM "JournalLine" jl JOIN "JournalEntry" je ON je.id = jl."journalEntryId" JOIN "Project" p ON p.id = jl."projectId" WHERE p."companyId" <> je."companyId"
UNION ALL
SELECT 'Document customer-record resolution', d."companyId", d.id, r.value #>> '{resolution,customerId}', c."companyId"
  FROM "Document" d
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d."extractedData" -> 'records') = 'array' THEN d."extractedData" -> 'records' ELSE '[]'::jsonb END) r
  JOIN "Customer" c ON c.id = r.value #>> '{resolution,customerId}'
  WHERE d.kind = 'CUSTOMER_RECORD' AND c."companyId" <> d."companyId"
UNION ALL
SELECT 'Document.relatedEntity (JournalEntry)', d."companyId", d.id, substring(d."relatedEntity" from 14), je."companyId"
  FROM "Document" d JOIN "JournalEntry" je ON je.id = substring(d."relatedEntity" from 14)
  WHERE d."relatedEntity" LIKE 'JournalEntry:%' AND je."companyId" <> d."companyId"
ORDER BY reference, company_id, row_id;
