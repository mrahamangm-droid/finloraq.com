"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewContactForm() {
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
      firstName:  fd.get("firstName") as string,
      lastName:   fd.get("lastName")  as string,
      email:      (fd.get("email")      as string) || null,
      phone:      (fd.get("phone")      as string) || null,
      title:      (fd.get("title")      as string) || null,
      department: (fd.get("department") as string) || null,
    };
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create contact");
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
        + Add Contact
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4 space-y-4"
    >
      <h2 className="text-sm font-medium text-foreground">New Contact</h2>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">First name *</label>
          <input name="firstName" required className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Last name *</label>
          <input name="lastName" required className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
          <input name="email" type="email" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
          <input name="phone" type="tel" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
          <input name="title" placeholder="CEO, VP Sales…" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Department</label>
          <input name="department" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Contact"}
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
