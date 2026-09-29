-- JournalLine.costCentreId / departmentId / projectId were added as plain
-- columns in the init migration but never got FK constraints, even though
-- schema.prisma (and the journal detail page's Prisma include) already
-- expected these as real relations. Add the missing constraints.

CREATE INDEX "JournalLine_costCentreId_idx" ON "JournalLine"("costCentreId");
CREATE INDEX "JournalLine_departmentId_idx" ON "JournalLine"("departmentId");
CREATE INDEX "JournalLine_projectId_idx" ON "JournalLine"("projectId");

ALTER TABLE "JournalLine"
    ADD CONSTRAINT "JournalLine_costCentreId_fkey"
    FOREIGN KEY ("costCentreId") REFERENCES "CostCentre"("id") ON UPDATE CASCADE;

ALTER TABLE "JournalLine"
    ADD CONSTRAINT "JournalLine_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON UPDATE CASCADE;

ALTER TABLE "JournalLine"
    ADD CONSTRAINT "JournalLine_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON UPDATE CASCADE;
