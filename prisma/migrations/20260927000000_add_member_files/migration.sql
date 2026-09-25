-- Files an admin attaches to a member's record on Users & Roles (ID
-- documents, contracts, etc.) — stored as a data: URL, same as
-- User.avatarUrl/Company.logoUrl, since no object storage is configured.
-- CreateTable
CREATE TABLE "MemberFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberFile_companyId_membershipId_idx" ON "MemberFile"("companyId", "membershipId");

-- AddForeignKey
ALTER TABLE "MemberFile" ADD CONSTRAINT "MemberFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFile" ADD CONSTRAINT "MemberFile_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
