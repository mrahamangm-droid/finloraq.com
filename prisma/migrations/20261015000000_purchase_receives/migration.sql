-- Purchase Receives: the goods-receipt stage between a Purchase Order and
-- its Bill(s), mirroring Sales Order -> Shipment -> Invoice on the sales
-- side. A receive of a tracked-inventory line posts
--   DR Inventory Asset / CR Goods Received Not Invoiced (GRNI)
-- at the PO's base-currency cost and creates the FIFO cost layer; the
-- PO-linked bill line later clears GRNI instead of capitalizing again.
-- See src/lib/purchase-orders.ts.

ALTER TYPE "SystemAccountPurpose" ADD VALUE 'GOODS_RECEIVED_NOT_INVOICED';
ALTER TYPE "JournalSourceType" ADD VALUE 'PURCHASE_RECEIVE';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PARTIALLY_RECEIVED' BEFORE 'RECEIVED';

-- Every existing PO predates multi-currency POs, so 1 is correct for them.
ALTER TABLE "PurchaseOrder" ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1;

ALTER TABLE "PurchaseOrderLine" ADD COLUMN "productId" TEXT;
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "receivedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "billedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0;

ALTER TABLE "BillLine" ADD COLUMN "purchaseOrderLineId" TEXT;

-- Backfill: a PO already converted to a bill under the old all-or-nothing
-- flow was fully received and fully billed.
UPDATE "PurchaseOrderLine" l
   SET "receivedQuantity" = l."quantity", "billedQuantity" = l."quantity"
  FROM "PurchaseOrder" p
 WHERE p."id" = l."poId" AND p."status" = 'BILLED';
UPDATE "PurchaseOrderLine" l
   SET "receivedQuantity" = l."quantity"
  FROM "PurchaseOrder" p
 WHERE p."id" = l."poId" AND p."status" = 'RECEIVED';

-- CreateTable
CREATE TABLE "PurchaseReceive" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "receiveNumber" TEXT NOT NULL,
    "receiveDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "PurchaseReceive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiveLine" (
    "id" TEXT NOT NULL,
    "receiveId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "PurchaseReceiveLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchaseOrderLine_productId_idx" ON "PurchaseOrderLine"("productId");
CREATE INDEX "BillLine_purchaseOrderLineId_idx" ON "BillLine"("purchaseOrderLineId");
CREATE UNIQUE INDEX "PurchaseReceive_companyId_receiveNumber_key" ON "PurchaseReceive"("companyId", "receiveNumber");
CREATE INDEX "PurchaseReceive_companyId_poId_idx" ON "PurchaseReceive"("companyId", "poId");
CREATE INDEX "PurchaseReceiveLine_purchaseOrderLineId_idx" ON "PurchaseReceiveLine"("purchaseOrderLineId");

ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceive" ADD CONSTRAINT "PurchaseReceive_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceive" ADD CONSTRAINT "PurchaseReceive_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiveLine" ADD CONSTRAINT "PurchaseReceiveLine_receiveId_fkey" FOREIGN KEY ("receiveId") REFERENCES "PurchaseReceive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiveLine" ADD CONSTRAINT "PurchaseReceiveLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
