import { NextResponse } from "next/server";

/**
 * Real-provider webhook shape for when a payment provider is actually
 * configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET in .env.example).
 * Until then this deliberately does NOT pretend to verify a signature it
 * can't check — it responds honestly that no provider is wired up, rather
 * than a silent 200 that would look like a working integration in
 * Stripe's dashboard.
 *
 * TODO(production, once a provider is chosen): verify the
 * Stripe-Signature header against STRIPE_WEBHOOK_SECRET, parse
 * checkout.session.completed / invoice.paid / customer.subscription.*
 * events, and call the same changePlan()/Subscription update path the
 * self-serve /api/billing/change-plan route uses today for the
 * dev/simulated flow — so both paths converge on one source of truth for
 * "what plan is this company on."
 */
export async function POST(req: Request) {
  const configured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  if (!configured) {
    return NextResponse.json(
      { received: false, note: "No payment provider is configured — this webhook has nothing to verify against yet. See the TODO in this file." },
      { status: 501 }
    );
  }

  // Not reached until STRIPE_WEBHOOK_SECRET is set and the TODO above is implemented.
  await req.text();
  return NextResponse.json({ received: true }, { status: 202 });
}
