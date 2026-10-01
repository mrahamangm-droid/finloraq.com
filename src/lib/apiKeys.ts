import crypto from "node:crypto";
import type { CompanyRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { planDefinition } from "@/lib/billing/plans";

/**
 * API keys for the public REST API (/api/v1), sold as "API access" on
 * Professional and above.
 *
 * - A key is 32 random bytes (256 bits), so a fast SHA-256 is the right
 *   lookup hash: there is nothing to brute-force, unlike a password. Only
 *   the hash is stored; the raw key is returned once, by createApiKey().
 * - A key acts AS the member who created it, CAPPED by its own role. A
 *   request is allowed only if both the member (live role, overrides,
 *   still active) and the key's role permit it — see apiCan() in
 *   src/lib/api/v1.ts. Demoting or deactivating that member narrows or
 *   disables the key at once; no key can do what a signed-in user of its
 *   role couldn't.
 */

export const API_KEY_PREFIX = "fq_";

/** Roles a key may be capped to: read-only, or read + create drafts. */
export const API_KEY_ROLES = ["AUDITOR", "ACCOUNTANT"] as const satisfies readonly CompanyRole[];
export type ApiKeyRole = (typeof API_KEY_ROLES)[number];

export class ApiKeyError extends Error {}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 8), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

/** Cheap shape check before touching the database. */
export function looksLikeApiKey(key: string): boolean {
  return /^fq_[A-Za-z0-9_-]{43}$/.test(key);
}

export async function companyHasApiAccess(companyId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { companyId }, select: { plan: true } });
  return !!sub && planDefinition(sub.plan).features.apiAccess;
}

interface Actor {
  companyId: string;
  membershipId: string;
  userId: string;
}

/** Managing keys is company configuration: settings:EDIT (Company Admin by default). */
export async function createApiKey(params: Actor & { label: string; role: ApiKeyRole }) {
  await requirePermission(params.membershipId, "settings", "EDIT");
  if (!(await companyHasApiAccess(params.companyId))) {
    throw new ApiKeyError("API access is included on the Professional plan and above. Upgrade to create API keys.");
  }
  const label = params.label.trim();
  if (!label || label.length > 80) throw new ApiKeyError("Give the key a name (up to 80 characters).");
  if (!API_KEY_ROLES.includes(params.role)) throw new ApiKeyError("Unsupported key role.");

  const { key, prefix, hash } = generateApiKey();
  const apiKey = await prisma.apiKey.create({
    data: {
      companyId: params.companyId,
      membershipId: params.membershipId,
      label,
      role: params.role,
      prefix,
      keyHash: hash,
      createdBy: params.userId,
    },
  });
  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "api_key.created",
    entityType: "ApiKey",
    entityId: apiKey.id,
    newValue: { label, role: params.role, prefix },
  });
  return { key, apiKey };
}

export async function listApiKeys(companyId: string) {
  return prisma.apiKey.findMany({
    where: { companyId },
    orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    select: {
      id: true, label: true, role: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true,
      membership: { select: { user: { select: { name: true, email: true } } } },
    },
  });
}

export async function revokeApiKey(params: Actor & { apiKeyId: string }) {
  await requirePermission(params.membershipId, "settings", "EDIT");
  const key = await prisma.apiKey.findFirst({ where: { id: params.apiKeyId, companyId: params.companyId } });
  if (!key) throw new NotFoundError("API key not found.");
  if (key.revokedAt) return key;
  const revoked = await prisma.apiKey.update({
    where: { id: key.id },
    data: { revokedAt: new Date(), revokedBy: params.userId },
  });
  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "api_key.revoked",
    entityType: "ApiKey",
    entityId: key.id,
    previousValue: { label: key.label, prefix: key.prefix },
  });
  return revoked;
}
