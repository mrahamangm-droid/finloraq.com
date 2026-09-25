import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";

/**
 * Files an admin attaches to a member's record on Users & Roles (an ID
 * document, a signed contract, a certificate — whatever the company
 * wants on file for that person). This is separate from the Document
 * model (src/lib/ai/extraction.ts), which is the Phase 6 receipt/bill
 * OCR pipeline.
 *
 * No object storage is configured yet (see src/lib/branding.ts's
 * identical note for User.avatarUrl/Company.logoUrl, and the
 * OBJECT_STORAGE_* vars reserved in .env.example) — this stores the
 * bytes as a `data:` URL directly in the MemberFile row. Fine at the
 * size these attachments actually need to be; the cap below is what
 * keeps it fine. If that cap is ever too small, the fix is a real
 * storageKey on this model (like Document's, once object storage is
 * wired up) — not raising the cap on base64-in-Postgres.
 */
export const MAX_MEMBER_FILE_BYTES = 5_000_000; // 5MB raw, before base64 encoding

/**
 * Every list/page view below selects everything EXCEPT dataUrl. A file's
 * base64 content can be several MB of text — including it in a list
 * response (e.g. every member's files, rendered on one page) would bloat
 * that response by however many files exist, whether or not anyone is
 * looking at them. The actual bytes are only ever fetched one file at a
 * time, by id, via getMemberFileContent() — which is what the download
 * route (src/app/api/member-files/[id]/route.ts) calls.
 */
const METADATA_SELECT = {
  id: true,
  companyId: true,
  membershipId: true,
  title: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toDataUrl(mimeType: string, bytes: Buffer): string {
  return `data:${mimeType || "application/octet-stream"};base64,${bytes.toString("base64")}`;
}

function assertUnderSizeCap(file: File) {
  if (file.size === 0) throw new Error("Choose a file to upload.");
  if (file.size > MAX_MEMBER_FILE_BYTES) {
    throw new Error(`That file is too large — the limit is ${Math.floor(MAX_MEMBER_FILE_BYTES / 1_000_000)}MB.`);
  }
}

async function requireMembershipInCompany(companyId: string, membershipId: string) {
  const membership = await prisma.companyMembership.findFirst({ where: { id: membershipId, companyId } });
  if (!membership) throw new Error("Member not found.");
  return membership;
}

/** Loads a MemberFile, scoped to companyId so one company can never touch another's files. */
async function requireOwnFile(companyId: string, fileId: string) {
  const file = await prisma.memberFile.findFirst({ where: { id: fileId, companyId } });
  if (!file) throw new Error("File not found.");
  return file;
}

export async function listMemberFiles(companyId: string, membershipId: string) {
  return prisma.memberFile.findMany({
    where: { companyId, membershipId },
    select: METADATA_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/** Every member's files for the company in one query, for the Users & Roles list (avoids one query per row). Metadata only — see METADATA_SELECT. */
export async function listMemberFilesForCompany(companyId: string) {
  const files = await prisma.memberFile.findMany({
    where: { companyId },
    select: METADATA_SELECT,
    orderBy: { createdAt: "desc" },
  });
  const byMembership = new Map<string, typeof files>();
  for (const file of files) {
    const bucket = byMembership.get(file.membershipId);
    if (bucket) bucket.push(file);
    else byMembership.set(file.membershipId, [file]);
  }
  return byMembership;
}

/**
 * The one place a file's actual bytes are read — used only by the
 * download route, and only for one file at a time. No module-level
 * permission check here: the Users & Roles page itself doesn't gate
 * VIEW either (any signed-in member of the company can already see the
 * member list, roles and file titles when they load that page — see
 * page.tsx), so this matches that existing bar rather than inventing a
 * stricter one just for the download link. companyId scoping is what
 * actually matters here: it keeps this to files that belong to the
 * caller's own company.
 */
export async function getMemberFileContent(params: { companyId: string; fileId: string }) {
  const file = await prisma.memberFile.findFirst({ where: { id: params.fileId, companyId: params.companyId } });
  if (!file) throw new Error("File not found.");
  return file;
}

export async function uploadMemberFile(params: {
  companyId: string;
  membershipId: string; // the acting member (permission check)
  targetMembershipId: string; // whose record the file is attached to
  title: string;
  file: File;
  userId: string;
}) {
  await requirePermission(params.membershipId, "users", "CREATE");
  await requireMembershipInCompany(params.companyId, params.targetMembershipId);
  assertUnderSizeCap(params.file);

  const title = params.title.trim() || params.file.name;
  const bytes = Buffer.from(await params.file.arrayBuffer());

  const created = await prisma.memberFile.create({
    data: {
      companyId: params.companyId,
      membershipId: params.targetMembershipId,
      title,
      fileName: params.file.name,
      mimeType: params.file.type || "application/octet-stream",
      sizeBytes: params.file.size,
      dataUrl: toDataUrl(params.file.type, bytes),
      uploadedBy: params.userId,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "user.file_uploaded",
    entityType: "MemberFile",
    entityId: created.id,
    newValue: { membershipId: params.targetMembershipId, title, fileName: params.file.name, sizeBytes: params.file.size },
  });

  return created;
}

/** Swaps a file's content (and name/type/size) while keeping the same record — an in-place "new version", not a new attachment. */
export async function replaceMemberFileContent(params: {
  companyId: string;
  membershipId: string;
  fileId: string;
  file: File;
  userId: string;
}) {
  await requirePermission(params.membershipId, "users", "EDIT");
  const existing = await requireOwnFile(params.companyId, params.fileId);
  assertUnderSizeCap(params.file);

  const bytes = Buffer.from(await params.file.arrayBuffer());

  const updated = await prisma.memberFile.update({
    where: { id: existing.id },
    data: {
      fileName: params.file.name,
      mimeType: params.file.type || "application/octet-stream",
      sizeBytes: params.file.size,
      dataUrl: toDataUrl(params.file.type, bytes),
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "user.file_replaced",
    entityType: "MemberFile",
    entityId: existing.id,
    previousValue: { fileName: existing.fileName, sizeBytes: existing.sizeBytes },
    newValue: { fileName: params.file.name, sizeBytes: params.file.size },
  });

  return updated;
}

/** Renames a file's display title only — the underlying bytes/fileName are untouched. */
export async function renameMemberFile(params: {
  companyId: string;
  membershipId: string;
  fileId: string;
  title: string;
  userId: string;
}) {
  await requirePermission(params.membershipId, "users", "EDIT");
  const existing = await requireOwnFile(params.companyId, params.fileId);

  const title = params.title.trim();
  if (!title) throw new Error("Title can't be empty.");

  const updated = await prisma.memberFile.update({ where: { id: existing.id }, data: { title } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "user.file_renamed",
    entityType: "MemberFile",
    entityId: existing.id,
    previousValue: { title: existing.title },
    newValue: { title },
  });

  return updated;
}

export async function deleteMemberFile(params: {
  companyId: string;
  membershipId: string;
  fileId: string;
  userId: string;
}) {
  await requirePermission(params.membershipId, "users", "DELETE");
  const existing = await requireOwnFile(params.companyId, params.fileId);

  await prisma.memberFile.delete({ where: { id: existing.id } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "user.file_deleted",
    entityType: "MemberFile",
    entityId: existing.id,
    previousValue: { title: existing.title, fileName: existing.fileName },
  });
}
