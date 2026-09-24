import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { nullableImageDataUrlSchema } from "@/lib/branding";

const schema = z.object({
  logoUrl: nullableImageDataUrlSchema.optional(),
  tagline: z.string().max(140).nullable().optional(),
  brandEmail: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().email().max(254).nullable().optional(),
  ),
  brandPhone: z.string().max(40).nullable().optional(),
  brandAddress: z.string().max(300).nullable().optional(),
});

/**
 * Business branding (logo, tagline, contact details) — available on every
 * plan, unlike documentExtraction/eInvoicing/etc. in src/lib/billing/
 * plans.ts, so there's deliberately no plan/feature check here beyond the
 * usual settings:EDIT permission every other company-wide setting uses.
 */
export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();

  try {
    await requirePermission(active.id, "settings", "EDIT");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const before = await prisma.company.findUniqueOrThrow({ where: { id: active.companyId } });

  const data: {
    logoUrl?: string | null;
    tagline?: string | null;
    brandEmail?: string | null;
    brandPhone?: string | null;
    brandAddress?: string | null;
  } = {};
  if (parsed.data.logoUrl !== undefined) data.logoUrl = parsed.data.logoUrl;
  if (parsed.data.tagline !== undefined) data.tagline = parsed.data.tagline?.trim() || null;
  if (parsed.data.brandEmail !== undefined) data.brandEmail = parsed.data.brandEmail;
  if (parsed.data.brandPhone !== undefined) data.brandPhone = parsed.data.brandPhone?.trim() || null;
  if (parsed.data.brandAddress !== undefined) data.brandAddress = parsed.data.brandAddress?.trim() || null;

  const updated = await prisma.company.update({ where: { id: active.companyId }, data });

  await recordAuditEvent({
    companyId: active.companyId,
    userId,
    action: "company.branding_updated",
    entityType: "Company",
    entityId: active.companyId,
    previousValue: {
      hadLogo: Boolean(before.logoUrl),
      tagline: before.tagline,
      brandEmail: before.brandEmail,
      brandPhone: before.brandPhone,
      brandAddress: before.brandAddress,
    },
    newValue: {
      hadLogo: Boolean(updated.logoUrl),
      tagline: updated.tagline,
      brandEmail: updated.brandEmail,
      brandPhone: updated.brandPhone,
      brandAddress: updated.brandAddress,
    },
    source: "web",
  });

  return NextResponse.json({
    logoUrl: updated.logoUrl,
    tagline: updated.tagline,
    brandEmail: updated.brandEmail,
    brandPhone: updated.brandPhone,
    brandAddress: updated.brandAddress,
  });
}
