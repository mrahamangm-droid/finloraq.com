import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, isPasswordStrong } from "@/lib/password";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";

const schema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  password: z.string().min(12),
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  const limit = checkRateLimit(`reset-password:${ip}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const identifier = `pwreset:${email}`;

  const strength = isPasswordStrong(parsed.data.password);
  if (!strength.ok) {
    return NextResponse.json({ error: strength.reason }, { status: 400 });
  }

  // A second, tighter limit on guessing the token itself for a known
  // email — separate from the per-IP limit above, same pattern as the
  // login form's MFA-attempt limit in src/lib/auth.ts.
  const tokenLimit = checkRateLimit(`reset-password:token:${email}`, 8, 15 * 60 * 1000);
  if (!tokenLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token: hashToken(parsed.data.token) } },
  });

  if (!record || record.expires < new Date()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    // Token existed but the account doesn't/is disabled — consume it
    // anyway so it can't be probed further.
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  // One-time use: remove this (and any other outstanding) reset token for
  // the account now that it's been consumed.
  await prisma.verificationToken.deleteMany({ where: { identifier } });

  await recordAuditEvent({
    userId: user.id,
    action: "auth.password_reset_completed",
    entityType: "User",
    entityId: user.id,
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true });
}
