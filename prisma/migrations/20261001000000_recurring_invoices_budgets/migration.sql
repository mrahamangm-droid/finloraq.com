-- Migration: recurring_invoices_budgets
-- Adds RecurringInvoice, RecurringInvoiceLine, Budget, BudgetItem models
-- and back-relation columns on Invoice and Customer.

-- Add FK column on Invoice for the recurring template
ALTER TABLE "Invoice" ADD COLUMN "recurringInvoiceId" TEXT;

-- Enums for RecurringInvoice
CREATE TYPE "RecurringFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY');
CREATE TYPE "RecurringStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- RecurringInvoice table
CREATE TABLE "RecurringInvoice" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "customerId"  TEXT NOT NULL,
    "currency"    TEXT NOT NULL DEFAULT 'USD',
    "frequency"   "RecurringFrequency" NOT NULL,
    "startDate"   TIMESTAMP(3) NOT NULL,
    "endDate"     TIMESTAMP(3),
    "nextRunAt"   TIMESTAMP(3) NOT NULL,
    "lastRunAt"   TIMESTAMP(3),
    "status"      "RecurringStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringInvoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecurringInvoice_companyId_idx" ON "RecurringInvoice"("companyId");
CREATE INDEX "RecurringInvoice_nextRunAt_status_idx" ON "RecurringInvoice"("nextRunAt", "status");

ALTER TABLE "RecurringInvoice"
    ADD CONSTRAINT "RecurringInvoice_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecurringInvoice"
    ADD CONSTRAINT "RecurringInvoice_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON UPDATE CASCADE;

-- RecurringInvoiceLine table
CREATE TABLE "RecurringInvoiceLine" (
    "id"                 TEXT NOT NULL,
    "recurringInvoiceId" TEXT NOT NULL,
    "description"        TEXT NOT NULL,
    "quantity"           DECIMAL(18,4) NOT NULL,
    "unitPrice"          DECIMAL(18,4) NOT NULL,
    "taxCodeId"          TEXT,

    CONSTRAINT "RecurringInvoiceLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RecurringInvoiceLine"
    ADD CONSTRAINT "RecurringInvoiceLine_recurringInvoiceId_fkey"
    FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecurringInvoiceLine"
    ADD CONSTRAINT "RecurringInvoiceLine_taxCodeId_fkey"
    FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON UPDATE CASCADE;

-- Back-relation FK from Invoice to RecurringInvoice
ALTER TABLE "Invoice"
    ADD CONSTRAINT "Invoice_recurringInvoiceId_fkey"
    FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice"("id") ON UPDATE CASCADE;

-- Budget table
CREATE TABLE "Budget" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "fiscalYear"  INTEGER NOT NULL,
    "currency"    TEXT NOT NULL DEFAULT 'USD',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Budget_companyId_name_fiscalYear_key" ON "Budget"("companyId", "name", "fiscalYear");
CREATE INDEX "Budget_companyId_fiscalYear_idx" ON "Budget"("companyId", "fiscalYear");

ALTER TABLE "Budget"
    ADD CONSTRAINT "Budget_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BudgetItem table
CREATE TABLE "BudgetItem" (
    "id"          TEXT NOT NULL,
    "budgetId"    TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "month"       INTEGER NOT NULL,
    "amount"      DECIMAL(18,2) NOT NULL,

    CONSTRAINT "BudgetItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BudgetItem_budgetId_accountCode_month_key" ON "BudgetItem"("budgetId", "accountCode", "month");
CREATE INDEX "BudgetItem_budgetId_accountCode_idx" ON "BudgetItem"("budgetId", "accountCode");

ALTER TABLE "BudgetItem"
    ADD CONSTRAINT "BudgetItem_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
