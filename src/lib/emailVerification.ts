import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { findUserByEmail, normalizeEmail } from "@/lib/userLookup";
import { SITE_URL } from "@/lib/site";
import { isVerificationRequired } from "@/lib/emailVerificationPolicy";

/** Thrown by sign-in (after the password checked out) for unverified accounts. */
export const EMAIL_NOT_VERIFIED_ERROR = "EMAIL_NOT_VERIFIED";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Same storage approach as password reset: the existing VerificationToken
// table, a namespaced identifier, and only a SHA-256 hash of the token.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verificationRequiredFor(user: { emailVerified: Date | null; createdAt: Date }): boolean {
  return isVerificationRequired(user, {
    emailConfigured: isEmailConfigured(),
    envFlag: process.env.REQUIRE_EMAIL_VERIFICATION,
  });
}

/** Creates a fresh link (invalidating older ones) and emails it. */
export async function sendVerificationEmail(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const identifier = `verify:${email}`;
  const token = randomBytes(32).toString("hex");

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token: hashToken(token), expires: new Date(Date.now() + TOKEN_TTL_MS) },
  });

  const url = `${SITE_URL}/verify-email?email=${encodeURIComponent(email)}&token=${token}`;
  await sendEmail({
    to: email,
    subject: "Confirm your Finloraq email address",
    text: `Welcome to Finloraq.\n\nConfirm your email address to finish setting up your account (link expires in 24 hours):\n${url}\n\nIf you didn't create an account, you can ignore this email.`,
    html: `<p>Welcome to Finloraq.</p><p><a href="${url}">Confirm your email address</a> to finish setting up your account (link expires in 24 hours).</p><p>If you didn't create an account, you can ignore this email.</p>`,
  });
}

/** Returns true and marks the user verified when the link is valid. */
export async function consumeVerificationToken(rawEmail: string, token: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  const identifier = `verify:${email}`;

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token: hashToken(token) } },
  });
  if (!record || record.expires < new Date()) return false;

  const user = await findUserByEmail(email);
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  if (!user || !user.isActive) return false;

  if (!user.emailVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  }
  return true;
}
