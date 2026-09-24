import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { getAiProvider, AiNotConfiguredError } from "@/lib/ai/provider";
import { createExpense } from "@/lib/expenses";
import { enforceAiUsageLimit, recordAiUsage } from "@/lib/billing/usage";
import { planDefinition } from "@/lib/billing/plans";
import { detectSourceKind } from "@/lib/files/source-kind";
import { parseCsv, rowsToTableText } from "@/lib/files/csv";
import { parseXlsxRows } from "@/lib/files/xlsx-lite";

export interface ExtractedDocumentFields {
  vendorName: string | null;
  documentDate: string | null; // ISO date, model's best read of the document
  amount: number | null;
  taxAmount: number | null;
  currency: string | null;
  description: string | null;
  confidence: "high" | "medium" | "low";
}

const EXTRACTION_SYSTEM_PROMPT =
  "You extract structured data from an invoice, bill or receipt — given either as a photo or " +
  "scan, a PDF, or a table exported from a spreadsheet or CSV (in which case treat the whole " +
  "table as describing the one bill or statement, and summarize its overall vendor/date/total " +
  "rather than a single row). Read ONLY what is printed or present in the content — never " +
  "guess or infer a number that is not visibly present. Respond with ONLY a single JSON " +
  'object, no prose, no markdown fences, matching exactly: {"vendorName": string|null, ' +
  '"documentDate": string|null (YYYY-MM-DD), "amount": number|null (the total, including ' +
  'tax), "taxAmount": number|null, "currency": string|null (ISO 4217 code if visible), ' +
  '"description": string|null (one line, what was purchased), "confidence": ' +
  '"high"|"medium"|"low"}. If a field is not legible or not present, use null for it rather ' +
  "than guessing.";

const MAX_TABLE_ROWS = 300;
const MAX_TEXT_CHARS = 15000;

/**
 * Document → OCR/extraction step of the spec's pipeline (section 8):
 * Document → OCR → Extraction → Validation → Duplicate Check → Matching →
 * Draft → Approval → Accounting. This function is only the extraction
 * step — it returns fields for a human (or the caller) to review; it
 * never creates an Expense/Bill itself. That happens in
 * createDraftExpenseFromExtraction() below, only after review, and lands
 * as a DRAFT journal entry like any other expense (see src/lib/expenses.ts).
 */
export async function extractDocument(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  fileName: string;
  /** Base64 of the raw file bytes — a photo/scan, a PDF, an .xlsx, or a
   *  CSV. detectSourceKind() below decides which, and each is read the
   *  same way the Customer File Intelligence pipeline reads it
   *  (src/lib/ai/customer-extraction.ts). */
  fileBase64: string;
  mimeType: string;
}): Promise<{ documentId: string; fields: ExtractedDocumentFields }> {
  await requirePermission(params.membershipId, "documents", "CREATE");

  const subscription = await prisma.subscription.findUnique({ where: { companyId: params.companyId } });
  if (subscription && !planDefinition(subscription.plan).features.documentExtraction) {
    throw new Error(`Document extraction isn't included in the ${planDefinition(subscription.plan).label} plan. Upgrade to enable it.`);
  }
  await enforceAiUsageLimit(params.companyId);

  const provider = getAiProvider();
  if (!provider) {
    throw new AiNotConfiguredError();
  }

  const sourceType = detectSourceKind(params.fileName, params.mimeType);

  const hash = crypto.createHash("sha256").update(params.fileBase64).digest("hex");

  // Scoped to this pipeline's own kind: the same file could legitimately
  // be uploaded once here (as an expense/receipt) and once through
  // Customer File Intelligence (src/lib/ai/customer-extraction.ts) to
  // detect the customer on it — those are different reviews, not a
  // duplicate of each other.
  const duplicate = await prisma.document.findFirst({ where: { companyId: params.companyId, kind: "EXPENSE", hash } });
  if (duplicate) {
    throw new Error(`This exact file was already uploaded (document ${duplicate.id}, ${duplicate.status}).`);
  }

  const document = await prisma.document.create({
    data: {
      companyId: params.companyId,
      kind: "EXPENSE",
      fileName: params.fileName,
      // No object storage configured yet (OBJECT_STORAGE_* in .env.example
      // is unused) — storageKey is a placeholder until that lands; the raw
      // bytes are NOT persisted here, only the extraction result is, so
      // this is safe but means the source image isn't retrievable later.
      // TODO(Phase 7+/production): upload fileBase64 to object storage
      // and store the real key here instead.
      storageKey: `unstored:${params.fileName}`,
      hash,
      mimeType: params.mimeType,
      sizeBytes: Math.ceil((params.fileBase64.length * 3) / 4),
      status: "PROCESSING",
      uploadedBy: params.userId,
    },
  });

  let fields: ExtractedDocumentFields;
  try {
    let raw: string;
    if (sourceType === "image" || sourceType === "pdf") {
      raw = await provider.completeWithFile({
        system: EXTRACTION_SYSTEM_PROMPT,
        prompt: "Extract the fields from this document.",
        fileBase64: params.fileBase64,
        mimeType: params.mimeType,
        maxTokens: 500,
      });
    } else {
      // xlsx / csv / text: no image API involved — parse the file's raw
      // bytes into a table (or plain text) and hand that to a text-only
      // completion, same approach as the Customer File Intelligence
      // pipeline (src/lib/ai/customer-extraction.ts).
      const decodedText = Buffer.from(params.fileBase64, "base64").toString("utf8");
      let content: string;
      if (sourceType === "xlsx") {
        const rows = parseXlsxRows(Buffer.from(params.fileBase64, "base64"));
        content = rowsToTableText(rows, MAX_TABLE_ROWS).text;
      } else if (sourceType === "csv") {
        const rows = parseCsv(decodedText);
        content = rowsToTableText(rows, MAX_TABLE_ROWS).text;
      } else {
        content = decodedText.length > MAX_TEXT_CHARS ? decodedText.slice(0, MAX_TEXT_CHARS) : decodedText;
      }

      raw = await provider.complete({
        system: EXTRACTION_SYSTEM_PROMPT,
        prompt: `Extract the fields from the following document content:\n\n${content}`,
        maxTokens: 500,
      });
    }
    fields = JSON.parse(stripCodeFence(raw));
  } catch (err) {
    await prisma.document.update({ where: { id: document.id }, data: { status: "FAILED" } });
    throw err instanceof Error ? err : new Error("Document extraction failed.");
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { status: "EXTRACTED", extractedData: fields as object },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "document.extracted",
    entityType: "Document",
    entityId: document.id,
    newValue: { vendorName: fields.vendorName, amount: fields.amount },
    source: "ai",
  });
  await recordAiUsage({ companyId: params.companyId, kind: "ocr_page" });

  return { documentId: document.id, fields };
}

/**
 * Turns a reviewed extraction into a DRAFT expense — same code path as a
 * human typing it into the Expenses form (src/lib/expenses.ts). The AI
 * never posts anything: this still requires a human with expenses:APPROVE
 * to move it to POSTED via approveExpense(). The caller (the /documents
 * review UI) is expected to have shown the extracted fields to a person
 * first; this function trusts whatever amount/description it's given,
 * which is the human-confirmed version, not necessarily the raw
 * extraction if they corrected something.
 */
export async function createDraftExpenseFromExtraction(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  documentId: string;
  date: Date;
  description: string;
  amount: number;
  taxAmount?: number;
}) {
  const entry = await createExpense({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: params.date,
    description: params.description,
    amount: params.amount,
    taxAmount: params.taxAmount,
  });

  await prisma.document.update({
    where: { id: params.documentId },
    data: { status: "DRAFTED", relatedEntity: `JournalEntry:${entry.id}` },
  });

  return entry;
}

export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? (fenced[1] ?? trimmed) : trimmed;
}
