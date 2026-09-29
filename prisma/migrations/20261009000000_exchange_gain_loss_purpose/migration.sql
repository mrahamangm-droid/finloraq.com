-- Adds the EXCHANGE_GAIN_LOSS system account purpose, used by multi-currency
-- invoice payments to book realized FX gain/loss (see recordInvoicePayment
-- in src/lib/sales.ts). No backfill needed: the account itself is created
-- lazily per company on first use (getOrCreateExchangeGainLossCode in
-- src/lib/accounts.ts), not seeded at onboarding, since most companies
-- never transact in a foreign currency.
ALTER TYPE "SystemAccountPurpose" ADD VALUE 'EXCHANGE_GAIN_LOSS';
