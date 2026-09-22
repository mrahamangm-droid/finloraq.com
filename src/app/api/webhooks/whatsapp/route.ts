import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";

/**
 * WhatsApp Business API webhook shape (Meta's actual protocol): GET is the
 * one-time verification handshake Meta performs when you register the
 * webhook URL (echoes back hub.challenge if hub.verify_token matches);
 * POST delivers inbound messages/media. Real inbound document ingestion
 * (receipt/invoice photos sent via WhatsApp → the same extraction
 * pipeline as email) is a TODO for when WHATSAPP_ACCESS_TOKEN is actually
 * configured — this stub establishes the correct shape so wiring it up
 * later is additive, not a rewrite. Outbound sending
 * (reminders/statements) is src/lib/integrations/whatsapp.ts, already
 * built and already safe to call (it simulates rather than fails when
 * unconfigured).
 */
export async function GET(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  if (!checkRateLimit(`webhook-whatsapp:${ip}`, 20, 60 * 1000).allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_ACCESS_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed." }, { status: 403 });
}

export async function POST() {
  // TODO(Phase 7 follow-up, once WhatsApp credentials exist): parse Meta's
  // message payload, download any media, and call
  // processInboundEmailAttachment()'s sibling for WhatsApp (same
  // extractDocument() pipeline, different source label) so a receipt sent
  // over WhatsApp goes through identical review-before-posting handling.
  return NextResponse.json(
    { received: true, note: "WhatsApp inbound processing is not wired up yet — see the TODO in this file." },
    { status: 202 }
  );
}
