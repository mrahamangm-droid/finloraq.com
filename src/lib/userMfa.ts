import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import {
  generateTotpSecret,
  buildOtpAuthUri,
  verifyTotpToken,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from "@/lib/mfa";

/**
 * Account-level MFA management (spec section 21). Deliberately NOT
 * company-scoped like the rest of the app's data — a User can belong to
 * multiple Companies, but MFA protects the login itself, once, regardless
 * of which company they're acting as afterward.
 *
 * Setup is two steps by design (start → confirm), not one: a secret is
 * generated and stored, but mfaEnabled only flips to true once the user
 * proves they actually scanned it into a real authenticator by supplying
 * a valid code back — otherwise a typo'd/never-scanned secret would lock
 * the account out at next login with no way in.
 */
export async function startMfaSetup(userId: string, accountEmail: string) {
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } });

  return {
    secret,
    otpauthUri: buildOtpAuthUri({ secret, accountEmail }),
  };
}

export async function confirmMfaSetup(userId: string, token: string): Promise<string[]> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaSecret) {
    throw new Error("No MFA setup in progress — call setup again.");
  }
  if (!verifyTotpToken(user.mfaSecret, token)) {
    throw new Error("That code didn't match. Check your authenticator app and try again.");
  }

  // Replace any old backup codes (re-enabling MFA invalidates previous ones).
  await prisma.mfaBackupCode.deleteMany({ where: { userId } });
  const codes = generateBackupCodes();
  await prisma.mfaBackupCode.createMany({
    data: await Promise.all(codes.map(async (code) => ({ userId, codeHash: await hashBackupCode(code) }))),
  });

  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });

  await recordAuditEvent({
    userId,
    action: "auth.mfa_enabled",
    entityType: "User",
    entityId: userId,
  });

  return codes; // shown to the user exactly once
}

export async function disableMfa(userId: string, token: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaEnabled || !user.mfaSecret) {
    throw new Error("MFA isn't enabled.");
  }

  const totpOk = verifyTotpToken(user.mfaSecret, token);
  let backupOk = false;
  if (!totpOk) {
    const codes = await prisma.mfaBackupCode.findMany({ where: { userId, usedAt: null } });
    for (const candidate of codes) {
      if (await verifyBackupCode(candidate.codeHash, token)) {
        backupOk = true;
        break;
      }
    }
  }
  if (!totpOk && !backupOk) {
    throw new Error("That code didn't match. MFA was not disabled.");
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } }),
    prisma.mfaBackupCode.deleteMany({ where: { userId } }),
  ]);

  await recordAuditEvent({
    userId,
    action: "auth.mfa_disabled",
    entityType: "User",
    entityId: userId,
  });
}

export async function getMfaStatus(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const remainingBackupCodes = user.mfaEnabled
    ? await prisma.mfaBackupCode.count({ where: { userId, usedAt: null } })
    : 0;
  return { enabled: user.mfaEnabled, remainingBackupCodes };
}
