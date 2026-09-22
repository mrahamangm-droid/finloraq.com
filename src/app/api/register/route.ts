import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, isPasswordStrong } from "@/lib/password";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";

const schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(12),
});

export async function POST(req: Request) {
  // Per-IP limit against automated account creation (10/hour is roomy for
  // a real person, e.g. retrying a typo'd email) — email enumeration is
  // separately prevented below by the generic error message, not by this.
  const ip = clientIpFromHeaders(req.headers);
  const limit = checkRateLimit(`register:${ip}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const { name, email, password } = parsed.data;

  const strength = isPasswordStrong(password);
  if (!strength.ok) {
    return NextResponse.json({ error: strength.reason }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Same generic error as any other validation failure — do not reveal
    // that the email is already registered (account enumeration).
    return NextResponse.json({ error: "Unable to create account." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  await recordAuditEvent({
    userId: user.id,
    action: "auth.register",
    entityType: "User",
    entityId: user.id,
  });

  return NextResponse.json({ ok: true });
}
