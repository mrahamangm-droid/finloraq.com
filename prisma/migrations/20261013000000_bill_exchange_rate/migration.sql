-- Rate to convert 1 unit of Bill.currency into the company's base
-- currency, captured at issue time. Defaults to 1 for every existing row
-- (all pre-existing bills are base-currency, since multi-currency billing
-- did not exist before this migration).
ALTER TABLE "Bill" ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1;
