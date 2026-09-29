"use server";

import { revalidatePath } from "next/cache";
import type { CustomFieldEntity, CustomFieldType } from "@prisma/client";
import { requireTenantContext } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/rbac";
import {
  BrandingError, createCustomField, resetDashboardLayout, saveBranding, saveDashboardLayout, saveNavConfig,
  savePreferences, updateCustomField, type Preferences,
} from "@/lib/customization/server";
import { CustomFieldError } from "@/lib/customization/customFields";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<void>, paths: string[]): Promise<ActionResult> {
  try {
    await fn();
    paths.forEach((p) => revalidatePath(p, "layout"));
    return { ok: true };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "Only people who can edit company settings can change this." };
    if (err instanceof BrandingError || err instanceof CustomFieldError) return { ok: false, error: err.message };
    throw err;
  }
}

// ---- personal ------------------------------------------------------------

export async function savePreferencesAction(prefs: Partial<Preferences>): Promise<ActionResult> {
  const { userId } = await requireTenantContext();
  return run(() => savePreferences(userId, prefs), ["/"]);
}

export async function saveDashboardAction(widgets: unknown, range: unknown): Promise<ActionResult> {
  const { active } = await requireTenantContext();
  return run(() => saveDashboardLayout(active.id, widgets, range), ["/dashboard"]);
}

export async function resetDashboardAction(): Promise<ActionResult> {
  const { active } = await requireTenantContext();
  return run(() => resetDashboardLayout(active.id), ["/dashboard"]);
}

// ---- company-wide (admins) -----------------------------------------------

export async function saveNavAction(order: string[], hidden: string[]): Promise<ActionResult> {
  const { active, userId } = await requireTenantContext();
  return run(() => saveNavConfig({ companyId: active.companyId, membershipId: active.id, userId, order, hidden }), ["/"]);
}

export async function saveBrandingAction(input: {
  brandColor: string | null;
  invoiceFooter: string | null;
  invoiceTerms: string | null;
}): Promise<ActionResult> {
  const { active, userId } = await requireTenantContext();
  return run(() => saveBranding({ companyId: active.companyId, membershipId: active.id, userId, ...input }), ["/"]);
}

export async function createCustomFieldAction(input: {
  entity: CustomFieldEntity;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
}): Promise<ActionResult> {
  const { active, userId } = await requireTenantContext();
  if (!["CUSTOMER", "SUPPLIER", "INVOICE"].includes(input.entity)) return { ok: false, error: "Unknown record type." };
  if (!["TEXT", "NUMBER", "DATE", "SELECT", "CHECKBOX"].includes(input.type)) return { ok: false, error: "Unknown field type." };
  return run(async () => {
    await createCustomField({ companyId: active.companyId, membershipId: active.id, userId, ...input });
  }, ["/settings/custom-fields", "/customers", "/suppliers", "/sales"]);
}

export async function updateCustomFieldAction(
  id: string,
  patch: { isActive?: boolean; required?: boolean; move?: "up" | "down"; label?: string },
): Promise<ActionResult> {
  const { active, userId } = await requireTenantContext();
  return run(() => updateCustomField({ companyId: active.companyId, membershipId: active.id, userId, id, ...patch }), [
    "/settings/custom-fields", "/customers", "/suppliers", "/sales",
  ]);
}
