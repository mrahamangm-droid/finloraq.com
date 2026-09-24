"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

export interface MatchCandidate {
  customerId: string;
  name: string;
  score: number;
  reason: string;
}

export interface ExtractedRecord {
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  documentDate: string | null;
  reference: string | null;
  amount: number | null;
  currency: string | null;
  description: string | null;
  confidence: "high" | "medium" | "low";
  matches: MatchCandidate[];
  resolution?: { action: "applied" | "ignored" };
}

export interface QueueDocument {
  id: string;
  fileName: string;
  createdAt: string;
  extractedData: { sourceType: string; truncated: boolean; records: ExtractedRecord[] } | null;
}

const CONFIDENCE_STYLE: Record<ExtractedRecord["confidence"], string> = {
  high: "text-success",
  medium: "text-warning",
  low: "text-destructive",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function FileIntelligencePanel({ queue }: { queue: QueueDocument[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after an error
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch("/api/customers/intelligence/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", fileBase64 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploadError(data.error ?? "Something went wrong reading that file.");
        return;
      }
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  const cards = queue.flatMap((doc) => {
    const records = doc.extractedData?.records ?? [];
    return records
      .map((record, recordIndex) => ({ doc, record, recordIndex }))
      .filter(({ record }) => !record.resolution);
  });

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer File Intelligence</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload any customer file — a PDF, photo, invoice, receipt, Excel file, CSV, email or WhatsApp export all
          work. Finloraq reads it, tries to match it to an existing customer, and lists it below for you to confirm —
          nothing is created or changed automatically. If it's a format Finloraq can't read yet, you'll get a clear
          reason instead of a silent failure.
        </p>
      </div>

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={uploading}
        className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-muted-foreground hover:bg-muted/30 disabled:opacity-50"
      >
        <Upload className="h-5 w-5" />
        <span className="text-sm">{uploading ? "Reading file…" : "Click to upload any customer file"}</span>
      </button>
      {/* No `accept` filter: the picker shows every file on the user's device.
          Finloraq reads what it can (PDF, image, Excel, CSV, text/email) and,
          for anything else, the upload comes back with a clear, specific
          reason instead of the file just never appearing in the picker. */}
      <input ref={fileInput} type="file" className="hidden" onChange={onFileChange} />
      {uploadError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{uploadError}</p>
      )}

      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files waiting for review.</p>
      ) : (
        <div className="space-y-3">
          {cards.map(({ doc, record, recordIndex }) => (
            <RecordReviewCard key={`${doc.id}:${recordIndex}`} doc={doc} record={record} recordIndex={recordIndex} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecordReviewCard({ doc, record, recordIndex }: { doc: QueueDocument; record: ExtractedRecord; recordIndex: number }) {
  const router = useRouter();
  const [nameDraft, setNameDraft] = useState(record.customerName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: unknown, path: "apply" | "ignore") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/intelligence/${doc.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const linkExisting = (customerId: string) =>
    post({ kind: "link", recordIndex, customerId, fillEmail: record.customerEmail ?? undefined, fillPhone: record.customerPhone ?? undefined }, "apply");

  const createNew = () =>
    post({ kind: "create", recordIndex, name: nameDraft.trim(), email: record.customerEmail ?? undefined, phone: record.customerPhone ?? undefined }, "apply");

  const ignore = () => post({ recordIndex }, "ignore");

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {doc.fileName} · {doc.extractedData?.sourceType.toUpperCase()}
          {doc.extractedData?.truncated && " · only the first part of this file was read"}
        </span>
        <span className={`font-medium ${CONFIDENCE_STYLE[record.confidence]}`}>{record.confidence} confidence</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Field label="Date" value={record.documentDate} />
        <Field label="Amount" value={record.amount != null ? `${record.currency ?? ""} ${record.amount}`.trim() : null} />
        <Field label="Reference" value={record.reference} />
        <Field label="Description" value={record.description} />
      </div>
      {(record.customerEmail || record.customerPhone) && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Email on document" value={record.customerEmail} />
          <Field label="Phone on document" value={record.customerPhone} />
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-card-foreground">Customer name (from document — edit if needed)</label>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder="Not detected — type a name to create a customer"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {record.matches.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-card-foreground">Possible existing match</div>
          {record.matches.map((m) => (
            <div key={m.customerId} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                {m.name} <span className="text-xs text-muted-foreground">({Math.round(m.score * 100)}% — {m.reason})</span>
              </span>
              <button
                type="button"
                onClick={() => linkExisting(m.customerId)}
                disabled={busy}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                Confirm match
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={createNew}
          disabled={busy || !nameDraft.trim()}
          className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          Create new customer{nameDraft.trim() ? ` "${nameDraft.trim()}"` : ""}
        </button>
        <button
          type="button"
          onClick={ignore}
          disabled={busy}
          className="rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          Ignore
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-card-foreground">{value ?? <span className="text-muted-foreground">not found — review</span>}</div>
    </div>
  );
}
