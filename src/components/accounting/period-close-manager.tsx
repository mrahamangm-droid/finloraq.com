"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lockThroughAction, unlockAction } from "@/app/(app)/accounting/periods/actions";

interface Period {
  name: string;
  status: "OPEN" | "CLOSING" | "LOCKED";
  lockedAt: string | null;
  lockedByName: string | null;
  postedEntries: number;
  draftEntries: number;
}

const inputCls = "rounded-md border border-border bg-background px-3 py-2 text-sm";
const btn = "rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50";

export function PeriodCloseManager({
  periods,
  latestLocked,
  currentMonth,
  canLock,
  canUnlock,
}: {
  periods: Period[];
  latestLocked: string | null;
  currentMonth: string;
  canLock: boolean;
  canUnlock: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // `periods` is newest-first. Default to the most recent finished month (a
  // close is normally for last month), else the current one.
  const openMonths = periods.filter((p) => p.status !== "LOCKED" && p.name <= currentMonth).map((p) => p.name);
  const [through, setThrough] = useState(openMonths.find((m) => m < currentMonth) ?? openMonths[0] ?? "");
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");

  function act(fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      setMessage(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {canLock && openMonths.length > 0 && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!through) return;
            if (!window.confirm(`Lock every month through ${through}? Nothing can be posted into a locked month.`)) return;
            act(() => lockThroughAction(through));
          }}
        >
          <label className="text-sm font-medium text-card-foreground">
            Lock everything through
            <select className={`${inputCls} mt-1 block`} value={through} onChange={(e) => setThrough(e.target.value)}>
              {openMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending || !through} className={`${btn} bg-primary text-primary-foreground`}>
            Lock
          </button>
          <p className="basis-full text-xs text-muted-foreground">
            Earlier months are locked too. Draft expenses, invoices or bills dated in those months must be posted, deleted or
            re-dated first.
          </p>
        </form>
      )}

      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-destructive"}`}>
          {message.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2">Month</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Posted entries</th>
              <th className="px-4 py-2 text-right">Drafts</th>
              <th className="px-4 py-2">Locked</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.name} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-2 font-medium text-card-foreground">{p.name}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.status === "LOCKED" ? "bg-muted text-foreground" : "bg-success/10 text-success"}`}
                  >
                    {p.status === "LOCKED" ? "Locked" : "Open"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{p.postedEntries}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.draftEntries || ""}</td>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {p.lockedAt ? `${p.lockedAt}${p.lockedByName ? ` · ${p.lockedByName}` : ""}` : ""}
                </td>
                <td className="px-4 py-2 text-right">
                  {canUnlock && p.name === latestLocked && !reopening && (
                    <button type="button" className={`${btn} border border-border`} onClick={() => setReopening(true)}>
                      Reopen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reopening && latestLocked && (
        <form
          className="space-y-2 rounded-lg border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => unlockAction(latestLocked, reason), () => {
              setReopening(false);
              setReason("");
            });
          }}
        >
          <label className="block text-sm font-medium text-card-foreground">
            Why reopen {latestLocked}? This is kept in the audit log.
            <textarea className={`${inputCls} mt-1 block w-full`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} required />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={`${btn} bg-primary text-primary-foreground`}>
              Reopen {latestLocked}
            </button>
            <button type="button" className={`${btn} border border-border`} onClick={() => setReopening(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
