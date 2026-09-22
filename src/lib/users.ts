import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { CompanyRole } from "@prisma/client";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { enforceSeatLimit } from "@/lib/billing/subscription";

const INVITATION_TTL_DAYS = 7;

/**
 * Enterprise/multi-user controls (spec section 20/26): invite someone by
 * email + role, they accept via a tokenized link, and it becomes a real
 * CompanyMembership under the existing RBAC matrix (src/lib/rbac.ts) —
 * nothing new to authorize, this just populates it. Seat count is
 * enforced against the company's CURRENT plan (src/lib/billing/subscription.ts)
 * so a Starter company can't quietly grow past what it's paying for.
 */
export async function inviteUser(params: {
  companyId: string;
  membershipId: string;
  invitedByUserId: string;
  email: string;
  role: CompanyRole;
}) {
  await requirePermission(params.membershipId, "users", "CREATE");
  await enforceSeatLimit(params.companyId);

  const existingMembership = await prisma.companyMembership.findFirst({
    where: { companyId: params.companyId, isActive: true, user: { email: params.email } },
  });
  if (existingMembership) {
    throw new Error("This person is already a member of this company.");
  }

  const existingInvite = await prisma.invitation.findFirst({
    where: { companyId: params.companyId, email: params.email, status: "PENDING" },
  });
  if (existingInvite) {
    throw new Error("This email already has a pending invitation.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + INVITATION_TTL_DAYS);

  const invitation = await prisma.invitation.create({
    data: {
      companyId: params.companyId,
      email: params.email,
      role: params.role,
      token,
      invitedBy: params.invitedByUserId,
      expiresAt,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.invitedByUserId,
    action: "user.invited",
    entityType: "Invitation",
    entityId: invitation.id,
    newValue: { email: params.email, role: params.role },
  });

  // No email provider is wired to actually deliver this invite (that's
  // the same inbound/outbound email gap Phase 7 flagged for receipts) —
  // the link is surfaced directly in the Users UI for the admin to copy
  // and send themselves until an outbound email adapter exists.
  return invitation;
}

export async function revokeInvitation(params: { companyId: string; membershipId: string; invitationId: string; userId: string }) {
  await requirePermission(params.membershipId, "users", "DELETE");

  const invitation = await prisma.invitation.findFirst({
    where: { id: params.invitationId, companyId: params.companyId, status: "PENDING" },
  });
  if (!invitation) throw new Error("Invitation not found or already resolved.");

  await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "REVOKED" } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "user.invitation_revoked",
    entityType: "Invitation",
    entityId: invitation.id,
  });
}

/** Looks up a pending, unexpired invitation by token — used by the public /invite/[token] page. */
export async function getInvitationByToken(token: string) {
  const invitation = await prisma.invitation.findUnique({ where: { token }, include: { company: true } });
  if (!invitation) return null;
  if (invitation.status !== "PENDING") return { invitation, expired: false, resolved: true as const };
  if (invitation.expiresAt < new Date()) return { invitation, expired: true, resolved: false as const };
  return { invitation, expired: false, resolved: false as const };
}

/**
 * Accepts an invitation for the CURRENTLY SIGNED-IN user, whose session
 * email must match the invite's email — this is the one place account
 * takeover would otherwise be possible, so it's checked strictly rather
 * than trusting the token alone.
 */
export async function acceptInvitation(params: { token: string; userId: string; userEmail: string }) {
  const invitation = await prisma.invitation.findUnique({ where: { token: params.token } });
  if (!invitation || invitation.status !== "PENDING") {
    throw new Error("This invitation is no longer valid.");
  }
  if (invitation.expiresAt < new Date()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    throw new Error("This invitation has expired.");
  }
  if (invitation.email.toLowerCase() !== params.userEmail.toLowerCase()) {
    throw new ForbiddenError("This invitation was sent to a different email address.");
  }

  const existing = await prisma.companyMembership.findUnique({
    where: { companyId_userId: { companyId: invitation.companyId, userId: params.userId } },
  });
  if (existing) {
    if (!existing.isActive) {
      await prisma.companyMembership.update({ where: { id: existing.id }, data: { isActive: true, role: invitation.role } });
    }
  } else {
    await enforceSeatLimit(invitation.companyId);
    await prisma.companyMembership.create({
      data: { companyId: invitation.companyId, userId: params.userId, role: invitation.role },
    });
  }

  await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } });

  await recordAuditEvent({
    companyId: invitation.companyId,
    userId: params.userId,
    action: "user.invitation_accepted",
    entityType: "Invitation",
    entityId: invitation.id,
  });

  return invitation.companyId;
}

export async function listMembers(companyId: string) {
  return prisma.companyMembership.findMany({
    where: { companyId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function listPendingInvitations(companyId: string) {
  return prisma.invitation.findMany({
    where: { companyId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}

export async function changeMemberRole(params: { companyId: string; membershipId: string; targetMembershipId: string; newRole: CompanyRole; userId: string }) {
  await requirePermission(params.membershipId, "users", "EDIT");

  const target = await prisma.companyMembership.findFirst({ where: { id: params.targetMembershipId, companyId: params.companyId } });
  if (!target) throw new Error("Member not found.");
  if (target.role === "COMPANY_ADMIN" && params.newRole !== "COMPANY_ADMIN") {
    const otherAdmins = await prisma.companyMembership.count({
      where: { companyId: params.companyId, role: "COMPANY_ADMIN", isActive: true, id: { not: target.id } },
    });
    if (otherAdmins === 0) {
      throw new Error("Can't demote the last Company Admin — promote someone else first.");
    }
  }

  const updated = await prisma.companyMembership.update({ where: { id: target.id }, data: { role: params.newRole } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "user.role_changed",
    entityType: "CompanyMembership",
    entityId: target.id,
    previousValue: { role: target.role },
    newValue: { role: params.newRole },
  });

  return updated;
}

export async function deactivateMember(params: { companyId: string; membershipId: string; targetMembershipId: string; userId: string }) {
  await requirePermission(params.membershipId, "users", "DELETE");

  const target = await prisma.companyMembership.findFirst({ where: { id: params.targetMembershipId, companyId: params.companyId } });
  if (!target) throw new Error("Member not found.");
  if (target.id === params.membershipId) {
    throw new Error("You can't deactivate your own membership.");
  }
  if (target.role === "COMPANY_ADMIN") {
    const otherAdmins = await prisma.companyMembership.count({
      where: { companyId: params.companyId, role: "COMPANY_ADMIN", isActive: true, id: { not: target.id } },
    });
    if (otherAdmins === 0) {
      throw new Error("Can't deactivate the last Company Admin.");
    }
  }

  const updated = await prisma.companyMembership.update({ where: { id: target.id }, data: { isActive: false } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "user.deactivated",
    entityType: "CompanyMembership",
    entityId: target.id,
  });

  return updated;
}
