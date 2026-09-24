import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { nullableImageDataUrlSchema } from "@/lib/branding";

const schema = z.object({ imageDataUrl: nullableImageDataUrlSchema });

/**
 * A profile photo is personal, not company data — any signed-in member
 * can set their own regardless of company role (unlike the branding
 * fields in /api/settings/branding, which require settings:EDIT).
 */
export async function POST(req: Request) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid image." }, { status: 400 });
  }

  const before = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  const updated = await prisma.user.update({
    where: { id: ctx.userId },
    data: { avatarUrl: parsed.data.imageDataUrl },
  });

  await recordAuditEvent({
    companyId: ctx.active?.companyId ?? null,
    userId: ctx.userId,
    action: "user.avatar_updated",
    entityType: "User",
    entityId: ctx.userId,
    previousValue: { hadAvatar: Boolean(before.avatarUrl) },
    newValue: { hadAvatar: Boolean(updated.avatarUrl) },
    source: "web",
  });

  return NextResponse.json({ avatarUrl: updated.avatarUrl });
}
