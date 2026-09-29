-- Rate to convert 1 unit of CreditNote.currency into the company's base
-- currency, captured at issue time. Defaults to 1 for every existing row
-- (all pre-existing credit notes are base-currency, since multi-currency
-- credit notes did not exist before this migration).
ALTER TABLE "CreditNote" ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1;
