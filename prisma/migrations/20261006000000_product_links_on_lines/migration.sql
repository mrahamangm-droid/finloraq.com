-- Migration: add optional productId to InvoiceLine and BillLine
-- Enables inventory deduction on invoice posting and receipt on bill approval.
-- The FK is SET NULL on product delete so that deleting a product never
-- cascades into deleting the historical invoice or bill line.

ALTER TABLE "InvoiceLine"
  ADD COLUMN "productId" TEXT;

ALTER TABLE "BillLine"
  ADD COLUMN "productId" TEXT;

ALTER TABLE "InvoiceLine"
  ADD CONSTRAINT "InvoiceLine_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillLine"
  ADD CONSTRAINT "BillLine_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InvoiceLine_productId_idx" ON "InvoiceLine"("productId");
CREATE INDEX "BillLine_productId_idx" ON "BillLine"("productId");
