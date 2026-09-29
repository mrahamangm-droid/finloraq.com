-- Adds Account.purpose so the posting/reporting code can resolve "this
-- company's Bank account" (and eventually AR/AP/tax control accounts) by a
-- stable role instead of assuming the literal well-known code ("1000" for
-- Bank, etc.) holds for every company.

CREATE TYPE "SystemAccountPurpose" AS ENUM (
    'BANK',
    'ACCOUNTS_RECEIVABLE',
    'INPUT_TAX_RECEIVABLE',
    'ACCOUNTS_PAYABLE',
    'OUTPUT_TAX_PAYABLE'
);

ALTER TABLE "Account" ADD COLUMN "purpose" "SystemAccountPurpose";

CREATE INDEX "Account_companyId_purpose_idx" ON "Account"("companyId", "purpose");

-- Backfill: every existing system account was seeded by onboarding.ts at
-- one of these five fixed codes, so the code alone unambiguously implies
-- purpose for rows that predate this column.
UPDATE "Account" SET "purpose" = 'BANK' WHERE "isSystem" = true AND "code" = '1000';
UPDATE "Account" SET "purpose" = 'ACCOUNTS_RECEIVABLE' WHERE "isSystem" = true AND "code" = '1100';
UPDATE "Account" SET "purpose" = 'INPUT_TAX_RECEIVABLE' WHERE "isSystem" = true AND "code" = '1200';
UPDATE "Account" SET "purpose" = 'ACCOUNTS_PAYABLE' WHERE "isSystem" = true AND "code" = '2000';
UPDATE "Account" SET "purpose" = 'OUTPUT_TAX_PAYABLE' WHERE "isSystem" = true AND "code" = '2100';
