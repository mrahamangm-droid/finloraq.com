import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeVerificationToken } from "@/lib/emailVerification";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";
import { findUserByEmail } from "@/lib/userLookup";

const schema = z.object({ email: z.string().trim().email(), token: z.string().min(16).max(200) });

export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  const limit = await checkRateLimit(`verify-email:ip:${ip}`, 20, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 400 });
  }

  const ok = await consumeVerificationToken(parsed.data.email, parsed.data.token);
  if (!ok) {
    return NextResponse.json({ error: "This link is invalid or has expired. Request a new one from the sign-in page." }, { status: 400 });
  }

  const user = await findUserByEmail(parsed.data.email);
  if (user) {
    await recordAuditEvent({
      userId: user.id,
      action: "auth.email_verified",
      entityType: "User",
      entityId: user.id,
      ipAddress: ip,
    });
  }
  return NextResponse.json({ ok: true });
}
