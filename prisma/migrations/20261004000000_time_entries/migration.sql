-- AddColumn: TimeEntry model for project time tracking
-- Each entry records hours logged against a project by a user/membership.
-- invoiceLineId is set once the entry is converted to an invoice line.

CREATE TABLE "TimeEntry" (
    "id"            TEXT NOT NULL,
    "companyId"     TEXT NOT NULL,
    "projectId"     TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "date"          DATE NOT NULL,
    "hours"         DECIMAL(8,2) NOT NULL,
    "description"   TEXT NOT NULL,
    "hourlyRate"    DECIMAL(18,2),
    "isBillable"    BOOLEAN NOT NULL DEFAULT true,
    "invoiceLineId" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- Index for efficient per-project and per-user queries
CREATE INDEX "TimeEntry_companyId_projectId_idx" ON "TimeEntry"("companyId", "projectId");
CREATE INDEX "TimeEntry_companyId_userId_idx"    ON "TimeEntry"("companyId", "userId");
CREATE INDEX "TimeEntry_invoiceLineId_idx"       ON "TimeEntry"("invoiceLineId");

-- FK: cascade delete when the parent project is deleted
ALTER TABLE "TimeEntry"
    ADD CONSTRAINT "TimeEntry_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
