import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { recordAuditEvent } from "@/lib/audit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
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
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

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
  // TODO(Phase 9 security hardening): add MFA challenge step, rate limiting
  // on the credentials provider (e.g. via a Redis-backed limiter keyed on
  // email+IP), and re-authentication prompts before sensitive actions
  // (posting a period-lock override, exporting all customer data, etc.)
};
