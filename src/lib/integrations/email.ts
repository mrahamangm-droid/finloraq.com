import { prisma } from "@/lib/db";
import { extractDocument } from "@/lib/ai/extraction";
import { recordAuditEvent } from "@/lib/audit";

/**
 * Inbound email → Document pipeline (spec section 9): an attachment sent
 * to a finance inbox becomes a Document, then goes through the exact same
 * OCR/extraction step a manual upload does (src/lib/ai/extraction.ts) —
 * there's no separate, less-audited path for email-sourced documents.
 *
 * Two things are intentionally simplified for this environment and
 * flagged rather than hidden:
 *  1. Company routing: a production inbound-email setup gives each
 *     company its own address (e.g. invoices+<company-token>@yourdomain)
 *     and verifies the provider's per-request signature (Postmark,
 *     Mailgun, etc. each have their own HMAC scheme). Here the caller
 *     supplies companyId directly and the route checks one shared
 *     INBOUND_EMAIL_WEBHOOK_SECRET — real signature verification is a
 *     TODO once a specific provider is chosen.
 *  2. Acting identity: there's no notion of a "system" user in the
 *     schema yet, so an inbound email acts AS the company's own
 *     COMPANY_ADMIN membership (found here, not passed in) rather than a
 *     dedicated service account — every ingested document is still
 *     audit-logged with action "email.document_ingested" so this is
 *     traceable, but a real deployment should add a proper service
 *     identity per spec section 9's "all communication must be
 *     authenticated and auditable."
 */
export async function processInboundEmailAttachment(input: {
  companyId: string;
  fromAddress: string;
  fileName: string;
  imageBase64: string;
  mimeType: string;
}) {
  const adminMembership = await prisma.companyMembership.findFirst({
    where: { companyId: input.companyId, role: "COMPANY_ADMIN", isActive: true },
  });
  if (!adminMembership) {
    throw new Error("No active Company Admin found to attribute this ingestion to.");
  }

  const { documentId, fields } = await extractDocument({
    companyId: input.companyId,
    membershipId: adminMembership.id,
    userId: adminMembership.userId,
    fileName: input.fileName,
    imageBase64: input.imageBase64,
    mimeType: input.mimeType,
  });

  await recordAuditEvent({
    companyId: input.companyId,
    userId: adminMembership.userId,
    action: "email.document_ingested",
    entityType: "Document",
    entityId: documentId,
    newValue: { fromAddress: input.fromAddress, fileName: input.fileName },
    source: "system",
  });

  return { documentId, fields };
}

export function verifyInboundEmailSecret(providedSecret: string | null): boolean {
  const expected = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  if (!expected) return false; // not configured — refuse, don't silently accept
  return providedSecret === expected;
}
