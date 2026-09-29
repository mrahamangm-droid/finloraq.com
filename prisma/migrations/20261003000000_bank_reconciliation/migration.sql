-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- Add reconciliationId to BankTransaction
ALTER TABLE "BankTransaction" ADD COLUMN "reconciliationId" TEXT;
CREATE INDEX "BankTransaction_reconciliationId_idx" ON "BankTransaction"("reconciliationId");

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementDate" DATE NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "closingBalance" DECIMAL(18,2) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankReconciliation_companyId_bankAccountId_status_idx" ON "BankReconciliation"("companyId", "bankAccountId", "status");

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_reconciliationId_fkey"
    FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
