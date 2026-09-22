import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { StripeSignatureError, verifyStripeSignature } from "@/lib/stripe/core";
import { syncSubscription, syncSubscriptionById, type StripeSubscription } from "@/lib/stripe/subscriptions";
import { handleInvoiceCheckoutPaid, type CheckoutSession } from "@/lib/stripe/invoicePayments";
import { refreshConnection, type StripeAccount } from "@/lib/stripe/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook — the single source of truth for billing and online
 * payments. Two endpoints can point here, each with its own signing secret:
 *   • STRIPE_WEBHOOK_SECRET          — your account's events (subscriptions)
 *   • STRIPE_CONNECT_WEBHOOK_SECRET  — connected accounts' events (invoice payments)
 * Every event is verified, handled at most once (StripeEvent table), and a
 * failure returns 500 so Stripe retries it.
 */
export async function POST(req: Request) {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((s): s is string => Boolean(s));
  if (!secrets.length) {
    return NextResponse.json({ received: false, note: "Stripe webhooks are not configured (STRIPE_WEBHOOK_SECRET is empty)." }, { status: 501 });
  }

  const payload = await req.text();
  try {
    verifyStripeSignature(payload, req.headers.get("stripe-signature"), secrets);
  } catch (err) {
    if (err instanceof StripeSignatureError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const event = JSON.parse(payload) as { id: string; type: string; account?: string; data: { object: Record<string, unknown> } };

  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw err;
  }

  try {
    await handle(event);
  } catch (err) {
    // let Stripe retry: forget that we "processed" it
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    console.error("stripe webhook failed", event.type, event.id, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function handle(event: { type: string; account?: string; data: { object: Record<string, unknown> } }) {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = obj as unknown as CheckoutSession & { subscription?: string | null };
      if (session.mode === "subscription" && session.subscription && !event.account) {
        await syncSubscriptionById(session.subscription);
      } else if (session.mode === "payment" && session.metadata?.kind === "invoice") {
        await handleInvoiceCheckoutPaid(session, event.account);
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      if (!event.account) await syncSubscription(obj as unknown as StripeSubscription);
      return;
    case "customer.subscription.deleted":
      if (!event.account) await syncSubscription(obj as unknown as StripeSubscription, true);
      return;
    case "account.updated":
      await refreshConnection(obj as unknown as StripeAccount);
      return;
    case "account.application.deauthorized":
      if (event.account) {
        await prisma.paymentConnection.updateMany({
          where: { accountId: event.account },
          data: { chargesEnabled: false, payoutsEnabled: false },
        });
      }
      return;
    default:
      return; // other events are acknowledged and ignored
  }
}
