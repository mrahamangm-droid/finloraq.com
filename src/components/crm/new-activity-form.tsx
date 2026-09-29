"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewActivityForm({
  dealId,
  leadId,
  contactId,
  customerId,
}: {
  dealId?: string;
  leadId?: string;
  contactId?: string;
  customerId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      type:       fd.get("type") as string,
      subject:    fd.get("subject") as string,
      notes:      (fd.get("notes") as string) || null,
      dueAt:      (fd.get("dueAt") as string) ? new Date(fd.get("dueAt") as string).toISOString() : null,
      dealId:     dealId ?? null,
      leadId:     leadId ?? null,
      contactId:  contactId ?? null,
      customerId: customerId ?? null,
    };
    try {
      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create activity");
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
        + Log Activity
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4 space-y-4"
    >
      <h2 className="text-sm font-medium text-foreground">Log Activity</h2>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Type *</label>
          <select name="type" required className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="CALL">📞 Call</option>
            <option value="EMAIL">📧 Email</option>
            <option value="MEETING">🗓️ Meeting</option>
            <option value="TASK">✅ Task</option>
            <option value="NOTE">📝 Note</option>
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Subject *</label>
          <input name="subject" required placeholder="e.g. Follow-up call with Sarah" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Due date / time</label>
          <input name="dueAt" type="datetime-local" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
          <textarea name="notes" rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Activity"}
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
