-- Grace deadline for users whose role requires MFA (see src/lib/mfaPolicy.ts).
ALTER TABLE "User" ADD COLUMN "mfaGraceUntil" TIMESTAMP(3);
