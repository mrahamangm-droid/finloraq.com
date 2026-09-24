"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, SlidersHorizontal, X } from "lucide-react";
import { resetDashboardAction, saveDashboardAction } from "@/app/(app)/settings/customize-actions";

interface Props {
  widgets: Array<{ id: string; visible: boolean }>;
  range: string;
  catalog: Array<{ id: string; label: string }>;
  ranges: Array<{ id: string; label: string }>;
}

/** "Customize" button + panel: show/hide and reorder cards, pick the period. Saved per user, per company. */
export function DashboardCustomizer({ widgets, range, catalog, ranges }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(widgets);
  const [period, setPeriod] = useState(range);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = new Map(catalog.map((c) => [c.id, c.label]));

  useEffect(() => {
    if (open) { setList(widgets); setPeriod(range); setError(null); }
  }, [open, widgets, range]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setList(next);
  };

  const save = () => start(async () => {
    const res = await saveDashboardAction(list, period);
    if (!res.ok) return setError(res.error);
    setOpen(false);
    router.refresh();
  });

  const reset = () => start(async () => {
    const res = await resetDashboardAction();
    if (!res.ok) return setError(res.error);
    setOpen(false);
    router.refresh();
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
        <SlidersHorizontal className="h-4 w-4" /> Customize
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="dash-cust-title">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 id="dash-cust-title" className="text-base font-semibold text-card-foreground">Customize dashboard</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 hover:bg-muted" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Default period (when none is picked above)</span>
                <select id="dash-range" value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  {ranges.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>

              <div>
                <div className="text-xs font-medium text-muted-foreground">Cards — tick to show, arrows to reorder</div>
                <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                  {list.map((w, i) => (
                    <li key={w.id} className="flex items-center gap-2 px-3 py-1.5">
                      <label className="flex flex-1 items-center gap-3 py-1 text-sm text-card-foreground">
                        <input
                          type="checkbox"
                          checked={w.visible}
                          onChange={() => setList(list.map((x) => (x.id === w.id ? { ...x, visible: !x.visible } : x)))}
                          className="h-4 w-4"
                        />
                        {label.get(w.id) ?? w.id}
                      </label>
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-2 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Move up">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="rounded p-2 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Move down">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={reset} disabled={pending} className="text-sm text-muted-foreground hover:text-foreground">Reset to default</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Cancel</button>
                <button type="button" onClick={save} disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
