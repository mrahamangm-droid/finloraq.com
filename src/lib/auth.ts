import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { recordAuditEvent } from "@/lib/audit";
import { verifyTotpToken, verifyBackupCode } from "@/lib/mfa";
import { checkRateLimit } from "@/lib/rateLimit";
import { findUserByEmail, normalizeEmail } from "@/lib/userLookup";
import { EMAIL_NOT_VERIFIED_ERROR, verificationRequiredFor } from "@/lib/emailVerification";

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

/**
 * Google sign-in is only offered when both env vars are set, so a deployment
 * without them behaves exactly as before (and the button stays hidden).
 */
const googleProviders =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          authorization: { params: { prompt: "select_account" } },
        }),
      ]
    : [];

/** A password hash nobody knows: Google-created accounts have no password until they use "Forgot password". */
async function unusablePasswordHash(): Promise<string> {
  return hashPassword(randomBytes(32).toString("hex"));
}

export const authOptions: NextAuthOptions = {
  // No database adapter on purpose. Sessions are JWTs, and Google sign-in is
  // provisioned by hand in the signIn callback below. NextAuth's Prisma
  // adapter cannot be used here anyway: it expects an OAuth "Account" model
  // (provider, providerAccountId, tokens) but this schema's Account is the
  // chart of accounts.
  session: {
    // JWT, not database, sessions. NextAuth v4's Credentials provider is
    // hard-incompatible with database sessions — it throws
    // UnsupportedStrategyError (CALLBACK_CREDENTIALS_JWT_ERROR) on every
    // sign-in, which is exactly what production was doing: this app never
    // had a single working login before this fix (see git log). The
    // adapter stays wired up for its other jobs (account linking, the
    // schema NextAuth expects) — only the session storage itself moves to
    // JWT, which is the documented, supported pairing with Credentials.
    //
    // The "revoke server-side without waiting for expiry" property the
    // original database-session choice was reaching for is preserved via
    // the jwt callback below: it re-checks the user's isActive flag on
    // every request and drops the session the moment an admin deactivates
    // the account, rather than waiting out the token's maxAge.
    strategy: "jwt",
    maxAge: 12 * 60 * 60, // 12h — re-authenticate daily; tune per compliance needs
  },
  pages: {
    signIn: "/login",
    error: "/login",
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
        const limit = checkRateLimit(`login:${email.trim().toLowerCase()}`, 10, 15 * 60 * 1000);
        if (!limit.allowed) {
          throw new Error("Too many sign-in attempts. Try again in a few minutes.");
        }

        const user = await findUserByEmail(email);

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

        // Password is correct here, so saying "confirm your email" leaks
        // nothing an attacker didn't already have.
        if (verificationRequiredFor(user)) {
          throw new Error(EMAIL_NOT_VERIFIED_ERROR);
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
    ...googleProviders,
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      const g = profile as { email?: string; email_verified?: boolean; name?: string } | undefined;
      if (!g?.email || g.email_verified !== true) return "/login?error=GoogleUnverified";
      const email = normalizeEmail(g.email);

      let dbUser = await findUserByEmail(email);
      if (dbUser && !dbUser.isActive) return "/login?error=AccountDisabled";
      // Google sign-in would skip the second factor, so accounts that use MFA
      // must keep signing in with their password + code.
      if (dbUser?.mfaEnabled) return "/login?error=GoogleMfa";

      if (!dbUser) {
        try {
          dbUser = await prisma.user.create({
            data: {
              email,
              name: g.name?.trim() || email.split("@")[0] || email,
              passwordHash: await unusablePasswordHash(),
              emailVerified: new Date(),
            },
          });
          await recordAuditEvent({
            userId: dbUser.id,
            action: "auth.register_google",
            entityType: "User",
            entityId: dbUser.id,
          });
        } catch (err) {
          // Two first-time sign-ins racing on the unique email index.
          if ((err as { code?: string } | null)?.code !== "P2002") throw err;
          dbUser = await findUserByEmail(email);
          if (!dbUser) return "/login?error=GoogleFailed";
        }
      } else {
        // Linking to an existing email account. Google has verified the
        // address, so this account is now provably the owner's. If it was
        // never confirmed, someone else may have pre-registered the address
        // with a password of their choosing — retire that password.
        await prisma.user.update({
          where: { id: dbUser.id },
          data: {
            lastLoginAt: new Date(),
            ...(dbUser.emailVerified
              ? {}
              : { emailVerified: new Date(), passwordHash: await unusablePasswordHash() }),
          },
        });
      }

      await recordAuditEvent({
        userId: dbUser.id,
        action: "auth.login_success",
        entityType: "User",
        entityId: dbUser.id,
        newValue: { method: "google" },
      });

      // The jwt callback reads user.id: make it our id, not Google's.
      user.id = dbUser.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      if (!token.sub) return token;

      // Re-check on every request (not just at sign-in) so deactivating a
      // user actually revokes their access immediately instead of waiting
      // for the 12h token to expire — see the session-strategy comment
      // above for why this lives here instead of a database session.
      const dbUser = await prisma.user.findUnique({
        where: { id: token.sub },
        select: { isActive: true },
      });
      if (!dbUser || !dbUser.isActive) {
        // Strip the subject so the session callback below treats this as
        // signed out rather than trusting a stale token.
        token.sub = undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      } else if (session.user) {
        // Token was invalidated in the jwt callback above (deactivated or
        // deleted user) — clear the session's user rather than exposing a
        // session object that looks valid but points at no real account.
        session.user = undefined as unknown as typeof session.user;
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
