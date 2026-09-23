import { NextResponse } from "next/server";
import { verifyStripeSignature, WebhookSignatureError } from "@/lib/integrations/stripe-core";
import { isStripeConfigured, syncStripeCustomer } from "@/lib/integrations/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook. Excluded from the session auth gate in src/middleware.ts
 * (it's a server-to-server callback); it authenticates itself by verifying
 * the Stripe-Signature header against STRIPE_WEBHOOK_SECRET over the raw
 * body before trusting anything in it.
 *
 * Every handled event reduces to "re-sync this customer from Stripe"
 * (see syncStripeCustomer), so duplicate or out-of-order deliveries are
 * harmless. A sync failure returns 500 so Stripe retries it.
 */
const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
]);

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !isStripeConfigured()) {
    return NextResponse.json(
      { received: false, note: "Stripe is not configured — set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET." },
      { status: 501 }
    );
  }

  const payload = await req.text();
  try {
    verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    return NextResponse.json({ received: true, handled: false });
  }

  const obj = event.data.object;
  const customerId = typeof obj.customer === "string" ? obj.customer : null;
  const metadata = (obj.metadata ?? {}) as Record<string, string>;
  const hintCompanyId =
    (typeof obj.client_reference_id === "string" ? obj.client_reference_id : null) ?? metadata.companyId ?? null;

  if (!customerId) {
    return NextResponse.json({ received: true, handled: false, note: "Event has no customer." });
  }

  try {
    await syncStripeCustomer(customerId, hintCompanyId);
  } catch (err) {
    console.error(`[stripe webhook] ${event.type} ${event.id} sync failed:`, err);
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true, handled: true });
}
