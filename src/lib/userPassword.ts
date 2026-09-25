import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword, isPasswordStrong } from "@/lib/password";
import { recordAuditEvent } from "@/lib/audit";

/** Thrown when the caller's supplied "current password" doesn't match. */
export class WrongPasswordError extends Error {}

/** Thrown when the requested new password fails isPasswordStrong(). */
export class WeakPasswordError extends Error {}

/**
 * Self-service password change from inside the app (Settings → Change
 * Password) — distinct from the forgot-password flow (src/app/api/auth/
 * forgot-password, reset-password), which is for someone who is locked
 * out and can't sign in at all. This one requires the caller to already
 * be signed in *and* re-enter their current password, so a hijacked or
 * left-open session can't silently lock the real owner out.
 */
export async function changePassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  ipAddress?: string | null;
}): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: params.userId } });

  const currentOk = await verifyPassword(user.passwordHash, params.currentPassword);
  if (!currentOk) {
    throw new WrongPasswordError("Current password is incorrect.");
  }

  const strength = isPasswordStrong(params.newPassword);
  if (!strength.ok) {
    throw new WeakPasswordError(strength.reason);
  }

  const passwordHash = await hashPassword(params.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  await recordAuditEvent({
    userId: user.id,
    action: "auth.password_changed",
    entityType: "User",
    entityId: user.id,
    ipAddress: params.ipAddress,
  });
}
