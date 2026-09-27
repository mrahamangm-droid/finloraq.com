"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@prisma/client";

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
const input = "w-full rounded-md border border-border bg-background px-2 py-1 text-sm";

/**
 * One row of the Chart of Accounts. Code and type lock once the account
 * has posted journal lines (see updateAccount() in src/lib/accounts.ts —
 * every ledger builder keys off the code, so changing it under posted
 * history would silently reclassify the past); name and active status
 * stay editable always, since nothing downstream depends on those.
 */
export function AccountRow({ account, canEdit, canDelete, locked }: { account: Account; canEdit: boolean; canDelete: boolean; locked: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(account.code);
  const [name, setName] = useState(account.name);
  const [type, setType] = useState<(typeof ACCOUNT_TYPES)[number]>(account.type);

  const btn = "text-xs font-medium hover:underline disabled:pointer-events-none disabled:opacity-50";
  const codeLocked = locked || account.isSystem;

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
    const ok = await call(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(codeLocked ? { name } : { code, name, type }),
    });
    if (ok) setEditing(false);
  }

  async function remove() {
    if (!window.confirm(`Permanently delete ${account.code} · ${account.name}? This can't be undone.`)) return;
    await call(`/api/accounts/${account.id}`, { method: "DELETE" });
  }

  async function toggleActive() {
    await call(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !account.isActive }),
    });
  }

  if (editing) {
    return (
      <tr className="border-b border-border bg-muted/20 last:border-0">
        <td colSpan={4} className="px-4 py-3">
          <form onSubmit={save} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input required value={code} disabled={codeLocked} onChange={(e) => setCode(e.target.value)} placeholder="Code" className={`${input} disabled:opacity-50`} />
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={input} />
            <select value={type} disabled={codeLocked} onChange={(e) => setType(e.target.value as typeof type)} className={`${input} disabled:opacity-50`}>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
            </select>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={loading} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Save</button>
              <button type="button" disabled={loading} onClick={() => { setEditing(false); setError(null); }} className={`${btn} text-muted-foreground`}>Cancel</button>
            </div>
            {codeLocked && <p className="text-xs text-muted-foreground sm:col-span-4">Code and type are locked — this account has posted journal lines (or is a system account).</p>}
            {error && <p className="text-xs text-destructive sm:col-span-4">{error}</p>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="w-24 px-4 py-2 text-muted-foreground">{account.code}</td>
      <td className={`px-4 py-2 ${account.isActive ? "text-card-foreground" : "text-muted-foreground line-through"}`}>{account.name}</td>
      <td className="px-4 py-2 text-right text-xs text-muted-foreground">{account.isSystem ? "System" : !account.isActive ? "Inactive" : ""}</td>
      {(canEdit || canDelete) && (
        <td className="px-4 py-2">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center justify-end gap-3">
              {canEdit && <button type="button" disabled={loading} onClick={() => setEditing(true)} className={`${btn} text-foreground`}>Edit</button>}
              {canEdit && <button type="button" disabled={loading} onClick={toggleActive} className={`${btn} text-muted-foreground`}>{account.isActive ? "Deactivate" : "Activate"}</button>}
              {canDelete && !account.isSystem && <button type="button" disabled={loading} onClick={remove} className={`${btn} text-destructive`}>Delete</button>}
            </div>
            {error && <p className="max-w-[16rem] text-right text-xs text-destructive">{error}</p>}
          </div>
        </td>
      )}
    </tr>
  );
}
