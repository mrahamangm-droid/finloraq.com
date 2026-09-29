-- The cron-driven scheduler (processRecurringInvoices) used to skip RBAC
-- entirely when generating invoices from a recurring template. This adds
-- the membership that created each schedule so the scheduler can run
-- generation through that membership's own permissions instead, same
-- system-actor pattern as other cron-driven writes in this codebase.
-- Nullable: existing rows have no creator to backfill.

ALTER TABLE "RecurringInvoice" ADD COLUMN "createdByMembershipId" TEXT;

ALTER TABLE "RecurringInvoice"
    ADD CONSTRAINT "RecurringInvoice_createdByMembershipId_fkey"
    FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
