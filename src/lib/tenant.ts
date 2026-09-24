import { cache } from "react";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/rbac";

const ACTIVE_COMPANY_COOKIE = "finloraq_active_company";

/**
 * Resolves "who is signed in, and which company are they currently acting
 * as" for a server component/action/route. This is the single choke point
 * tenant isolation runs through — every data-access function should derive
 * companyId + membershipId from here rather than trusting a client-supplied
 * companyId in a request body.
 */
// cache(): the layout and the page both need this — one session lookup and one query per request.
export const getTenantContext = cache(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const activeCompanyId = cookies().get(ACTIVE_COMPANY_COOKIE)?.value;

  const memberships = await prisma.companyMembership.findMany({
    where: { userId: session.user.id, isActive: true },
    include: { company: true },
  });

  if (memberships.length === 0) {
    return { userId: session.user.id, memberships: [], active: null };
  }

  const active =
    memberships.find((m) => m.companyId === activeCompanyId) ?? memberships[0];

  return { userId: session.user.id, memberships, active };
});

/** Throws if there's no signed-in user with an active company membership. */
export async function requireTenantContext() {
  const ctx = await getTenantContext();
  if (!ctx?.active) {
    throw new ForbiddenError("No active company selected.");
  }
  return ctx as {
    userId: string;
    memberships: NonNullable<Awaited<ReturnType<typeof getTenantContext>>>["memberships"];
    active: NonNullable<NonNullable<Awaited<ReturnType<typeof getTenantContext>>>["active"]>;
  };
}

export { ACTIVE_COMPANY_COOKIE };
