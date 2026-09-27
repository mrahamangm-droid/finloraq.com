"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProjectProfitability } from "@/lib/projects";
import { MathInput } from "@/components/forms/math-input";

const input = "w-full rounded-md border border-border bg-background px-2 py-1 text-sm";

/**
 * One row of the projects table. Owns its own edit-mode toggle: viewing
 * shows the profitability summary (revenue/cost/margin/budget, all
 * derived live from posted invoices/bills — editing name/code/customer/
 * budget here never touches that history), editing swaps the row for a
 * form bound to PATCH /api/projects/:id.
 */
export function ProjectRow({
  p,
  customers,
  revenueDisplay,
  costDisplay,
  marginDisplay,
  canEdit,
  canDelete,
}: {
  p: ProjectProfitability;
  customers: { id: string; name: string }[];
  revenueDisplay: string;
  costDisplay: string;
  marginDisplay: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(p.project.name);
  const [code, setCode] = useState(p.project.code);
  const [customerId, setCustomerId] = useState(p.project.customerId ?? "");
  const [budget, setBudget] = useState(p.budget !== null ? String(p.budget) : "");

  const colCount = 6 + (canDelete || canEdit ? 1 : 0);
  const btn = "text-xs font-medium hover:underline disabled:pointer-events-none disabled:opacity-50";

  async function call(url: string, init: RequestInit) {
    setLoading(true);
    setError(null);
    const res = await fetch(url, init);
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call(`/api/projects/${p.project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        code,
        customerId: customerId || null,
        budget: budget ? parseFloat(budget) : null,
      }),
    });
    if (ok) setEditing(false);
  }

  async function setActive(next: boolean) {
    await call(`/api/projects/${p.project.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });
  }

  async function remove() {
    if (!window.confirm(`Permanently delete ${p.project.name}? This can't be undone.`)) return;
    await call(`/api/projects/${p.project.id}`, { method: "DELETE" });
  }

  if (editing) {
    return (
      <tr className="border-b border-border bg-muted/20 last:border-0">
        <td colSpan={colCount} className="px-4 py-3">
          <form onSubmit={save} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input required placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
            <input required placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} className={input} />
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={input}>
              <option value="">No customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <MathInput decimals={2} placeholder="Budget (optional)" value={budget} onChange={setBudget} className={input} />
            <div className="flex items-center gap-3 lg:col-span-4">
              <button type="submit" disabled={loading} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                Save
              </button>
              <button type="button" disabled={loading} onClick={() => { setEditing(false); setError(null); }} className={`${btn} text-muted-foreground`}>
                Cancel
              </button>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30">
      <td className="px-4 py-2">
        <Link href={`/projects/${p.project.id}`} className="text-primary">{p.project.name}</Link>
        <span className="ml-1 font-mono text-xs text-muted-foreground">{p.project.code}</span>
      </td>
      <td className="px-4 py-2 text-right text-card-foreground">{revenueDisplay}</td>
      <td className="px-4 py-2 text-right text-card-foreground">{costDisplay}</td>
      <td className={`px-4 py-2 text-right font-medium ${p.margin < 0 ? "text-destructive" : "text-success"}`}>{marginDisplay}</td>
      <td className="px-4 py-2 text-right text-muted-foreground">{p.budget !== null ? p.budget.toFixed(2) : "—"}</td>
      <td className="px-4 py-2 text-right text-muted-foreground">{p.budgetVariance !== null ? p.budgetVariance.toFixed(2) : "—"}</td>
      {(canDelete || canEdit) && (
        <td className="px-4 py-2">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center justify-end gap-3">
              {canEdit && (
                <button type="button" disabled={loading} onClick={() => setEditing(true)} className={`${btn} text-foreground`}>
                  Edit
                </button>
              )}
              {canDelete && p.project.isActive && (
                <>
                  <button type="button" disabled={loading} onClick={() => setActive(false)} className={`${btn} text-muted-foreground`}>Archive</button>
                  <button type="button" disabled={loading} onClick={remove} className={`${btn} text-destructive`}>Delete</button>
                </>
              )}
              {canDelete && !p.project.isActive && (
                <button type="button" disabled={loading} onClick={() => setActive(true)} className={`${btn} text-muted-foreground`}>Restore</button>
              )}
            </div>
            {error && <p className="max-w-[16rem] text-right text-xs text-destructive">{error}</p>}
          </div>
        </td>
      )}
    </tr>
  );
}
