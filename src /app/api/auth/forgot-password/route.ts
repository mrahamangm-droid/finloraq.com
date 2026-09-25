import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";
import { SITE_URL } from "@/lib/site";

const schema = z.object({ email: z.string().email() });

// Password-reset tokens reuse NextAuth's existing VerificationToken table
// (identifier, token, expires) instead of a new model — no migration
// needed, and it's the same shape the adapter already uses for its own
// tokens. The "pwreset:" prefix on identifier keeps this namespace apart
// from anything NextAuth itself writes there. Only a SHA-256 hash of the
// token is stored (same reasoning as password hashing): a database read
// alone should never yield a usable reset link.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  // Per-IP AND per-email limits, same pattern as register/login — this
  // endpoint both sends email (abuse = spam/cost) and reveals nothing
  // about account existence, so the limits exist to blunt automation,
  // not to protect a secret.
  const ipLimit = checkRateLimit(`forgot-password:ip:${ip}`, 10, 60 * 60 * 1000);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const emailLimit = checkRateLimit(`forgot-password:email:${email}`, 3, 60 * 60 * 1000);

  // Constant response whether the account exists, is inactive, or the
  // email is simply mistyped — never reveal account existence (same
  // reasoning as the login form's generic "invalid email or password").
  const genericResponse = NextResponse.json({
    ok: true,
    message: "If that email has an account, we've sent a link to reset the password.",
  });

  if (!emailLimit.allowed) return genericResponse;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return genericResponse;

  const token = randomBytes(32).toString("hex");
  const identifier = `pwreset:${email}`;

  // Clear any earlier outstanding tokens for this email first — only the
  // most recently requested link should work.
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashToken(token),
      expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const resetUrl = `${SITE_URL}/reset-password?email=${encodeURIComponent(email)}&token=${token}`;

  try {
    await sendEmail({
      to: email,
      subject: "Reset your Finloraq password",
      text: `We received a request to reset your Finloraq password.\n\nReset it here (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
      html: `<p>We received a request to reset your Finloraq password.</p><p><a href="${resetUrl}">Reset your password</a> (expires in 1 hour).</p><p>If you didn't request this, you can ignore this email — your password won't change.</p>`,
    });
  } catch (err) {
    // Sending failed (e.g. no email provider configured / provider error)
    // — log it, but still return the generic response so we don't leak
    // account existence via a different status code.
    console.error("[forgot-password] email send failed", err);
  }

  await recordAuditEvent({
    userId: user.id,
    action: "auth.password_reset_requested",
    entityType: "User",
    entityId: user.id,
    ipAddress: ip,
  });

  return genericResponse;
}
