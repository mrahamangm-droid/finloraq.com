-- AlterTable: personal profile photo (data: URL, self-editable regardless of company role)
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

-- AlterTable: business branding, available on every plan, applied to
-- customer-facing document headers (see Company.logoUrl comment in schema.prisma)
ALTER TABLE "Company" ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "tagline" TEXT,
ADD COLUMN "brandEmail" TEXT,
ADD COLUMN "brandPhone" TEXT,
ADD COLUMN "brandAddress" TEXT;
