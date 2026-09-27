import { NextResponse } from "next/server";
import { z } from "zod";
import { sendVerificationEmail } from "@/lib/emailVerification";
import { findUserByEmail, normalizeEmail } from "@/lib/userLookup";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";

const schema = z.object({ email: z.string().trim().email() });

export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  const ipLimit = checkRateLimit(`resend-verification:ip:${ip}`, 10, 60 * 60 * 1000);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const email = normalizeEmail(parsed.data.email);

  // Same answer whether or not the account exists (no enumeration).
  const generic = NextResponse.json({
    ok: true,
    message: "If that account needs confirming, we've sent a new link.",
  });

  const emailLimit = checkRateLimit(`resend-verification:email:${email}`, 3, 60 * 60 * 1000);
  if (!emailLimit.allowed) return generic;

  const user = await findUserByEmail(email);
  if (!user || !user.isActive || user.emailVerified) return generic;

  try {
    await sendVerificationEmail(email);
  } catch (err) {
    console.error("[resend-verification] email send failed", err);
  }
  return generic;
}
