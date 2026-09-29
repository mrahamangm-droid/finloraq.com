"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Supplier } from "@/lib/prisma-enums";
import { displayFieldValue, type FieldDef } from "@/lib/customization/customFields";
import { CustomFieldInputs, fieldValues } from "@/components/custom-fields/custom-field-inputs";
import { updateSupplierAction, deleteSupplierAction, setSupplierActiveAction, type ActionResult } from "@/app/(app)/suppliers/actions";

const input = "w-full rounded-md border border-border bg-background px-2 py-1 text-sm";

/**
 * One row of the suppliers table. Owns its own edit-mode toggle so the
 * page stays a server component: viewing is plain cells, editing swaps
 * them for a form bound to updateSupplierAction, submitted with the
 * supplier's id already partially applied.
 */
export function SupplierRow({
  supplier,
  defs,
  canEdit,
  canDelete,
}: {
  supplier: Supplier;
  defs: FieldDef[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const colSpanActions = canDelete || canEdit;

  function act(fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        router.refresh();
        setEditing(false);
      } else {
        setError(res.error);
      }
    });
  }

  function onSubmit(formData: FormData) {
    act(() => updateSupplierAction(supplier.id, formData));
  }

  const btn = "text-xs font-medium hover:underline disabled:pointer-events-none disabled:opacity-50";
  const values = fieldValues(supplier.customFields);

  if (editing) {
    return (
      <tr className="border-b border-border bg-muted/20 last:border-0">
        <td colSpan={4 + defs.length + (colSpanActions ? 1 : 0)} className="px-4 py-3">
          <form action={onSubmit} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input name="name" required defaultValue={supplier.name} placeholder="Supplier name" className={input} />
            <input name="email" type="email" defaultValue={supplier.email ?? ""} placeholder="Email" className={input} />
            <input name="phone" defaultValue={supplier.phone ?? ""} placeholder="Phone" className={input} />
            <input name="taxRegNumber" defaultValue={supplier.taxRegNumber ?? ""} placeholder="Tax registration no." className={input} />
            <input name="paymentTermsDays" type="number" min={0} defaultValue={supplier.paymentTermsDays} placeholder="Payment terms (days)" className={input} />
            <CustomFieldInputs defs={defs} values={values} />
            <div className="flex items-center gap-3 lg:col-span-4">
              <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                Save
              </button>
              <button type="button" disabled={pending} onClick={() => { setEditing(false); setError(null); }} className={`${btn} text-muted-foreground`}>
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
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2 text-card-foreground">{supplier.name}</td>
      <td className="px-4 py-2 text-muted-foreground">{supplier.email ?? "—"}</td>
      <td className="px-4 py-2 text-muted-foreground">{supplier.phone ?? "—"}</td>
      <td className="px-4 py-2 text-muted-foreground">{supplier.paymentTermsDays} days</td>
      {defs.map((d) => (
        <td key={d.key} className="px-4 py-2 text-muted-foreground">{displayFieldValue(values[d.key])}</td>
      ))}
      {colSpanActions && (
        <td className="px-4 py-2">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center justify-end gap-3">
              {canEdit && (
                <button type="button" disabled={pending} onClick={() => setEditing(true)} className={`${btn} text-foreground`}>
                  Edit
                </button>
              )}
              {canDelete && supplier.isActive && (
                <>
                  <button type="button" disabled={pending} onClick={() => act(() => setSupplierActiveAction(supplier.id, false))} className={`${btn} text-muted-foreground`}>
                    Archive
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Permanently delete ${supplier.name}? This can't be undone.`)) {
                        act(() => deleteSupplierAction(supplier.id));
                      }
                    }}
                    className={`${btn} text-destructive`}
                  >
                    Delete
                  </button>
                </>
              )}
              {canDelete && !supplier.isActive && (
                <button type="button" disabled={pending} onClick={() => act(() => setSupplierActiveAction(supplier.id, true))} className={`${btn} text-muted-foreground`}>
                  Restore
                </button>
              )}
            </div>
            {error && <p className="max-w-[16rem] text-right text-xs text-destructive">{error}</p>}
          </div>
        </td>
      )}
    </tr>
  );
}
