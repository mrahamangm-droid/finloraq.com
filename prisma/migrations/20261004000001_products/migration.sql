-- Product catalog: reusable line-item templates referenced by invoice lines,
-- bill lines, quote lines and PO lines. Company-scoped, no cross-tenant leakage.
-- Must run before 20261005000000_stock_movements, which FKs StockMovement.productId
-- to this table, and before 20261006000000_product_links_on_lines, which adds
-- InvoiceLine.productId / BillLine.productId FKs to this table.

CREATE TYPE "ProductType" AS ENUM ('PRODUCT', 'SERVICE');

CREATE TABLE "Product" (
    "id"                 TEXT NOT NULL,
    "companyId"          TEXT NOT NULL,
    "name"               TEXT NOT NULL,
    "description"        TEXT,
    "sku"                TEXT,
    "type"               "ProductType" NOT NULL DEFAULT 'PRODUCT',
    "unitPrice"          DECIMAL(18,4) NOT NULL,
    "currency"           TEXT NOT NULL DEFAULT 'USD',
    "unit"               TEXT,
    "incomeAccountCode"  TEXT,
    "expenseAccountCode" TEXT,
    "taxCodeId"          TEXT,
    "trackInventory"     BOOLEAN NOT NULL DEFAULT false,
    "quantityOnHand"     DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reorderPoint"       DECIMAL(18,4),
    "isActive"           BOOLEAN NOT NULL DEFAULT true,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product"("companyId", "sku");
CREATE INDEX "Product_companyId_isActive_idx" ON "Product"("companyId", "isActive");

ALTER TABLE "Product"
    ADD CONSTRAINT "Product_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product"
    ADD CONSTRAINT "Product_taxCodeId_fkey"
    FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON UPDATE CASCADE;
