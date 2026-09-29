"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import {
  createReconciliation,
  toggleTransaction,
  completeReconciliation,
} from "@/lib/bank-reconciliation";

export async function createReconciliationAction(
  bankAccountId: string,
  formData: FormData
) {
  const { active, userId } = await requireTenantContext();
  const statementDate = new Date(formData.get("statementDate") as string);
  const openingBalance = parseFloat(formData.get("openingBalance") as string);
  const closingBalance = parseFloat(formData.get("closingBalance") as string);

  if (isNaN(statementDate.getTime()) || isNaN(openingBalance) || isNaN(closingBalance)) {
    throw new Error("Invalid reconciliation data.");
  }

  const rec = await createReconciliation(
    active.companyId,
    active.id,
    bankAccountId,
    statementDate,
    openingBalance,
    closingBalance
  );

  revalidatePath(`/banking/${bankAccountId}/reconcile`);
  redirect(`/banking/${bankAccountId}/reconcile/${rec.id}`);
}

export async function toggleTransactionAction(
  bankAccountId: string,
  reconciliationId: string,
  transactionId: string,
  cleared: boolean
) {
  const { active } = await requireTenantContext();
  await toggleTransaction(active.companyId, active.id, reconciliationId, transactionId, cleared);
  revalidatePath(`/banking/${bankAccountId}/reconcile/${reconciliationId}`);
}

export async function completeReconciliationAction(
  bankAccountId: string,
  reconciliationId: string
) {
  const { active, userId } = await requireTenantContext();
  await completeReconciliation(active.companyId, active.id, userId, reconciliationId);
  revalidatePath(`/banking/${bankAccountId}/reconcile`);
  redirect(`/banking/${bankAccountId}/reconcile`);
}
