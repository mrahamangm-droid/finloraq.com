import { del, get, put } from "@vercel/blob";

/**
 * Object storage for uploaded source documents (receipts, bills, customer
 * files), so the original is retained — UAE VAT record-keeping expects the
 * source tax invoice to be kept, not just numbers read off it.
 *
 * Same dev/live pattern as src/lib/ai/provider.ts: getDocumentStorage()
 * returns null when BLOB_READ_WRITE_TOKEN isn't set, and every caller says
 * so explicitly (the Document keeps an "unstored:" key, the upload response
 * carries stored: false, the UI and Settings show it) — never a silent
 * no-op that looks like the file was kept.
 *
 * Blobs are PRIVATE: no public URL exists for them. The only way to read
 * one is GET /api/documents/[id]/file, which re-checks the caller's tenant
 * and permission, then streams the bytes server-side.
 */

export interface StoredFile {
  body: ReadableStream<Uint8Array>;
  contentType: string | null;
  size: number | null;
}

export interface DocumentStorage {
  readonly provider: string;
  readonly live: boolean;
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Document storage isn't configured (BLOB_READ_WRITE_TOKEN is not set), so source files aren't retained.");
    this.name = "StorageNotConfiguredError";
  }
}

/** Prefix of Document.storageKey when the file wasn't stored (no storage configured). */
export const UNSTORED_PREFIX = "unstored:";

export function isStoredKey(key: string): boolean {
  return !key.startsWith(UNSTORED_PREFIX);
}

/** Every company's files live under their own prefix; the download route checks it. */
export function companyPrefix(companyId: string): string {
  return `companies/${companyId}/`;
}

/**
 * The object key for a document. The file name is reduced to a safe
 * character set (it's display-only; the Document row keeps the original),
 * and the document id makes the key unique, so nothing is ever overwritten.
 */
export function documentStorageKey(companyId: string, documentId: string, fileName: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(companyId) || !/^[A-Za-z0-9_-]+$/.test(documentId)) {
    throw new Error("Invalid id for a storage key.");
  }
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const safe = base.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^[._]+/, "").slice(-120) || "file";
  return `${companyPrefix(companyId)}documents/${documentId}/${safe}`;
}

class VercelBlobStorage implements DocumentStorage {
  readonly provider = "vercel-blob";
  readonly live = true;
  constructor(private readonly token: string) {}

  async put(key: string, bytes: Buffer, contentType: string) {
    await put(key, bytes, {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
      token: this.token,
    });
  }

  async get(key: string): Promise<StoredFile | null> {
    const res = await get(key, { access: "private", token: this.token });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return { body: res.stream, contentType: res.blob.contentType, size: res.blob.size };
  }

  async delete(key: string) {
    await del(key, { token: this.token });
  }
}

let override: DocumentStorage | null | undefined;

export function getDocumentStorage(): DocumentStorage | null {
  if (override !== undefined) return override;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? new VercelBlobStorage(token) : null;
}

export function isDocumentStorageConfigured(): boolean {
  return getDocumentStorage() !== null;
}

/** Test-only: swap in an in-memory store (or null for "unconfigured"); undefined restores the env-based default. */
export function __setDocumentStorageForTests(storage: DocumentStorage | null | undefined) {
  override = storage;
}

/** Test-only in-memory implementation, so DB-backed tests never touch the network. */
export function createMemoryDocumentStorage(): DocumentStorage & { objects: Map<string, { bytes: Buffer; contentType: string }> } {
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  return {
    provider: "memory",
    live: true,
    objects,
    async put(key, bytes, contentType) {
      if (objects.has(key)) throw new Error(`object exists: ${key}`);
      objects.set(key, { bytes: Buffer.from(bytes), contentType });
    },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return { body: new Blob([new Uint8Array(o.bytes)]).stream(), contentType: o.contentType, size: o.bytes.length };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
