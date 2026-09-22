import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { can, requirePermission } from "@/lib/rbac";
import { SITE_URL } from "@/lib/site";
import { stripeRequest } from "./client";

/**
 * Stripe Connect for invoice payments.
 *
 * Each Finloraq company connects ITS OWN Stripe account (a Standard
 * account: the business owns it, sees it in its own Stripe dashboard, and
 * receives payouts to its own bank). Invoice payments are "direct charges"
 * on that account, so customer money never passes through Finloraq —
 * important both for trust and because holding other businesses' funds
 * would make Finloraq a regulated payment intermediary.
 */

interface StripeAccount {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

export async function getPaymentConnection(companyId: string) {
  return prisma.paymentConnection.findUnique({ where: { companyId } });
}

/** Creates (once) the company's connected account and returns a Stripe onboarding URL. */
export async function startConnectOnboarding(params: { companyId: string; membershipId: string; userId: string }): Promise<string> {
  await requirePermission(params.membershipId, "settings", "EDIT");
  // Card payments post to the ledger automatically under the connecting
  // admin's membership, so that person must be allowed to approve journals.
  if (!(await can(params.membershipId, "journals", "APPROVE"))) {
    throw new Error("Connecting payments needs someone who can approve journal entries (e.g. a Company Admin or CFO), because online payments post to the ledger in their name.");
  }

  let conn = await getPaymentConnection(params.companyId);
  if (!conn) {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: params.companyId } });
    const user = await prisma.user.findUnique({ where: { id: params.userId } });
    const account = await stripeRequest<StripeAccount>(
      "POST",
      "/accounts",
      {
        type: "standard",
        country: company.countryCode,
        email: user?.email ?? undefined,
        business_profile: { name: company.legalName || company.name },
        metadata: { companyId: company.id },
      },
      { idempotencyKey: `connect-account:${company.id}` },
    );
    conn = await prisma.paymentConnection.create({
      data: {
        companyId: company.id,
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        connectedByMembershipId: params.membershipId,
      },
    });
    await recordAuditEvent({
      companyId: company.id, userId: params.userId, action: "payments.stripe_account_created",
      entityType: "PaymentConnection", entityId: conn.id, newValue: { accountId: account.id }, source: "web",
    });
  } else if (conn.connectedByMembershipId !== params.membershipId) {
    // whoever finishes onboarding becomes the posting identity
    conn = await prisma.paymentConnection.update({ where: { id: conn.id }, data: { connectedByMembershipId: params.membershipId } });
  }

  const link = await stripeRequest<{ url: string }>("POST", "/account_links", {
    account: conn.accountId,
    type: "account_onboarding",
    refresh_url: `${SITE_URL}/settings?payments=refresh`,
    return_url: `${SITE_URL}/settings?payments=return`,
  });
  return link.url;
}

/** Pulls the latest capability flags from Stripe (on return from onboarding and on account.updated). */
export async function refreshConnection(accountIdOrObject: string | StripeAccount): Promise<void> {
  const account = typeof accountIdOrObject === "string"
    ? await stripeRequest<StripeAccount>("GET", `/accounts/${accountIdOrObject}`)
    : accountIdOrObject;
  const conn = await prisma.paymentConnection.findUnique({ where: { accountId: account.id } });
  if (!conn) return;
  const changed = conn.chargesEnabled !== account.charges_enabled || conn.payoutsEnabled !== account.payouts_enabled;
  await prisma.paymentConnection.update({
    where: { id: conn.id },
    data: {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    },
  });
  if (changed) {
    await recordAuditEvent({
      companyId: conn.companyId, action: "payments.stripe_account_updated", entityType: "PaymentConnection", entityId: conn.id,
      newValue: { chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled }, source: "system",
    });
  }
}

/** Stripe-hosted dashboard login for the connected account. Standard accounts use dashboard.stripe.com directly. */
export const STRIPE_DASHBOARD_URL = "https://dashboard.stripe.com";

export type { StripeAccount };
