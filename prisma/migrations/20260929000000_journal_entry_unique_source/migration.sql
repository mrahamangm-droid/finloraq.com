-- AddUniqueConstraint: JournalEntry(companyId, sourceType, sourceId)
-- Prevents the race condition where two concurrent requests for the same
-- source document both pass the application-level duplicate check before
-- either has committed, producing two journal entries for one source.
--
-- sourceId IS NOT NULL condition: MANUAL entries (user-entered journals)
-- have no sourceId and must not be constrained — multiple manual entries
-- per company per day is normal. The WHERE clause makes this a partial
-- unique index that only applies to entries that have a sourceId.

CREATE UNIQUE INDEX "JournalEntry_companyId_sourceType_sourceId_key"
  ON "JournalEntry"("companyId", "sourceType", "sourceId")
  WHERE "sourceId" IS NOT NULL;
