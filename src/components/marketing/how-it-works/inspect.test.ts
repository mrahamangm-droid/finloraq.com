import { describe, expect, it } from "vitest";
import { classify, detectFormat, emailHeader, formatBytes, looksLikeWhatsAppExport, splitCsvLine } from "./inspect";
import { SAMPLES } from "./content";

describe("detectFormat", () => {
  it("uses extension and MIME", () => {
    expect(detectFormat("a.PDF", "")).toBe("pdf");
    expect(detectFormat("scan", "image/jpeg")).toBe("image");
    expect(detectFormat("IMG_2041.HEIC", "")).toBe("image");
    expect(detectFormat("book.xlsx", "")).toBe("spreadsheet");
    expect(detectFormat("export.csv", "text/csv")).toBe("spreadsheet");
    expect(detectFormat("mail.eml", "")).toBe("email");
    expect(detectFormat("chat.txt", "text/plain")).toBe("text");
    expect(detectFormat("archive.zip", "application/zip")).toBe("unknown");
  });
});

describe("classify", () => {
  it("reads intent from file names", () => {
    expect(classify({ name: "tax_invoice-0142.pdf", mime: "application/pdf" })).toBe("invoice");
    expect(classify({ name: "Receipt 18-09.jpg", mime: "image/jpeg" })).toBe("receipt");
    expect(classify({ name: "ENBD_statement_Aug.pdf", mime: "" })).toBe("bank-statement");
    expect(classify({ name: "credit-note-12.pdf", mime: "" })).toBe("credit-note");
    expect(classify({ name: "PO-2231.pdf", mime: "" })).toBe("purchase-order");
    expect(classify({ name: "quotation_v2.pdf", mime: "" })).toBe("quote");
    expect(classify({ name: "payroll-sept.xlsx", mime: "" })).toBe("payroll");
    expect(classify({ name: "WhatsApp Chat with Ali.txt", mime: "text/plain" })).toBe("chat");
  });

  it("uses CSV headers when the name says nothing", () => {
    expect(classify({ name: "export.csv", mime: "text/csv", headers: ["date", "description", "debit", "credit", "balance"] })).toBe("bank-statement");
    expect(classify({ name: "export.csv", mime: "text/csv", headers: ["invoice no", "customer", "total"] })).toBe("invoice");
    expect(classify({ name: "export.csv", mime: "text/csv", headers: ["sku", "qty"] })).toBe("spreadsheet");
  });

  it("falls back by format", () => {
    expect(classify({ name: "IMG_2041.jpg", mime: "image/jpeg" })).toBe("photo");
    expect(classify({ name: "Screenshot 2026-09-20.png", mime: "image/png" })).toBe("screenshot");
    expect(classify({ name: "message.eml", mime: "" })).toBe("email");
    expect(classify({ name: "message.eml", mime: "", emailSubject: "Invoice 1044 copy please" })).toBe("invoice");
    expect(classify({ name: "scan.pdf", mime: "" })).toBe("document");
  });

  it("does not match words inside other words", () => {
    expect(classify({ name: "invoices-summary.pdf", mime: "" })).toBe("invoice");
    expect(classify({ name: "report.pdf", mime: "" })).toBe("document");
  });
});

describe("parsers", () => {
  it("splits CSV with quotes and other delimiters", () => {
    expect(splitCsvLine('Date,"Description, long",Amount')).toEqual(["Date", "Description, long", "Amount"]);
    expect(splitCsvLine("Date;Amount")).toEqual(["Date", "Amount"]);
    expect(splitCsvLine("Date\tAmount")).toEqual(["Date", "Amount"]);
  });

  it("reads folded email headers", () => {
    const raw = "From: A <a@x.example>\r\nSubject: Invoice\r\n  copy please\r\n\r\nBody Subject: no";
    expect(emailHeader(raw, "Subject")).toBe("Invoice copy please");
    expect(emailHeader(raw, "From")).toBe("A <a@x.example>");
    expect(emailHeader(raw, "To")).toBeUndefined();
  });

  it("recognises WhatsApp exports", () => {
    expect(looksLikeWhatsAppExport("12/09/2026, 10:15 - Ali: Please send 20 cartons")).toBe(true);
    expect(looksLikeWhatsAppExport("[12/09/2026, 10:15:22] Ali: hi")).toBe(true);
    expect(looksLikeWhatsAppExport("Just a note")).toBe(false);
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("demo samples", () => {
  const num = (s: string | null | undefined) => (s ? Number(s.replace(/,/g, "")) : 0);
  it("every sample posting balances (debits = credits)", () => {
    for (const s of SAMPLES) {
      const dr = s.posting.reduce((a, l) => a + num(l.dr), 0);
      const cr = s.posting.reduce((a, l) => a + num(l.cr), 0);
      expect(Math.round(dr * 100)).toBe(Math.round(cr * 100));
    }
  });
  it("every sample is visibly fictional", () => {
    for (const s of SAMPLES) expect(s.fileName.startsWith("DEMO-")).toBe(true);
  });
});
