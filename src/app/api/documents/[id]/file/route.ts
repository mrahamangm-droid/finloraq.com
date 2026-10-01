import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { companyPrefix, getDocumentStorage, isStoredKey } from "@/lib/storage/documentStorage";

// Types a browser may render inline. Anything else (HTML, SVG, office files…)
// is forced to download, so an uploaded file can never run script on our origin.
const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "image/heic"]);

/**
 * Streams a document's original file. Private blobs have no public URL, so
 * this route is the only way to read one: the document must belong to the
 * caller's active company (tenant lookup), the caller needs documents:VIEW,
 * and the stored key must sit under that company's prefix — a second,
 * independent check that a mis-pointed key can't serve another tenant's file.
 */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active } = await requireTenantContext();
  if (!(await can(active.id, "documents", "VIEW"))) {
    return NextResponse.json({ error: "Missing VIEW on documents." }, { status: 403 });
  }
  const doc = await prisma.document.findFirst({
    where: { id, companyId: active.companyId },
    select: { fileName: true, mimeType: true, storageKey: true },
  });
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  if (!isStoredKey(doc.storageKey)) {
    return NextResponse.json(
      { error: "The original file for this document wasn't retained (no document storage was configured when it was uploaded)." },
      { status: 404 }
    );
  }
  if (!doc.storageKey.startsWith(companyPrefix(active.companyId))) {
    console.error(`[documents/file] key outside company prefix for document ${id}`);
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  const storage = getDocumentStorage();
  if (!storage) {
    return NextResponse.json({ error: "Document storage isn't configured on this deployment." }, { status: 503 });
  }
  const file = await storage.get(doc.storageKey);
  if (!file) return NextResponse.json({ error: "The stored file is missing." }, { status: 404 });

  const type = (doc.mimeType || "application/octet-stream").toLowerCase();
  const inline = INLINE_TYPES.has(type) && new URL(req.url).searchParams.get("download") !== "1";
  const asciiName = doc.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(file.body, {
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      "Cache-Control": "private, no-store",
      ...(file.size ? { "Content-Length": String(file.size) } : {}),
    },
  });
}
