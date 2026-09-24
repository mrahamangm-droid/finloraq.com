import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { getAiProvider, AiNotConfiguredError } from "@/lib/ai/provider";
import { stripCodeFence } from "@/lib/ai/extraction";
import { enforceAiUsageLimit, recordAiUsage } from "@/lib/billing/usage";
import { planDefinition } from "@/lib/billing/plans";
import { parseCsv, rowsToTableText } from "@/lib/files/csv";
import { parseXlsxRows } from "@/lib/files/xlsx-lite";
import { detectSourceKind } from "@/lib/files/source-kind";
import { findCustomerMatches, type CustomerMatchCandidate } from "@/lib/customers/matching";
import { createCustomer, updateCustomerFromReview } from "@/lib/parties";

/**
 * Customer File Intelligence (spec item 5): "when users upload any
 * supported file, automatically read -> detect customer -> detect exact
 * date -> extract -> match -> [queue for] update the correct records."
 *
 * This mirrors the existing expense pipeline's shape (src/lib/ai/extraction.ts
 * -> extractDocument()) closely on purpose: same Document table (a new
 * `kind: "CUSTOMER_RECORD"` distinguishes rows from the expense flow),
 * same dedupe-by-hash, same "AI never writes the record, a human reviews
 * first" contract. What's new here is (a) more source file types than
 * just a photo — PDF, JPEG/PNG/GIF/WebP images, .xlsx, CSV, and plain
 * text/JSON (an email or WhatsApp export) — and (b) it can return several
 * records from one file (a CSV export of transactions isn't one record,
 * it's many), and (c) it tries to match each record to an existing
 * Customer rather than just reading vendor/amount fields. The upload
 * picker itself doesn't filter by file type at all (see
 * FileIntelligencePanel) — detectSourceKind() (@/lib/files/source-kind) is
 * the single place that decides what's readable, and it always fails with a specific,
 * actionable reason (convert to PDF, convert to JPEG/PNG, etc.) rather
 * than a generic "unsupported" for formats we know about but can't parse
 * yet (old .xls, Word/PowerPoint, zip archives, HEIC/TIFF/BMP/SVG images).
 *
 * "Never invent missing information; flag uncertain data for review" is
 * enforced the same way the expense pipeline enforces "never guess a
 * number that isn't visible": the extraction prompt requires null for
 * anything not clearly present, and NOTHING here ever creates or updates
 * a Customer on its own — extractCustomerDocument() only ever writes to
 * the Document row. A human calls applyCustomerDocumentRecord() (or
 * ignoreCustomerDocumentRecord()) per record after reviewing it — see
 * the /api/customers/intelligence routes.
 */

export interface ExtractedCustomerRecord {
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  documentDate: string | null; // ISO YYYY-MM-DD, read exactly as printed — may be past, present, or future
  reference: string | null;
  amount: number | null;
  currency: string | null;
  description: string | null;
  confidence: "high" | "medium" | "low";
  matches: CustomerMatchCandidate[];
  resolution?: {
    action: "applied" | "ignored";
    customerId?: string;
    resolvedBy: string;
    resolvedAt: string;
  };
}

export interface CustomerDocumentExtraction {
  sourceType: "image" | "pdf" | "csv" | "xlsx" | "text";
  truncated: boolean;
  records: ExtractedCustomerRecord[];
}

const RECORD_SYSTEM_PROMPT =
  "You extract customer-related business records from the given content, which may be a " +
  "single scanned or photographed document, a PDF, an email, a WhatsApp message, or a table " +
  "exported from a spreadsheet or CSV. Read ONLY what is actually present in the content — " +
  "never guess, infer, or fill in a value that isn't clearly there. If the content is a " +
  "single record (an invoice, receipt, order, or message), return an array with exactly one " +
  "element. If it's a table with multiple data rows, return one element per data row, " +
  "skipping header rows and fully blank rows. Respond with ONLY a single JSON array, no " +
  'prose, no markdown fences. Each element must match exactly: {"customerName": string|null, ' +
  '"customerEmail": string|null, "customerPhone": string|null, "documentDate": string|null ' +
  "(YYYY-MM-DD, read exactly as printed or typed for that record — it may be in the past, " +
  "today, or in the future; never substitute today's date or invent one), " +
  '"reference": string|null (an invoice/receipt/order number, if present), "amount": ' +
  'number|null (the total for that record), "currency": string|null (ISO 4217 code, if ' +
  'visible), "description": string|null (one line), "confidence": "high"|"medium"|"low"}. If ' +
  "a field is missing or illegible for a record, use null for it and lower that record's " +
  "confidence rather than guessing.";

const MAX_TABLE_ROWS = 300;
const MAX_TEXT_CHARS = 15000;

// detectSourceKind() moved to @/lib/files/source-kind so the expense
// Documents pipeline (src/lib/ai/extraction.ts) can share the exact same
// format detection and error messages instead of maintaining a second,
// possibly-drifting copy of this list.

function parseRecordsResponse(raw: string): Omit<ExtractedCustomerRecord, "matches">[] {
  const parsed: unknown = JSON.parse(stripCodeFence(raw));
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      customerName: typeof rec.customerName === "string" ? rec.customerName : null,
      customerEmail: typeof rec.customerEmail === "string" ? rec.customerEmail : null,
      customerPhone: typeof rec.customerPhone === "string" ? rec.customerPhone : null,
      documentDate: typeof rec.documentDate === "string" ? rec.documentDate : null,
      reference: typeof rec.reference === "string" ? rec.reference : null,
      amount: typeof rec.amount === "number" ? rec.amount : null,
      currency: typeof rec.currency === "string" ? rec.currency : null,
      description: typeof rec.description === "string" ? rec.description : null,
      confidence: rec.confidence === "high" || rec.confidence === "medium" || rec.confidence === "low" ? rec.confidence : "low",
    };
  });
}

export async function extractCustomerDocument(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  /** Base64 of the raw file bytes — same convention as extractDocument()
   *  in extraction.ts. Decoded to text internally for CSV/xlsx/plain-text
   *  sources; passed through as-is to the vision call for images/PDFs. */
  fileBase64: string;
}): Promise<{ documentId: string; extraction: CustomerDocumentExtraction }> {
  await requirePermission(params.membershipId, "documents", "CREATE");

  const subscription = await prisma.subscription.findUnique({ where: { companyId: params.companyId } });
  if (subscription && !planDefinition(subscription.plan).features.documentExtraction) {
    throw new Error(`Document extraction isn't included in the ${planDefinition(subscription.plan).label} plan. Upgrade to enable it.`);
  }
  await enforceAiUsageLimit(params.companyId);

  const provider = getAiProvider();
  if (!provider) throw new AiNotConfiguredError();

  const sourceType = detectSourceKind(params.fileName, params.mimeType);

  const hash = crypto.createHash("sha256").update(params.fileBase64).digest("hex");
  const duplicate = await prisma.document.findFirst({ where: { companyId: params.companyId, kind: "CUSTOMER_RECORD", hash } });
  if (duplicate) {
    throw new Error(`This exact file was already uploaded (document ${duplicate.id}, ${duplicate.status}).`);
  }

  const document = await prisma.document.create({
    data: {
      companyId: params.companyId,
      fileName: params.fileName,
      // See extraction.ts's Document.storageKey comment — same "no object
      // storage configured yet" situation, same placeholder convention.
      storageKey: `unstored:${params.fileName}`,
      hash,
      mimeType: params.mimeType,
      sizeBytes: Math.ceil((params.fileBase64.length * 3) / 4),
      status: "PROCESSING",
      kind: "CUSTOMER_RECORD",
      uploadedBy: params.userId,
    },
  });

  let records: Omit<ExtractedCustomerRecord, "matches">[];
  let truncated = false;

  try {
    if (sourceType === "image" || sourceType === "pdf") {
      const raw = await provider.completeWithFile({
        system: RECORD_SYSTEM_PROMPT,
        prompt: "Extract the record(s) from this document.",
        fileBase64: params.fileBase64,
        mimeType: params.mimeType,
        maxTokens: 2000,
      });
      records = parseRecordsResponse(raw);
    } else {
      const decodedText = Buffer.from(params.fileBase64, "base64").toString("utf8");
      let tableText: string;

      if (sourceType === "csv") {
        const rows = parseCsv(decodedText);
        const built = rowsToTableText(rows, MAX_TABLE_ROWS);
        tableText = built.text;
        truncated = built.truncated;
      } else if (sourceType === "xlsx") {
        const rows = parseXlsxRows(Buffer.from(params.fileBase64, "base64"));
        const built = rowsToTableText(rows, MAX_TABLE_ROWS);
        tableText = built.text;
        truncated = built.truncated;
      } else {
        tableText = decodedText;
        if (tableText.length > MAX_TEXT_CHARS) {
          tableText = tableText.slice(0, MAX_TEXT_CHARS);
          truncated = true;
        }
      }

      const raw = await provider.complete({
        system: RECORD_SYSTEM_PROMPT,
        prompt: `Extract the record(s) from the following content:\n\n${tableText}`,
        maxTokens: 4000,
      });
      records = parseRecordsResponse(raw);
    }
  } catch (err) {
    await prisma.document.update({ where: { id: document.id }, data: { status: "FAILED" } });
    throw err instanceof Error ? err : new Error("Customer document extraction failed.");
  }

  const recordsWithMatches: ExtractedCustomerRecord[] = await Promise.all(
    records.map(async (r) => ({
      ...r,
      matches: await findCustomerMatches({ companyId: params.companyId, nameGuess: r.customerName, email: r.customerEmail, phone: r.customerPhone }),
    }))
  );

  const extraction: CustomerDocumentExtraction = { sourceType, truncated, records: recordsWithMatches };

  await prisma.document.update({
    where: { id: document.id },
    data: { status: recordsWithMatches.some((r) => r.matches.length > 0) ? "MATCHED" : "EXTRACTED", extractedData: extraction as object },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "document.customer_extracted",
    entityType: "Document",
    entityId: document.id,
    newValue: { sourceType, recordCount: recordsWithMatches.length },
    source: "ai",
  });
  await recordAiUsage({ companyId: params.companyId, kind: "ocr_page" });

  return { documentId: document.id, extraction };
}

/** Reads back a Document row's extraction, throwing if it isn't a
 *  Customer File Intelligence document belonging to this company. Shared
 *  by the apply/ignore routes below. */
async function loadRecord(companyId: string, documentId: string, recordIndex: number) {
  const document = await prisma.document.findFirst({ where: { id: documentId, companyId, kind: "CUSTOMER_RECORD" } });
  if (!document) throw new Error("Document not found.");
  const extraction = document.extractedData as unknown as CustomerDocumentExtraction | null;
  const record = extraction?.records[recordIndex];
  if (!extraction || !record) throw new Error("Record not found on this document.");
  if (record.resolution) throw new Error("This record was already reviewed.");
  return { document, extraction, record };
}

async function saveResolution(
  companyId: string,
  documentId: string,
  extraction: CustomerDocumentExtraction,
  recordIndex: number,
  resolution: NonNullable<ExtractedCustomerRecord["resolution"]>
) {
  const existing = extraction.records[recordIndex];
  if (!existing) throw new Error("Record not found on this document.");
  extraction.records[recordIndex] = { ...existing, resolution };
  const stillPending = extraction.records.some((r) => !r.resolution);
  await prisma.document.update({
    where: { id: documentId },
    data: {
      extractedData: extraction as object,
      // Leave status alone (EXTRACTED or MATCHED, whichever extraction
      // set) while any record is still pending review, so the queue query
      // in the Customers page keeps finding this document. Only flip to
      // LINKED once every record on it has been applied or ignored.
      status: stillPending ? undefined : "LINKED",
      relatedEntity: !stillPending && resolution.customerId ? `Customer:${resolution.customerId}` : undefined,
    },
  });
}

/**
 * Applies one reviewed record: either links it to an existing Customer
 * (optionally filling in that customer's missing email/phone from the
 * document) or creates a brand-new Customer from the human-confirmed
 * fields. `confirmedFields` is what the reviewer actually approved in the
 * UI, not necessarily the raw extraction verbatim — same trust model as
 * createDraftExpenseFromExtraction() in extraction.ts.
 */
export async function applyCustomerDocumentRecord(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  documentId: string;
  recordIndex: number;
  action: { kind: "link"; customerId: string; fillEmail?: string; fillPhone?: string } | { kind: "create"; name: string; email?: string; phone?: string };
}) {
  // Baseline gate for resolving a review-queue item at all. The
  // customer-specific mutation (if any) is separately gated below by
  // createCustomer()/updateCustomerFromReview() themselves — this covers
  // the "link with no field changes" branch, which wouldn't otherwise
  // touch either of those and so wouldn't otherwise be checked.
  await requirePermission(params.membershipId, "documents", "EDIT");

  const { document, extraction, record } = await loadRecord(params.companyId, params.documentId, params.recordIndex);

  let customerId: string;
  if (params.action.kind === "link") {
    if (params.action.fillEmail || params.action.fillPhone) {
      await updateCustomerFromReview({
        companyId: params.companyId,
        membershipId: params.membershipId,
        userId: params.userId,
        customerId: params.action.customerId,
        fields: { email: params.action.fillEmail, phone: params.action.fillPhone },
        documentId: document.id,
      });
    }
    customerId = params.action.customerId;
  } else {
    const customer = await createCustomer({
      companyId: params.companyId,
      membershipId: params.membershipId,
      userId: params.userId,
      name: params.action.name,
      email: params.action.email,
      phone: params.action.phone,
    });
    customerId = customer.id;
  }

  await saveResolution(params.companyId, document.id, extraction, params.recordIndex, {
    action: "applied",
    customerId,
    resolvedBy: params.userId,
    resolvedAt: new Date().toISOString(),
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "document.customer_record_applied",
    entityType: "Document",
    entityId: document.id,
    previousValue: { customerName: record.customerName, documentDate: record.documentDate },
    newValue: { customerId, recordIndex: params.recordIndex },
    source: "web",
  });

  return { customerId };
}

export async function ignoreCustomerDocumentRecord(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  documentId: string;
  recordIndex: number;
}) {
  await requirePermission(params.membershipId, "documents", "EDIT");
  const { document, extraction } = await loadRecord(params.companyId, params.documentId, params.recordIndex);

  await saveResolution(params.companyId, document.id, extraction, params.recordIndex, {
    action: "ignored",
    resolvedBy: params.userId,
    resolvedAt: new Date().toISOString(),
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "document.customer_record_ignored",
    entityType: "Document",
    entityId: document.id,
    newValue: { recordIndex: params.recordIndex },
    source: "web",
  });
}
