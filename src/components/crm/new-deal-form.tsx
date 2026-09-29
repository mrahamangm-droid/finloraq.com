"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Pipeline, PipelineStage } from "@/lib/prisma-enums";

interface Props {
  pipeline: Pipeline & { stages: PipelineStage[] };
}

export function NewDealForm({ pipeline }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openStages = pipeline.stages.filter((s) => !s.isLost);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      name:             fd.get("name") as string,
      value:            parseFloat(fd.get("value") as string) || 0,
      pipelineId:       pipeline.id,
      stageId:          fd.get("stageId") as string,
      expectedCloseDate: (fd.get("expectedCloseDate") as string) || null,
      notes:            (fd.get("notes") as string) || null,
    };
    try {
      const res = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create deal");
      } else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        + New Deal
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4 space-y-4"
    >
      <h2 className="text-sm font-medium text-foreground">New Deal</h2>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Deal name *</label>
          <input name="name" required className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. Acme Corp — Q4 Expansion" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Value</label>
          <input name="value" type="number" min="0" step="0.01" defaultValue="0" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Stage *</label>
          <select name="stageId" required className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            {openStages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Expected close</label>
          <input name="expectedCloseDate" type="date" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
          <input name="notes" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Deal"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
