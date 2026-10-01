import { prisma } from "@/lib/db";
import { documentStorageKey, getDocumentStorage } from "@/lib/storage/documentStorage";

/**
 * Stores an uploaded document's original bytes and points Document.storageKey
 * at them. Called right after the Document row exists (its id is part of the
 * key) and BEFORE any AI call, so a storage failure never costs an AI
 * extraction or leaves an extracted document whose source silently vanished.
 *
 * - Storage not configured: returns stored: false and leaves the "unstored:"
 *   key in place; callers pass that on so the UI says the file wasn't kept.
 * - Storage configured but the upload fails: marks the document FAILED and
 *   throws — the caller's request fails loudly instead of pretending.
 */
export async function retainDocumentFile(doc: { id: string; companyId: string; fileName: string; mimeType: string }, fileBase64: string) {
  const storage = getDocumentStorage();
  if (!storage) return { stored: false as const, provider: null };

  const key = documentStorageKey(doc.companyId, doc.id, doc.fileName);
  try {
    await storage.put(key, Buffer.from(fileBase64, "base64"), doc.mimeType || "application/octet-stream");
  } catch (err) {
    console.error("[documentStorage] upload failed", err);
    await prisma.document.update({ where: { id: doc.id }, data: { status: "FAILED" } });
    throw new Error("The file couldn't be saved to document storage, so nothing was extracted. Please try again.");
  }
  await prisma.document.update({ where: { id: doc.id }, data: { storageKey: key } });
  return { stored: true as const, provider: storage.provider };
}
