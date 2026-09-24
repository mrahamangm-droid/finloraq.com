-- CreateEnum
CREATE TYPE "CustomFieldEntity" AS ENUM ('CUSTOMER', 'SUPPLIER', 'INVOICE');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "brandColor" TEXT,
ADD COLUMN "invoiceFooter" TEXT,
ADD COLUMN "invoiceTerms" TEXT,
ADD COLUMN "navConfig" JSONB;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "customFields" JSONB;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "customFields" JSONB;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "customFields" JSONB;

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "density" TEXT NOT NULL DEFAULT 'comfortable',
    "landingPage" TEXT NOT NULL DEFAULT '/dashboard',
    "dateFormat" TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    "numberFormat" TEXT NOT NULL DEFAULT '1,234.56',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "widgets" JSONB NOT NULL,
    "range" TEXT NOT NULL DEFAULT 'mtd',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entity" "CustomFieldEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayout_membershipId_key" ON "DashboardLayout"("membershipId");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_companyId_entity_idx" ON "CustomFieldDefinition"("companyId", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_companyId_entity_key_key" ON "CustomFieldDefinition"("companyId", "entity", "key");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
