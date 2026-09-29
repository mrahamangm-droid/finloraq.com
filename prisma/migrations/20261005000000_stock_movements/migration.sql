-- StockMovement model for inventory tracking
-- Records every change to a product's quantityOnHand as an immutable log.
-- The Product.quantityOnHand column remains the authoritative running balance;
-- StockMovement provides the audit trail and historical detail.

CREATE TYPE "StockMovementType" AS ENUM (
    'RECEIPT',
    'SHIPMENT',
    'ADJUSTMENT',
    'OPENING',
    'RETURN_IN',
    'RETURN_OUT'
);

CREATE TABLE "StockMovement" (
    "id"            TEXT NOT NULL,
    "companyId"     TEXT NOT NULL,
    "productId"     TEXT NOT NULL,
    "type"          "StockMovementType" NOT NULL,
    "quantity"      DECIMAL(18,4) NOT NULL,
    "balanceAfter"  DECIMAL(18,4) NOT NULL,
    "unitCost"      DECIMAL(18,4),
    "notes"         TEXT,
    "referenceType" TEXT,
    "referenceId"   TEXT,
    "date"          DATE NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"     TEXT NOT NULL,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockMovement_companyId_productId_date_idx"
    ON "StockMovement"("companyId", "productId", "date");

CREATE INDEX "StockMovement_referenceType_referenceId_idx"
    ON "StockMovement"("referenceType", "referenceId");

ALTER TABLE "StockMovement"
    ADD CONSTRAINT "StockMovement_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
