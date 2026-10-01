/**
 * Document storage end to end against real Postgres, with an in-memory
 * store in place of Vercel Blob and a fake AI provider (no network): the
 * extraction pipeline stores the original under the company's prefix before
 * any AI call, the download route serves it only to the owning company,
 * and an unconfigured or failing store is reported, never hidden.
 *
 * Runs only when DATABASE_URL and CI or RUN_DB_TESTS are set (same gate as
 * tenantIsolation.integration.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let sessionUserId: string | null = null;
const aiCalls: string[] = [];

vi.mock("next-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth")>();
  return { ...actual, getServerSession: vi.fn(async () => (sessionUserId ? { user: { id: sessionUserId } } : null)) };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/ai/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/provider")>();
  const json = '{"vendorName":"ACME","documentDate":"2026-09-01","amount":105,"taxAmount":5,"currency":"AED","description":"Paper","confidence":"high"}';
  const fake = {
    name: "fake",
    complete: async () => (aiCalls.push("complete"), json),
    completeWithImage: async () => (aiCalls.push("image"), json),
    completeWithFile: async () => (aiCalls.push("file"), json),
  };
  return { ...actual, getAiProvider: () => fake };
});

const enabled = !!process.env.DATABASE_URL && !!(process.env.CI || process.env.RUN_DB_TESTS);

describe.skipIf(!enabled)("document storage (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let storageMod: typeof import("@/lib/storage/documentStorage");
  let memory: ReturnType<typeof import("@/lib/storage/documentStorage").createMemoryDocumentStorage>;
  type Ctx = { companyId: string; membershipId: string; userId: string };
  let A: Ctx;
  let B: Ctx;
  const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  let pngVariant = 0;
  const nextPng = () => Buffer.concat([png, Buffer.from(`${tag}-${++pngVariant}`)]).toString("base64");

  async function makeCompany(label: string): Promise<Ctx> {
    const { createCompanyForUser } = await import("@/lib/onboarding");
    const user = await prisma.user.create({
      data: { name: `DS ${label}`, email: `ds-${label}-${tag}@t.local`, passwordHash: "x", emailVerified: new Date() },
    });
    const company = await createCompanyForUser({ userId: user.id, name: `DS ${label} ${tag}`, countryCode: "AE", baseCurrency: "AED" });
    await prisma.subscription.update({ where: { companyId: company.id }, data: { plan: "GROWTH" } }); // Starter excludes extraction
    const m = await prisma.companyMembership.findFirstOrThrow({ where: { companyId: company.id, userId: user.id } });
    return { companyId: company.id, membershipId: m.id, userId: user.id };
  }

  async function download(as: Ctx, documentId: string) {
    sessionUserId = as.userId;
    const { GET } = await import("@/app/api/documents/[id]/file/route");
    const res = await GET(new Request("http://localhost/api/documents/x/file"), { params: Promise.resolve({ id: documentId }) });
    return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
    storageMod = await import("@/lib/storage/documentStorage");
    const { __useMemoryRateLimitsForTests } = await import("@/lib/rateLimit");
    __useMemoryRateLimitsForTests();
    memory = storageMod.createMemoryDocumentStorage();
    storageMod.__setDocumentStorageForTests(memory);
    A = await makeCompany("a");
    B = await makeCompany("b");
  }, 60_000);

  afterAll(() => {
    storageMod.__setDocumentStorageForTests(undefined);
    sessionUserId = null;
  });

  it("stores the original under the company's prefix and serves it back only to that company", async () => {
    const { extractDocument } = await import("@/lib/ai/extraction");
    const fileBase64 = nextPng();
    const res = await extractDocument({ ...A, fileName: "receipt 1.png", fileBase64, mimeType: "image/png" });
    expect(res.stored).toBe(true);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.documentId } });
    expect(doc.storageKey).toBe(`companies/${A.companyId}/documents/${doc.id}/receipt_1.png`);
    expect(memory.objects.get(doc.storageKey)?.bytes.equals(Buffer.from(fileBase64, "base64"))).toBe(true);

    const own = await download(A, doc.id);
    expect(own.status).toBe(200);
    expect(own.bytes.equals(Buffer.from(fileBase64, "base64"))).toBe(true);
    expect(own.headers.get("content-type")).toBe("image/png");
    expect(own.headers.get("x-content-type-options")).toBe("nosniff");

    expect((await download(B, doc.id)).status).toBe(404);
  });

  it("forces risky types to download instead of rendering on our origin", async () => {
    const { extractCustomerDocument } = await import("@/lib/ai/customer-extraction");
    const html = Buffer.from(`<script>alert(1)</script>${tag}`).toString("base64");
    const res = await extractCustomerDocument({ ...A, fileName: "x.html", fileBase64: html, mimeType: "text/html" });
    expect(res.stored).toBe(true);
    const got = await download(A, res.documentId);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("application/octet-stream");
    expect(got.headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("never serves a key outside the caller's company prefix", async () => {
    const { extractDocument } = await import("@/lib/ai/extraction");
    const res = await extractDocument({ ...B, fileName: "b.png", fileBase64: nextPng(), mimeType: "image/png" });
    const bDoc = await prisma.document.findUniqueOrThrow({ where: { id: res.documentId } });
    // A row of A's pointing at B's object (should never happen) is still refused.
    const forged = await prisma.document.create({
      data: { companyId: A.companyId, fileName: "forged.png", storageKey: bDoc.storageKey, hash: `forged${tag}`, mimeType: "image/png", sizeBytes: 1, uploadedBy: A.userId },
    });
    expect((await download(A, forged.id)).status).toBe(404);
  });

  it("says so when storage isn't configured, and still extracts", async () => {
    storageMod.__setDocumentStorageForTests(null);
    try {
      const { extractDocument } = await import("@/lib/ai/extraction");
      const res = await extractDocument({ ...A, fileName: "nostore.png", fileBase64: nextPng(), mimeType: "image/png" });
      expect(res.stored).toBe(false);
      expect((await prisma.document.findUniqueOrThrow({ where: { id: res.documentId } })).storageKey).toBe("unstored:nostore.png");
      storageMod.__setDocumentStorageForTests(memory);
      const got = await download(A, res.documentId);
      expect(got.status).toBe(404);
      expect(got.bytes.toString()).toMatch(/wasn't retained/);
    } finally {
      storageMod.__setDocumentStorageForTests(memory);
    }
  });

  it("fails loudly, before any AI call, when the store rejects the upload", async () => {
    storageMod.__setDocumentStorageForTests({ ...memory, put: async () => { throw new Error("blob down"); } });
    try {
      const { extractDocument } = await import("@/lib/ai/extraction");
      const before = aiCalls.length;
      await expect(extractDocument({ ...A, fileName: "fail.png", fileBase64: nextPng(), mimeType: "image/png" })).rejects.toThrow(/couldn't be saved/);
      expect(aiCalls.length).toBe(before);
      const failed = await prisma.document.findFirstOrThrow({ where: { companyId: A.companyId, fileName: "fail.png" } });
      expect(failed.status).toBe("FAILED");
    } finally {
      storageMod.__setDocumentStorageForTests(memory);
    }
  });
});
