"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/rbac";
import { PeriodCloseError, lockPeriodsThrough, unlockPeriod } from "@/lib/periodClose";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

async function run(fn: () => Promise<string>, forbidden: string): Promise<ActionResult> {
  try {
    const message = await fn();
    revalidatePath("/accounting/periods");
    return { ok: true, message };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: forbidden };
    if (err instanceof PeriodCloseError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function lockThroughAction(through: string): Promise<ActionResult> {
  const { active, userId } = await requireTenantContext();
  return run(async () => {
    const r = await lockPeriodsThrough({ companyId: active.companyId, membershipId: active.id, userId, through });
    return `Locked ${r.months.length} month${r.months.length === 1 ? "" : "s"} through ${r.lockedThrough}.`;
  }, "Only people who can approve journal entries can lock periods.");
}

export async function unlockAction(name: string, reason: string): Promise<ActionResult> {
  const { active, userId } = await requireTenantContext();
  return run(async () => {
    const r = await unlockPeriod({ companyId: active.companyId, membershipId: active.id, userId, name, reason });
    return `Reopened ${r.reopened}.`;
  }, "Only a Company Admin or CFO can reopen a locked period.");
}
