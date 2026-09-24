"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Lock } from "lucide-react";
import { saveNavAction } from "@/app/(app)/settings/customize-actions";
import { SaveStatus } from "./settings-tabs";

interface Item { href: string; label: string }

export function NavEditor({ items, initialOrder, initialHidden, locked, canEdit }: {
  items: Item[];
  initialOrder: string[];
  initialHidden: string[];
  locked: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const byHref = new Map(items.map((i) => [i.href, i]));
  const [order, setOrder] = useState(initialOrder);
  const [hidden, setHidden] = useState(new Set(initialHidden));
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };
  const toggle = (href: string) => {
    const next = new Set(hidden);
    if (next.has(href)) next.delete(href); else next.add(href);
    setHidden(next);
  };

  async function save() {
    setState({ kind: "saving" });
    const res = await saveNavAction(order, [...hidden]);
    setState(res.ok ? { kind: "saved" } : { kind: "error", message: res.error });
    if (res.ok) router.refresh();
  }

  function reset() {
    setOrder(items.map((i) => i.href));
    setHidden(new Set());
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Only company admins can change the menu.
        </p>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {order.map((href, i) => {
          const item = byHref.get(href);
          if (!item) return null;
          const isLocked = locked.includes(href);
          const shown = !hidden.has(href);
          return (
            <li key={href} className="flex items-center gap-3 px-4 py-2.5">
              <label className={`flex flex-1 items-center gap-3 text-sm ${shown ? "text-card-foreground" : "text-muted-foreground line-through"}`}>
                <input type="checkbox" checked={shown} disabled={!canEdit || isLocked} onChange={() => toggle(href)} className="h-4 w-4" aria-label={`Show ${item.label}`} />
                {item.label}
                {isLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Always shown" />}
              </label>
              {canEdit && (
                <div className="flex">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-2 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Move ${item.label} up`}>
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} className="rounded p-2 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Move ${item.label} down`}>
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={state.kind === "saving"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Save menu
          </button>
          <button type="button" onClick={reset} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Reset to default</button>
          <SaveStatus state={state} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Hiding a section only removes it from the menu — it doesn&apos;t change anyone&apos;s permissions. Dashboard and Settings are always shown.
      </p>
    </div>
  );
}
