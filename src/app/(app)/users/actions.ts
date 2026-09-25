"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import { inviteUser, revokeInvitation, changeMemberRole, deactivateMember } from "@/lib/users";
import { uploadMemberFile, replaceMemberFileContent, renameMemberFile, deleteMemberFile } from "@/lib/memberFiles";
import type { CompanyRole } from "@prisma/client";

export async function inviteUserAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  await inviteUser({
    companyId: active.companyId,
    membershipId: active.id,
    invitedByUserId: userId,
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    role: formData.get("role") as CompanyRole,
  });

  revalidatePath("/users");
}

export async function revokeInvitationAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  await revokeInvitation({
    companyId: active.companyId,
    membershipId: active.id,
    invitationId: String(formData.get("invitationId")),
    userId,
  });

  revalidatePath("/users");
}

export async function changeMemberRoleAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  await changeMemberRole({
    companyId: active.companyId,
    membershipId: active.id,
    targetMembershipId: String(formData.get("membershipId")),
    newRole: formData.get("role") as CompanyRole,
    userId,
  });

  revalidatePath("/users");
}

export async function deactivateMemberAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  await deactivateMember({
    companyId: active.companyId,
    membershipId: active.id,
    targetMembershipId: String(formData.get("membershipId")),
    userId,
  });

  revalidatePath("/users");
}

export async function uploadMemberFileAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  await uploadMemberFile({
    companyId: active.companyId,
    membershipId: active.id,
    targetMembershipId: String(formData.get("membershipId")),
    title: String(formData.get("title") ?? ""),
    file: formData.get("file") as File,
    userId,
  });

  revalidatePath("/users");
}

export async function replaceMemberFileAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  await replaceMemberFileContent({
    companyId: active.companyId,
    membershipId: active.id,
    fileId: String(formData.get("fileId")),
    file: formData.get("file") as File,
    userId,
  });

  revalidatePath("/users");
}

export async function renameMemberFileAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  await renameMemberFile({
    companyId: active.companyId,
    membershipId: active.id,
    fileId: String(formData.get("fileId")),
    title: String(formData.get("title") ?? ""),
    userId,
  });

  revalidatePath("/users");
}

export async function deleteMemberFileAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  await deleteMemberFile({
    companyId: active.companyId,
    membershipId: active.id,
    fileId: String(formData.get("fileId")),
    userId,
  });

  revalidatePath("/users");
}
