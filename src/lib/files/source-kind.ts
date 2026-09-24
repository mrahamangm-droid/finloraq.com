/**
 * Shared "what kind of file is this, and can we read it" classifier.
 *
 * Originally written for the Customer File Intelligence pipeline
 * (src/lib/ai/customer-extraction.ts) and now also used by the expense
 * Documents — AI Extraction pipeline (src/lib/ai/extraction.ts), so both
 * upload flows accept the same set of formats (photo/scan, PDF, .xlsx,
 * CSV, plain text) with the same actionable error messages for formats we
 * know about but can't parse yet, instead of drifting into two different
 * "supported types" lists.
 */

export type SourceKind = "image" | "pdf" | "csv" | "xlsx" | "text";

// Anthropic's vision API only accepts these four image media types. Any
// other image/* mimeType (heic, tiff, bmp, svg, ...) would otherwise reach
// completeWithFile() and fail as a raw, confusing "Anthropic API error 400"
// — so it's rejected here instead, with a specific, actionable message.
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const UNSUPPORTED_IMAGE_EXTENSIONS = new Set(["heic", "heif", "bmp", "tif", "tiff", "svg"]);

export function detectSourceKind(fileName: string, mimeType: string): SourceKind {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (mimeType.startsWith("image/")) {
    if (SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) return "image";
    throw new Error(
      `"${fileName}" is a ${mimeType} image, which Finloraq can't read yet — please convert it to JPEG or PNG and upload that instead.`
    );
  }
  // Some upload paths (drag-and-drop from certain sources, a generic
  // "application/octet-stream") don't set a useful mimeType — fall back to
  // the extension so a plain .jpg/.png still works, and still give a clear
  // message for image formats we know we can't read rather than letting an
  // unrecognized mimeType fall through to the generic error below.
  if (SUPPORTED_IMAGE_EXTENSIONS.has(ext)) return "image";
  if (UNSUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error(
      `"${fileName}" is a .${ext} image, which Finloraq can't read yet — please convert it to JPEG or PNG and upload that instead.`
    );
  }

  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || ext === "xlsx") return "xlsx";
  if (mimeType === "text/csv" || ext === "csv") return "csv";
  if (mimeType === "application/vnd.ms-excel" || ext === "xls") {
    throw new Error(
      'The old .xls binary format isn\'t supported yet — please re-save/export "' + fileName + '" as .xlsx or .csv and upload that instead.'
    );
  }
  if (
    ext === "doc" ||
    ext === "docx" ||
    ext === "ppt" ||
    ext === "pptx" ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    throw new Error(
      `Word and PowerPoint files aren't supported yet — please export "${fileName}" as a PDF (File → Export or Print to PDF) and upload that instead.`
    );
  }
  if (ext === "zip" || mimeType === "application/zip" || mimeType === "application/x-zip-compressed") {
    throw new Error(`"${fileName}" is a zip archive — please upload the individual files inside it instead, one at a time.`);
  }
  if (
    mimeType.startsWith("text/") ||
    mimeType === "message/rfc822" ||
    mimeType === "application/json" ||
    ext === "txt" ||
    ext === "eml" ||
    ext === "md" ||
    ext === "json"
  ) {
    return "text";
  }
  throw new Error(
    `Unsupported file type for "${fileName}" (${mimeType || "unknown"}). Upload a PDF, an image (JPG/PNG/GIF/WebP), an Excel file (.xlsx), a CSV, or a plain-text/email/JSON export.`
  );
}
