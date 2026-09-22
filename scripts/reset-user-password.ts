/**
 * Admin utility: reset an existing user's password.
 *
 * There is no self-service "forgot password" flow yet (no outbound email
 * provider is wired up — see .env.example), so this is the supported way
 * to recover an account: set DATABASE_URL to the target environment and
 * run it directly. It reuses src/lib/password.ts's hashPassword() and
 * isPasswordStrong(), so the resulting hash is guaranteed compatible with
 * src/lib/auth.ts's authorize() — never write a passwordHash by hand.
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/reset-user-password.ts --email user@example.com --password 'NewPassword123!'
 *
 * Safety:
 *   - Refuses to run without both --email and --password.
 *   - Enforces the same password strength rule as registration.
 *   - Errors (not silently no-ops) if no user with that email exists —
 *     this is a reset tool, not an account-creation tool.
 *   - Never logs the password itself.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword, isPasswordStrong } from "../src/lib/password";

const prisma = new PrismaClient();

function parseArgs(argv: string[]): { email?: string; password?: string } {
  const out: { email?: string; password?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--email") out.email = argv[++i];
    else if (argv[i] === "--password") out.password = argv[++i];
  }
  return out;
}

async function main() {
  const { email, password } = parseArgs(process.argv.slice(2));

  if (!email || !password) {
    console.error("Usage: npx tsx scripts/reset-user-password.ts --email <email> --password <newPassword>");
    process.exit(1);
  }

  const strength = isPasswordStrong(password);
  if (!strength.ok) {
    console.error(`Rejected: ${strength.reason}`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email} — this tool only resets existing accounts.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  console.log(`Password reset for ${email} (user id ${user.id}). isActive=${user.isActive}, mfaEnabled=${user.mfaEnabled}.`);
  if (!user.isActive) {
    console.warn("Note: this account is inactive (isActive=false) — the password is reset but sign-in will still be rejected until it's reactivated.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
