"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { createCustomFieldAction, updateCustomFieldAction } from "@/app/(app)/settings/customize-actions";
import { SaveStatus } from "./settings-tabs";

type Entity = "CUSTOMER" | "SUPPLIER" | "INVOICE";
type FType = "TEXT" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";

interface FieldRow {
  id: string;
  entity: Entity;
  key: string;
  label: string;
  type: FType;
  options: string[];
  required: boolean;
  isActive: boolean;
}

const ENTITY_LABEL: Record<Entity, string> = { CUSTOMER: "Customers", SUPPLIER: "Suppliers", INVOICE: "Invoices" };
const TYPE_LABEL: Record<FType, string> = { TEXT: "Text", NUMBER: "Number", DATE: "Date", SELECT: "Dropdown", CHECKBOX: "Yes / No" };
const input = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function CustomFieldsManager({ fields, canEdit }: { fields: FieldRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const [draft, setDraft] = useState<{ entity: Entity; label: string; type: FType; options: string; required: boolean }>({
    entity: "CUSTOMER", label: "", type: "TEXT", options: "", required: false,
  });

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setState({ kind: "saving" });
    startTransition(async () => {
      const res = await fn();
      setState(res.ok ? { kind: "saved" } : { kind: "error", message: res.error });
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    act(
      () => createCustomFieldAction({
        entity: draft.entity, label: draft.label, type: draft.type, required: draft.required,
        options: draft.options.split(/\n|,/).map((o) => o.trim()).filter(Boolean),
      }),
      () => setDraft({ ...draft, label: "", options: "", required: false }),
    );
  }

  return (
    <div className="space-y-6">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          You can see the fields your company uses, but only company admins can add or change them.
        </p>
      )}

      {canEdit && (
        <form onSubmit={add} className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium text-card-foreground">Add a field</div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Add to</span>
              <select id="cf-entity" value={draft.entity} onChange={(e) => setDraft({ ...draft, entity: e.target.value as Entity })} className={input}>
                {(Object.keys(ENTITY_LABEL) as Entity[]).map((k) => <option key={k} value={k}>{ENTITY_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-1 lg:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Field name</span>
              <input id="cf-label" required maxLength={60} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="e.g. PO number, Account manager, Credit limit" className={input} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Type</span>
              <select id="cf-type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as FType })} className={input}>
                {(Object.keys(TYPE_LABEL) as FType[]).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
              </select>
            </label>
            {draft.type === "SELECT" && (
              <label className="block sm:col-span-2 lg:col-span-4">
                <span className="text-xs font-medium text-muted-foreground">Options (one per line, or comma-separated)</span>
                <textarea id="cf-options" rows={3} value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })}
                  placeholder={"Gold\nSilver\nBronze"} className={input} />
              </label>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {draft.type !== "CHECKBOX" ? (
              <label className="flex items-center gap-2 text-sm text-card-foreground">
                <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} className="h-4 w-4" />
                Required
              </label>
            ) : <span />}
            <div className="flex items-center gap-3">
              <SaveStatus state={state} />
              <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                Add field
              </button>
            </div>
          </div>
        </form>
      )}

      {(Object.keys(ENTITY_LABEL) as Entity[]).map((entity) => {
        const rows = fields.filter((f) => f.entity === entity);
        return (
          <section key={entity} className="rounded-lg border border-border bg-card">
            <h2 className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ENTITY_LABEL[entity]}</h2>
            {rows.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">No custom fields yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((f, i) => (
                  <li key={f.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${f.isActive ? "" : "opacity-60"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-card-foreground">
                        {f.label}
                        {f.required && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Required</span>}
                        {!f.isActive && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Hidden</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {TYPE_LABEL[f.type]}{f.type === "SELECT" && f.options.length ? ` · ${f.options.join(", ")}` : ""}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={pending || i === 0} onClick={() => act(() => updateCustomFieldAction(f.id, { move: "up" }))}
                          className="rounded p-2 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Move ${f.label} up`}>
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button type="button" disabled={pending || i === rows.length - 1} onClick={() => act(() => updateCustomFieldAction(f.id, { move: "down" }))}
                          className="rounded p-2 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Move ${f.label} down`}>
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        {f.type !== "CHECKBOX" && (
                          <button type="button" disabled={pending} onClick={() => act(() => updateCustomFieldAction(f.id, { required: !f.required }))}
                            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">
                            {f.required ? "Make optional" : "Make required"}
                          </button>
                        )}
                        <button type="button" disabled={pending} onClick={() => act(() => updateCustomFieldAction(f.id, { isActive: !f.isActive }))}
                          className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">
                          {f.isActive ? "Hide" : "Show"}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">Hiding a field keeps the values already entered — show it again any time.</p>
    </div>
  );
}
