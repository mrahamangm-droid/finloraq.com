import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, isPasswordStrong } from "@/lib/password";
import { recordAuditEvent } from "@/lib/audit";
import { findUserByEmail, normalizeEmail } from "@/lib/userLookup";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";
import { sendVerificationEmail, verificationRequiredFor } from "@/lib/emailVerification";
import { isEmailConfigured } from "@/lib/email";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(256),
});

export async function POST(req: Request) {
  // Per-IP limit against automated account creation (10/hour is roomy for
  // a real person, e.g. retrying a typo'd email) — email enumeration is
  // separately prevented below by the generic error message, not by this.
  const ip = clientIpFromHeaders(req.headers);
  const limit = await checkRateLimit(`register:${ip}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const { name, password } = parsed.data;
  const email = normalizeEmail(parsed.data.email);

  const strength = isPasswordStrong(password);
  if (!strength.ok) {
    return NextResponse.json({ error: strength.reason }, { status: 400 });
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    // Same generic error as any other validation failure — do not reveal
    // that the email is already registered (account enumeration).
    return NextResponse.json({ error: "Unable to create account." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await prisma.user.create({
      data: { name, email, passwordHash },
    });
  } catch (err) {
    // Two simultaneous sign-ups for the same address both pass the check
    // above; the DB unique index rejects the second. Answer it like any
    // other duplicate instead of leaking a 500.
    if ((err as { code?: string } | null)?.code === "P2002") {
      return NextResponse.json({ error: "Unable to create account." }, { status: 400 });
    }
    throw err;
  }

  await recordAuditEvent({
    userId: user.id,
    action: "auth.register",
    entityType: "User",
    entityId: user.id,
  });

  // Confirmation email. A send failure must not fail the signup itself —
  // the user can request another link from the sign-in page.
  if (isEmailConfigured() || process.env.REQUIRE_EMAIL_VERIFICATION === "true") {
    try {
      await sendVerificationEmail(email);
    } catch (err) {
      console.error("[register] verification email failed", err);
    }
  }

  return NextResponse.json({ ok: true, verifyEmail: verificationRequiredFor(user) });
}
