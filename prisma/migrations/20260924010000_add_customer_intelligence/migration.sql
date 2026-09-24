-- Customer File Intelligence (spec item 5): a second Document review
-- queue, alongside the existing expense/receipt one (src/lib/ai/extraction.ts),
-- for reading a customer + exact date off an uploaded file and matching it
-- to a Customer record. Same Document table, so the existing dedupe-by-hash
-- behavior carries over unchanged for the original (EXPENSE) pipeline.

-- AlterEnum: a document a human explicitly dismissed from either review
-- queue, distinct from FAILED (extraction itself errored). Postgres 12+
-- allows ALTER TYPE ... ADD VALUE inside a transaction as long as the new
-- value isn't used later in the same transaction, which it isn't here.
ALTER TYPE "DocumentStatus" ADD VALUE 'IGNORED';

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('EXPENSE', 'CUSTOMER_RECORD');

-- AlterTable: default keeps every existing Document row (all from the
-- expense pipeline so far) exactly as before.
ALTER TABLE "Document" ADD COLUMN "kind" "DocumentKind" NOT NULL DEFAULT 'EXPENSE';

-- CreateIndex
CREATE INDEX "Document_companyId_kind_status_idx" ON "Document"("companyId", "kind", "status");
