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
--
-- Note: we deliberately match on "code" alone and do NOT require
-- "isSystem" = true. The seeded Bank account only gained isSystem = true in
-- a later commit ("Mark the seeded Bank account as isSystem"), and no data
-- migration ever backfilled that flag onto existing rows — so companies
-- onboarded before that change have a perfectly good Bank account at code
-- '1000' with isSystem = false. Requiring isSystem here would leave them
-- with purpose = NULL and make getBankAccountCode() throw for exactly the
-- legacy companies this column is meant to support.
UPDATE "Account" SET "purpose" = 'BANK' WHERE "code" = '1000';
UPDATE "Account" SET "purpose" = 'ACCOUNTS_RECEIVABLE' WHERE "code" = '1100';
UPDATE "Account" SET "purpose" = 'INPUT_TAX_RECEIVABLE' WHERE "code" = '1200';
UPDATE "Account" SET "purpose" = 'ACCOUNTS_PAYABLE' WHERE "code" = '2000';
UPDATE "Account" SET "purpose" = 'OUTPUT_TAX_PAYABLE' WHERE "code" = '2100';
