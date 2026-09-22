"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

/**
 * Company profile fields only (name/legal name/timezone/fiscal year end/tax
 * registration number). Anything that changes accounting behaviour —
 * baseCurrency, countryCode (which drives the seeded tax pack) — is
 * deliberately NOT editable here: changing those after ledger activity has
 * started would silently invalidate historical reports, so that's left as
 * a data-migration-guarded operation for a later phase rather than a form
 * field.
 */
export async function updateCompanySettingsAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");

  const before = await prisma.company.findUniqueOrThrow({ where: { id: active.companyId } });

  const updated = await prisma.company.update({
    where: { id: active.companyId },
    data: {
      name: String(formData.get("name") ?? before.name),
      legalName: (formData.get("legalName") as string) || null,
      timezone: String(formData.get("timezone") ?? before.timezone),
      fiscalYearEnd: Number(formData.get("fiscalYearEnd") ?? before.fiscalYearEnd),
      taxRegNumber: (formData.get("taxRegNumber") as string) || null,
    },
  });

  await recordAuditEvent({
    companyId: active.companyId,
    userId,
    action: "company.settings_updated",
    entityType: "Company",
    entityId: active.companyId,
    previousValue: { name: before.name, legalName: before.legalName, timezone: before.timezone, fiscalYearEnd: before.fiscalYearEnd, taxRegNumber: before.taxRegNumber },
    newValue: { name: updated.name, legalName: updated.legalName, timezone: updated.timezone, fiscalYearEnd: updated.fiscalYearEnd, taxRegNumber: updated.taxRegNumber },
    source: "web",
  });

  revalidatePath("/settings");
}
