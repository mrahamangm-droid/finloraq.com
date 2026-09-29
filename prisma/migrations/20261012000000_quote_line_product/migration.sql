-- Links a QuoteLine to a catalog Product, same as InvoiceLine/BillLine/
-- SalesOrderLine already do. Without this, converting a quote into a
-- Sales Order (or an invoice) can never carry inventory/COGS information
-- through, since there is nothing to carry.
ALTER TABLE "QuoteLine" ADD COLUMN "productId" TEXT;

-- CreateIndex
CREATE INDEX "QuoteLine_productId_idx" ON "QuoteLine"("productId");

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
