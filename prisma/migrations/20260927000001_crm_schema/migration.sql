-- CRM Schema: Leads, Contacts, Deals, Pipelines, Activities
-- P1 feature — wires into accounting via Deal.invoiceId → Invoice

-- Enums
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED');
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'TASK', 'NOTE');
CREATE TYPE "ActivityStatus" AS ENUM ('PLANNED', 'DONE', 'CANCELLED');

-- Pipeline
CREATE TABLE "Pipeline" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Pipeline_companyId_name_key" UNIQUE ("companyId", "name"),
  CONSTRAINT "Pipeline_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "Company"("id") ON DELETE CASCADE
);
CREATE INDEX "Pipeline_companyId_idx" ON "Pipeline"("companyId");

-- PipelineStage
CREATE TABLE "PipelineStage" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "pipelineId"  TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "position"    INTEGER NOT NULL,
  "probability" INTEGER NOT NULL DEFAULT 50,
  "isWon"       BOOLEAN NOT NULL DEFAULT false,
  "isLost"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PipelineStage_pipelineId_name_key" UNIQUE ("pipelineId", "name"),
  CONSTRAINT "PipelineStage_pipelineId_position_key" UNIQUE ("pipelineId", "position"),
  CONSTRAINT "PipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId")
    REFERENCES "Pipeline"("id") ON DELETE CASCADE
);
CREATE INDEX "PipelineStage_companyId_idx" ON "PipelineStage"("companyId");

-- Lead
CREATE TABLE "Lead" (
  "id"                  TEXT NOT NULL,
  "companyId"           TEXT NOT NULL,
  "firstName"           TEXT NOT NULL,
  "lastName"            TEXT NOT NULL,
  "email"               TEXT,
  "phone"               TEXT,
  "companyName"         TEXT,
  "jobTitle"            TEXT,
  "source"              TEXT,
  "status"              "LeadStatus" NOT NULL DEFAULT 'NEW',
  "notes"               TEXT,
  "assignedToId"        TEXT,
  "createdById"         TEXT,
  "convertedAt"         TIMESTAMP(3),
  "convertedCustomerId" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "Company"("id") ON DELETE CASCADE,
  CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId")
    REFERENCES "CompanyMembership"("id") ON DELETE SET NULL,
  CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "CompanyMembership"("id") ON DELETE SET NULL,
  CONSTRAINT "Lead_convertedCustomerId_fkey" FOREIGN KEY ("convertedCustomerId")
    REFERENCES "Customer"("id") ON DELETE SET NULL
);
CREATE INDEX "Lead_companyId_status_idx" ON "Lead"("companyId", "status");
CREATE INDEX "Lead_companyId_assignedToId_idx" ON "Lead"("companyId", "assignedToId");
CREATE INDEX "Lead_companyId_convertedCustomerId_idx" ON "Lead"("companyId", "convertedCustomerId");

-- CrmContact
CREATE TABLE "CrmContact" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "firstName"   TEXT NOT NULL,
  "lastName"    TEXT NOT NULL,
  "email"       TEXT,
  "phone"       TEXT,
  "title"       TEXT,
  "department"  TEXT,
  "isPrimary"   BOOLEAN NOT NULL DEFAULT false,
  "customerId"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmContact_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "Company"("id") ON DELETE CASCADE,
  CONSTRAINT "CrmContact_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "Customer"("id") ON DELETE SET NULL
);
CREATE INDEX "CrmContact_companyId_idx" ON "CrmContact"("companyId");
CREATE INDEX "CrmContact_companyId_customerId_idx" ON "CrmContact"("companyId", "customerId");

-- Deal
CREATE TABLE "Deal" (
  "id"                TEXT NOT NULL,
  "companyId"         TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "value"             DECIMAL(18,4) NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'USD',
  "pipelineId"        TEXT NOT NULL,
  "stageId"           TEXT NOT NULL,
  "customerId"        TEXT,
  "contactId"         TEXT,
  "assignedToId"      TEXT,
  "expectedCloseDate" TIMESTAMP(3),
  "closedAt"          TIMESTAMP(3),
  "closedWon"         BOOLEAN,
  "lostReason"        TEXT,
  "notes"             TEXT,
  "invoiceId"         TEXT,
  "createdById"       TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Deal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Deal_invoiceId_key" UNIQUE ("invoiceId"),
  CONSTRAINT "Deal_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "Company"("id") ON DELETE CASCADE,
  CONSTRAINT "Deal_pipelineId_fkey" FOREIGN KEY ("pipelineId")
    REFERENCES "Pipeline"("id"),
  CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId")
    REFERENCES "PipelineStage"("id"),
  CONSTRAINT "Deal_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "Customer"("id") ON DELETE SET NULL,
  CONSTRAINT "Deal_contactId_fkey" FOREIGN KEY ("contactId")
    REFERENCES "CrmContact"("id") ON DELETE SET NULL,
  CONSTRAINT "Deal_assignedToId_fkey" FOREIGN KEY ("assignedToId")
    REFERENCES "CompanyMembership"("id") ON DELETE SET NULL,
  CONSTRAINT "Deal_invoiceId_fkey" FOREIGN KEY ("invoiceId")
    REFERENCES "Invoice"("id") ON DELETE SET NULL
);
CREATE INDEX "Deal_companyId_pipelineId_idx" ON "Deal"("companyId", "pipelineId");
CREATE INDEX "Deal_companyId_stageId_idx" ON "Deal"("companyId", "stageId");
CREATE INDEX "Deal_companyId_assignedToId_idx" ON "Deal"("companyId", "assignedToId");
CREATE INDEX "Deal_companyId_closedWon_idx" ON "Deal"("companyId", "closedWon");

-- CrmActivity
CREATE TABLE "CrmActivity" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "type"          "ActivityType" NOT NULL,
  "status"        "ActivityStatus" NOT NULL DEFAULT 'PLANNED',
  "subject"       TEXT NOT NULL,
  "notes"         TEXT,
  "dueAt"         TIMESTAMP(3),
  "doneAt"        TIMESTAMP(3),
  "leadId"        TEXT,
  "dealId"        TEXT,
  "contactId"     TEXT,
  "customerId"    TEXT,
  "assignedToId"  TEXT,
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmActivity_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "Company"("id") ON DELETE CASCADE,
  CONSTRAINT "CrmActivity_leadId_fkey" FOREIGN KEY ("leadId")
    REFERENCES "Lead"("id") ON DELETE SET NULL,
  CONSTRAINT "CrmActivity_dealId_fkey" FOREIGN KEY ("dealId")
    REFERENCES "Deal"("id") ON DELETE SET NULL,
  CONSTRAINT "CrmActivity_contactId_fkey" FOREIGN KEY ("contactId")
    REFERENCES "CrmContact"("id") ON DELETE SET NULL,
  CONSTRAINT "CrmActivity_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "Customer"("id") ON DELETE SET NULL,
  CONSTRAINT "CrmActivity_assignedToId_fkey" FOREIGN KEY ("assignedToId")
    REFERENCES "CompanyMembership"("id") ON DELETE SET NULL,
  CONSTRAINT "CrmActivity_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "CompanyMembership"("id") ON DELETE SET NULL
);
CREATE INDEX "CrmActivity_companyId_leadId_idx" ON "CrmActivity"("companyId", "leadId");
CREATE INDEX "CrmActivity_companyId_dealId_idx" ON "CrmActivity"("companyId", "dealId");
CREATE INDEX "CrmActivity_companyId_assignedToId_idx" ON "CrmActivity"("companyId", "assignedToId");
CREATE INDEX "CrmActivity_companyId_dueAt_idx" ON "CrmActivity"("companyId", "dueAt");
