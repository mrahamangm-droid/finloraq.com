import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";
import { createPayCheckout, PaymentLinkError } from "@/lib/stripe/invoicePayments";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Public: the "Pay" button on /pay/<token> posts here (a plain form, so it
 * works without JavaScript) and is redirected to Stripe Checkout.
 * No session needed — the unguessable token is the credential, and it can
 * only ever pay the balance of that one invoice to that company.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const ip = clientIpFromHeaders(req.headers);
  if (!checkRateLimit(`pay:${ip}`, 20, 10 * 60 * 1000).allowed) {
    return NextResponse.json({ error: "Too many attempts — try again in a few minutes." }, { status: 429 });
  }
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(params.token)) {
    return NextResponse.redirect(`${SITE_URL}/`, 303);
  }
  try {
    const url = await createPayCheckout(params.token);
    return NextResponse.redirect(url, 303);
  } catch (err) {
    // only a short code goes in the URL, so nobody can craft a link that shows arbitrary text
    const code = err instanceof PaymentLinkError ? "unavailable" : "failed";
    return NextResponse.redirect(`${SITE_URL}/pay/${params.token}?error=${code}`, 303);
  }
}
