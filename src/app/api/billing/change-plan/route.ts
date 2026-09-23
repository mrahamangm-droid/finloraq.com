import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { changePlan } from "@/lib/billing/subscription";
import {
  createCheckoutSession,
  createPortalSession,
  hasActiveStripeSubscription,
  isStripeConfigured,
} from "@/lib/integrations/stripe";

const schema = z.object({
  plan: z.enum(["STARTER", "GROWTH", "PROFESSIONAL", "AI_CFO", "ENTERPRISE"]),
});

function appOrigin(req: Request): string {
  return new URL(req.url).origin;
}

/**
 * With Stripe configured:
 *  - no paid Stripe subscription yet + paid plan → Stripe Checkout
 *  - already subscribed → Stripe Customer Portal (switch plan / cancel there,
 *    the webhook syncs the result back)
 *  - Starter without a Stripe subscription → direct change (it's free)
 * Without Stripe: the original simulated flow, unchanged.
 * Responses with `redirectUrl` tell the client to navigate there.
 */
export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  if (parsed.data.plan === "ENTERPRISE") {
    return NextResponse.json(
      { error: "Enterprise is custom-priced — this is a \"Contact us\" plan, not a self-serve checkout." },
      { status: 400 }
    );
  }

  try {
    if (isStripeConfigured()) {
      const origin = appOrigin(req);
      if (await hasActiveStripeSubscription(active.companyId)) {
        const redirectUrl = await createPortalSession(active.companyId, `${origin}/billing`);
        return NextResponse.json({ redirectUrl });
      }
      if (parsed.data.plan !== "STARTER") {
        const redirectUrl = await createCheckoutSession({
          companyId: active.companyId,
          userId,
          plan: parsed.data.plan,
          origin,
        });
        return NextResponse.json({ redirectUrl });
      }
    }

    const result = await changePlan({ companyId: active.companyId, userId, newPlan: parsed.data.plan });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not change plan." }, { status: 400 });
  }
}
