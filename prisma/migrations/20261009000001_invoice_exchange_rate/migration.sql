-- Rate to convert 1 unit of Invoice.currency into the company's base
-- currency, captured at issue time. Defaults to 1 for every existing row
-- (all pre-existing invoices are base-currency, since multi-currency
-- invoicing did not exist before this migration).
ALTER TABLE "Invoice" ADD COLUMN "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1;
