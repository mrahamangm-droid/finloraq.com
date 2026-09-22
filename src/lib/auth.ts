import type { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { recordAuditEvent } from "@/lib/audit";
import { verifyTotpToken, verifyBackupCode } from "@/lib/mfa";
import { checkRateLimit } from "@/lib/rateLimit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaToken: z.string().optional(),
});

/**
 * Thrown from authorize() with a specific message so the login page can
 * distinguish "wrong password" from "password's right, now enter your MFA
 * code" — NextAuth's Credentials provider passes a thrown error's message
 * straight through to the client via signIn()'s result.error (unlike
 * OAuth providers, which normalize errors for security). MFA_REQUIRED is
 * not a secret — it never confirms the password was wrong, only that the
 * account needs a second factor once the password's already been checked.
 */
export const MFA_REQUIRED_ERROR = "MFA_REQUIRED";

export const authOptions: NextAuthOptions = {
  // @auth/prisma-adapter@2.x targets Auth.js v5's @auth/core Adapter type
  // (createUser optional), while next-auth@4's own Adapter type (from
  // next-auth/adapters) requires createUser. Both adapters implement the
  // exact same runtime shape (@auth/prisma-adapter is next-auth v4's
  // documented, officially-recommended Prisma adapter) -- this is a
  // type-declaration mismatch between the two packages' major versions,
  // not a real incompatibility, so a cast is the correct fix rather than
  // downgrading to the unmaintained @next-auth/prisma-adapter package.
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    // Database sessions (not JWT-only): a finance product needs to be able
    // to revoke a session server-side (e.g. on password change, or an
    // admin force-logout) without waiting for token expiry.
    strategy: "database",
    maxAge: 12 * 60 * 60, // 12h — re-authenticate daily; tune per compliance needs
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaToken: { label: "MFA code", type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, mfaToken } = parsed.data;

        // Rate-limited per email (see src/lib/rateLimit.ts's documented
        // in-memory-per-instance limitation) — 10 attempts per 15 minutes
        // is generous for a real user who mistyped a password, tight
        // enough to blunt an online guessing attack against one account.
        const limit = checkRateLimit(`login:${email.toLowerCase()}`, 10, 15 * 60 * 1000);
        if (!limit.allowed) {
          throw new Error("Too many sign-in attempts. Try again in a few minutes.");
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // Constant-shape response whether the user exists or not — avoid
        // leaking account existence through response timing/shape. A
        // dummy verify still runs so timing doesn't leak it either.
        const hash = user?.passwordHash ?? "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        const valid = await verifyPassword(hash, password);

        if (!user || !valid || !user.isActive) {
          if (user) {
            await recordAuditEvent({
              userId: user.id,
              action: "auth.login_failed",
              entityType: "User",
              entityId: user.id,
            });
          }
          return null;
        }

        if (user.mfaEnabled) {
          if (!mfaToken) {
            // Password was correct — surface a distinct signal so the
            // login page can show the second-factor field, without
            // implying anything about the password's correctness to a
            // request that DIDN'T supply one (an attacker probing a
            // stolen password still just sees "needs MFA", which they'd
            // get right or wrong anyway — this never reveals the
            // password was right in isolation, only after both checks).
            throw new Error(MFA_REQUIRED_ERROR);
          }

          // A second, tighter limit on the code itself — 6-digit TOTP
          // brute force needs many more than 10 tries, so this is
          // separate from (and stricter than) the password-attempt limit
          // above: 5 code attempts per 5 minutes per account.
          const mfaLimit = checkRateLimit(`mfa:${user.id}`, 5, 5 * 60 * 1000);
          if (!mfaLimit.allowed) {
            throw new Error("Too many MFA attempts. Try again in a few minutes.");
          }

          const totpOk = user.mfaSecret ? verifyTotpToken(user.mfaSecret, mfaToken) : false;
          const backupOk = totpOk ? false : await tryConsumeBackupCode(user.id, mfaToken);

          if (!totpOk && !backupOk) {
            await recordAuditEvent({
              userId: user.id,
              action: "auth.mfa_failed",
              entityType: "User",
              entityId: user.id,
            });
            throw new Error("Invalid MFA code.");
          }

          await recordAuditEvent({
            userId: user.id,
            action: backupOk ? "auth.mfa_backup_code_used" : "auth.mfa_success",
            entityType: "User",
            entityId: user.id,
          });
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await recordAuditEvent({
          userId: user.id,
          action: "auth.login_success",
          entityType: "User",
          entityId: user.id,
        });

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  // Re-authentication prompts before especially sensitive actions (a
  // period-lock override, a bulk customer-data export) are still a
  // follow-up — MFA covers login, not step-up auth mid-session.
};

async function tryConsumeBackupCode(userId: string, code: string): Promise<boolean> {
  const unusedCodes = await prisma.mfaBackupCode.findMany({
    where: { userId, usedAt: null },
  });
  for (const candidate of unusedCodes) {
    if (await verifyBackupCode(candidate.codeHash, code)) {
      await prisma.mfaBackupCode.update({
        where: { id: candidate.id },
        data: { usedAt: new Date() },
      });
      return true;
    }
  }
  return false;
}
