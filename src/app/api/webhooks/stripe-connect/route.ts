import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyStripeSignature, WebhookSignatureError } from "@/lib/integrations/stripe-core";
import { handleInvoiceCheckoutPaid, type CheckoutSession } from "@/lib/stripe/invoicePayments";
import { refreshConnection, type StripeAccount } from "@/lib/stripe/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe Connect webhook: events from companies' CONNECTED accounts
 * (invoice payments, onboarding status). Point a second Stripe endpoint
 * ("Listen to events on Connected accounts") at this URL and set its signing
 * secret as STRIPE_CONNECT_WEBHOOK_SECRET. Subscription billing events for
 * Finloraq's own account keep going to /api/webhooks/stripe.
 *
 * Retries are safe: an invoice payment is recorded once per Stripe payment
 * (unique providerPaymentId + an idempotent ledger posting). A failure
 * returns 500 so Stripe retries.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { received: false, note: "Stripe Connect webhooks are not configured (STRIPE_CONNECT_WEBHOOK_SECRET is empty)." },
      { status: 501 },
    );
  }

  const payload = await req.text();
  try {
    verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret);
  } catch (err) {
    if (err instanceof WebhookSignatureError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  let event: { id: string; type: string; account?: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const obj = event.data.object;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = obj as unknown as CheckoutSession;
        if (session.mode === "payment" && session.metadata?.kind === "invoice") {
          await handleInvoiceCheckoutPaid(session, event.account);
        }
        break;
      }
      case "account.updated":
        await refreshConnection(obj as unknown as StripeAccount);
        break;
      case "account.application.deauthorized":
        if (event.account) {
          await prisma.paymentConnection.updateMany({
            where: { accountId: event.account },
            data: { chargesEnabled: false, payoutsEnabled: false },
          });
        }
        break;
      default:
        break; // acknowledged and ignored
    }
  } catch (err) {
    console.error("[stripe connect webhook] failed", event.type, event.id, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
