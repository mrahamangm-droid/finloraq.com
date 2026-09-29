-- AlterTable: add portalToken to Customer (nullable, unique)
ALTER TABLE "Customer" ADD COLUMN "portalToken" TEXT;
CREATE UNIQUE INDEX "Customer_portalToken_key" ON "Customer"("portalToken");
