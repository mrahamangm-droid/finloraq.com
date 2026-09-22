"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

type Fields = {
  vendorName: string | null;
  documentDate: string | null;
  amount: number | null;
  taxAmount: number | null;
  currency: string | null;
  description: string | null;
  confidence: string;
};

export default function DocumentsPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setFields(null);
    setCreated(null);

    const base64 = await fileToBase64(file);

    const res = await fetch("/api/documents/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, imageBase64: base64, mimeType: file.type }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }

    const data = await res.json();
    setDocumentId(data.documentId);
    setFields(data.fields);
  }

  async function createExpense() {
    if (!documentId || !fields?.amount) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/documents/${documentId}/create-expense`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: fields.documentDate ?? new Date().toISOString().slice(0, 10),
        description: fields.description ?? fields.vendorName ?? "Extracted expense",
        amount: fields.amount,
        taxAmount: fields.taxAmount ?? undefined,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }

    const data = await res.json();
    setCreated(data.entryNumber);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Documents — AI Extraction</h1>
        <p className="text-sm text-muted-foreground">
          Upload a photo or scan of a receipt or bill. Review the extracted fields below before
          creating a draft expense — nothing posts automatically.
        </p>
      </div>

      <button
        onClick={() => fileInput.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-muted-foreground hover:bg-muted/30"
      >
        <Upload className="h-6 w-6" />
        <span className="text-sm">Click to upload an image (JPG/PNG) of a receipt or bill</span>
      </button>
      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

      {loading && <p className="text-sm text-muted-foreground">Working…</p>}
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>
      )}

      {fields && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">
            Extracted (confidence: {fields.confidence}) — edit anything before saving
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-card-foreground">Vendor</label>
              <input value={fields.vendorName ?? ""} onChange={(e) => setFields({ ...fields, vendorName: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-card-foreground">Date</label>
              <input type="date" value={fields.documentDate ?? ""} onChange={(e) => setFields({ ...fields, documentDate: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-card-foreground">Amount</label>
              <input type="number" step="0.01" value={fields.amount ?? ""} onChange={(e) => setFields({ ...fields, amount: parseFloat(e.target.value) || null })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-card-foreground">Tax amount</label>
              <input type="number" step="0.01" value={fields.taxAmount ?? ""} onChange={(e) => setFields({ ...fields, taxAmount: parseFloat(e.target.value) || null })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-card-foreground">Description</label>
              <input value={fields.description ?? ""} onChange={(e) => setFields({ ...fields, description: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>

          {created ? (
            <p className="text-sm font-medium text-success">Draft expense {created} created — approve it from the Expenses page.</p>
          ) : (
            <button onClick={createExpense} disabled={loading || !fields.amount} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Create Draft Expense
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
