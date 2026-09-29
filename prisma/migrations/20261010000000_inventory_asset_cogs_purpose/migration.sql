-- Adds the two system account purposes used by perpetual FIFO inventory
-- costing: INVENTORY_ASSET (a balance-sheet asset holding the FIFO cost of
-- stock on hand) and COGS_EXPENSE (the P&L expense a sale relieves it to).
-- See getOrCreateInventoryAssetCode / getOrCreateCogsExpenseCode in
-- src/lib/accounts.ts. Like EXCHANGE_GAIN_LOSS, neither is seeded at
-- onboarding — both are created lazily, only for a company that actually
-- has a tracked-inventory product move through a bill or invoice.
ALTER TYPE "SystemAccountPurpose" ADD VALUE 'INVENTORY_ASSET';
ALTER TYPE "SystemAccountPurpose" ADD VALUE 'COGS_EXPENSE';
