"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomerAction, setCustomerActiveAction, type ActionResult } from "@/app/(app)/customers/actions";

/**
 * Admin-only row controls for a customer: Archive (hide without losing
 * invoice history), Restore, and Delete (only possible while the customer
 * has never been invoiced — deleteCustomerAction refuses it otherwise and
 * the error shows up inline, pointing at Archive as the alternative).
 */
export function CustomerRowActions({ customerId, name, isActive }: { customerId: string; name: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const btn = "text-xs font-medium hover:underline disabled:pointer-events-none disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-3">
        {isActive ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => setCustomerActiveAction(customerId, false))}
              className={`${btn} text-muted-foreground`}
            >
              Archive
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Permanently delete ${name}? This can't be undone.`)) {
                  act(() => deleteCustomerAction(customerId));
                }
              }}
              className={`${btn} text-destructive`}
            >
              Delete
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => setCustomerActiveAction(customerId, true))}
            className={`${btn} text-muted-foreground`}
          >
            Restore
          </button>
        )}
      </div>
      {error && <p className="max-w-[16rem] text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
