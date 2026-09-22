import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { changePlan } from "@/lib/billing/subscription";
import { isStripeConfigured } from "@/lib/stripe/client";
import { changePlanWithStripe } from "@/lib/stripe/subscriptions";

const schema = z.object({
  plan: z.enum(["STARTER", "GROWTH", "PROFESSIONAL", "AI_CFO", "ENTERPRISE"]),
});

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
      // Real billing: Stripe Checkout for a new subscription, in-place change otherwise.
      // The plan itself only changes when Stripe's webhook confirms it.
      const result = await changePlanWithStripe({ companyId: active.companyId, userId, plan: parsed.data.plan });
      return NextResponse.json(result);
    }
    const result = await changePlan({ companyId: active.companyId, userId, newPlan: parsed.data.plan });
    return NextResponse.json({ kind: "simulated", ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not change plan." }, { status: 400 });
  }
}
