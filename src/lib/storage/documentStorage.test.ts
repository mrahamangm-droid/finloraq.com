import { afterEach, describe, expect, it } from "vitest";
import {
  __setDocumentStorageForTests,
  companyPrefix,
  documentStorageKey,
  getDocumentStorage,
  isStoredKey,
} from "@/lib/storage/documentStorage";

describe("documentStorageKey", () => {
  it("puts every file under its company's prefix and the document id", () => {
    expect(documentStorageKey("co1", "doc1", "Receipt.pdf")).toBe("companies/co1/documents/doc1/Receipt.pdf");
    expect(documentStorageKey("co1", "doc1", "Receipt.pdf").startsWith(companyPrefix("co1"))).toBe(true);
  });

  it("neutralizes path tricks and odd characters in the file name", () => {
    expect(documentStorageKey("co1", "d", "../../companies/co2/x.pdf")).toBe("companies/co1/documents/d/x.pdf");
    expect(documentStorageKey("co1", "d", "C:\\Users\\me\\scan 01 (final).jpg")).toBe("companies/co1/documents/d/scan_01_final_.jpg");
    expect(documentStorageKey("co1", "d", "..")).toBe("companies/co1/documents/d/file");
    expect(documentStorageKey("co1", "d", "فاتورة.pdf")).toBe("companies/co1/documents/d/pdf");
  });

  it("refuses ids that could escape the prefix", () => {
    expect(() => documentStorageKey("co1/../co2", "d", "x")).toThrow();
    expect(() => documentStorageKey("co1", "", "x")).toThrow();
  });

  it("tells stored keys from the unstored placeholder", () => {
    expect(isStoredKey("unstored:x.pdf")).toBe(false);
    expect(isStoredKey("companies/co1/documents/d/x.pdf")).toBe(true);
  });
});

describe("getDocumentStorage", () => {
  const saved = process.env.BLOB_READ_WRITE_TOKEN;
  afterEach(() => {
    if (saved === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = saved;
    __setDocumentStorageForTests(undefined);
  });

  it("is null (explicitly unconfigured) without a token, and Vercel Blob with one", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(getDocumentStorage()).toBeNull();
    process.env.BLOB_READ_WRITE_TOKEN = "not-a-real-token";
    expect(getDocumentStorage()).toMatchObject({ provider: "vercel-blob", live: true });
  });
});
