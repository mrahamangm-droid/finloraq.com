import { prisma } from "@/lib/db";

/**
 * Canonical form for storing and comparing email addresses. Registration
 * stores this; the forgot/reset-password flows already compared against it.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Case-insensitive user lookup. Accounts created before emails were
 * normalised may be stored with mixed case, so an exact findUnique on the
 * lowercased value would miss them (and login with a different
 * capitalisation of the same address would fail).
 */
export function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: normalizeEmail(email), mode: "insensitive" } },
  });
}
