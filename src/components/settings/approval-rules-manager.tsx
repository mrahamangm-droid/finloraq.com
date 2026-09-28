"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createApprovalRuleAction, deleteApprovalRuleAction, setApprovalRuleActiveAction } from "@/app/(app)/settings/approval-actions";
import { SaveStatus } from "@/components/settings/customize/settings-tabs";

type Role = "FINANCE_MANAGER" | "CFO" | "COMPANY_ADMIN";
interface Rule {
  id: string;
  minAmount: number | null;
  maxAmount: number | null;
  requiredRole: string;
  isActive: boolean;
  timesUsed: number;
}

const ROLE_LABEL: Record<string, string> = { FINANCE_MANAGER: "Finance Manager or above", CFO: "CFO or above", COMPANY_ADMIN: "Company Admin" };
const input = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function rangeLabel(r: Rule, currency: string) {
  const f = (n: number) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (r.minAmount === null && r.maxAmount === null) return "Every expense";
  if (r.minAmount === null) return `Up to ${f(r.maxAmount!)}`;
  if (r.maxAmount === null) return `${f(r.minAmount)} and above`;
  return `${f(r.minAmount)} – ${f(r.maxAmount)}`;
}

export function ApprovalRulesManager({ rules, canEdit, currency }: { rules: Rule[]; canEdit: boolean; currency: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [role, setRole] = useState<Role>("FINANCE_MANAGER");

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

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <p>
          When an expense&apos;s amount falls in a rule&apos;s range, only that role <em>or a more senior one</em> can approve it
          (Finance Manager &lt; CFO &lt; Company Admin). If ranges overlap, the most senior requirement applies. Amounts no rule
          covers can be approved by anyone who can approve journals, as before.
        </p>
        <p className="mt-2">
          Whoever submitted an expense can&apos;t approve it themselves, unless nobody else in the company is able to.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Expense amount</th>
              <th className="px-4 py-2">Must be approved by</th>
              <th className="px-4 py-2">Status</th>
              {canEdit && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 4 : 3} className="px-4 py-6 text-center text-muted-foreground">
                  No rules yet — anyone who can approve journals can approve any expense.
                </td>
              </tr>
            )}
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-card-foreground">{rangeLabel(r, currency)}</td>
                <td className="px-4 py-2 text-card-foreground">{ROLE_LABEL[r.requiredRole] ?? r.requiredRole}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.isActive ? "On" : "Off"}</td>
                {canEdit && (
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-3">
                      <button className="text-xs font-medium text-foreground hover:underline" onClick={() => act(() => setApprovalRuleActiveAction(r.id, !r.isActive))}>
                        {r.isActive ? "Turn off" : "Turn on"}
                      </button>
                      {r.timesUsed === 0 && (
                        <button
                          className="text-xs font-medium text-destructive hover:underline"
                          onClick={() => window.confirm("Delete this rule?") && act(() => deleteApprovalRuleAction(r.id))}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <form
          className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => createApprovalRuleAction({ minAmount: num(min), maxAmount: num(max), requiredRole: role }), () => {
              setMin("");
              setMax("");
            });
          }}
        >
          <label className="text-sm">
            From ({currency})
            <input className={input} inputMode="decimal" placeholder="No minimum" value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label className="text-sm">
            Up to ({currency})
            <input className={input} inputMode="decimal" placeholder="No maximum" value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
          <label className="text-sm">
            Approved by
            <select className={input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="FINANCE_MANAGER">Finance Manager or above</option>
              <option value="CFO">CFO or above</option>
              <option value="COMPANY_ADMIN">Company Admin</option>
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button type="submit" className="whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              Add rule
            </button>
            <SaveStatus state={state} />
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Only people who can edit company settings can change these rules.</p>
      )}
    </div>
  );
}
