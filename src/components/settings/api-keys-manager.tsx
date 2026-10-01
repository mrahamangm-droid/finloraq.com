"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";

export interface ApiKeyRow {
  id: string;
  label: string;
  role: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdByName: string;
}

const ROLE_LABEL: Record<string, string> = {
  AUDITOR: "Read-only",
  ACCOUNTANT: "Read + create drafts",
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export function ApiKeysManager({ rows, canEdit, planAllows }: { rows: ApiKeyRow[]; canEdit: boolean; planAllows: boolean }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [role, setRole] = useState("AUDITOR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, role }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create the key.");
      return;
    }
    setNewKey(data.key);
    setCopied(false);
    setLabel("");
    router.refresh();
  }

  async function revoke(row: ApiKeyRow) {
    if (!window.confirm(`Revoke "${row.label}"? Anything using it stops working immediately.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/api-keys/${row.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not revoke the key.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {newKey && (
        <div role="status" className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <p className="font-medium text-foreground">Copy your new key now — it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 font-mono text-xs">{newKey}</code>
            <button
              type="button"
              aria-label="Copy API key"
              onClick={() => {
                void navigator.clipboard?.writeText(newKey).then(() => setCopied(true));
              }}
              className="rounded-md border border-border p-1.5 hover:bg-muted"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          {copied && <p className="text-xs text-muted-foreground">Copied.</p>}
          <button type="button" onClick={() => setNewKey(null)} className="text-xs text-primary hover:underline">I&apos;ve saved it</button>
        </div>
      )}

      {canEdit && planAllows && (
        <form onSubmit={create} className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3">
          <label className="text-xs font-medium text-muted-foreground sm:col-span-1">
            Name
            <input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} placeholder="e.g. Power BI sync" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Access
            <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="AUDITOR">Read-only</option>
              <option value="ACCOUNTANT">Read + create draft invoices &amp; bills</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={busy} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {busy ? "Creating…" : "Create key"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Access</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Last used</th>
              <th className="px-4 py-3">Status</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={canEdit ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground">No API keys yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={r.revokedAt ? "opacity-50" : ""}>
                <td className="px-4 py-3 text-foreground">{r.label}<div className="text-xs text-muted-foreground">by {r.createdByName}</div></td>
                <td className="px-4 py-3 font-mono text-xs">{r.prefix}…</td>
                <td className="px-4 py-3 text-muted-foreground">{ROLE_LABEL[r.role] ?? r.role}</td>
                <td className="px-4 py-3 text-muted-foreground">{day(r.createdAt)}</td>
                <td className="px-4 py-3 text-muted-foreground">{day(r.lastUsedAt)}</td>
                <td className="px-4 py-3">{r.revokedAt ? `Revoked ${day(r.revokedAt)}` : <span className="text-emerald-600">Active</span>}</td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    {!r.revokedAt && (
                      <button type="button" disabled={busy} onClick={() => void revoke(r)} className="text-xs text-destructive hover:underline disabled:opacity-50">
                        Revoke
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
