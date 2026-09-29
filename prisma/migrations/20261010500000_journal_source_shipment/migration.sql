-- Adds the SHIPMENT journal source type: a Sales Order shipment posts its
-- own DR COGS / CR Inventory Asset entry at the moment goods physically
-- leave the warehouse (see createShipment in src/lib/sales-orders.ts),
-- separate from and before the eventual Invoice's Revenue/AR/Tax entry.
ALTER TYPE "JournalSourceType" ADD VALUE 'SHIPMENT';
