-- Import past data: remember which spreadsheet row created each invoice/bill
-- so importing the same sheet again skips rows that are already in.
ALTER TABLE "Invoice" ADD COLUMN "importRef" TEXT;
ALTER TABLE "Bill" ADD COLUMN "importRef" TEXT;

CREATE UNIQUE INDEX "Invoice_companyId_importRef_key" ON "Invoice"("companyId", "importRef");
CREATE UNIQUE INDEX "Bill_companyId_importRef_key" ON "Bill"("companyId", "importRef");
