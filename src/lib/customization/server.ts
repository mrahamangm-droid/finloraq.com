import { cache } from "react";
import type { CustomFieldEntity, CustomFieldType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { requirePermission } from "@/lib/rbac";
import { NAV } from "@/components/nav/nav-items";
import { DATE_FORMATS, NUMBER_FORMATS, makeFormatter } from "./format";
import { normalizeLayout, normalizeRange, type WidgetSetting, type RangeId } from "./widgets";
import { LOCKED_NAV, normalizeNavConfig, type NavConfig } from "./nav";
import { CustomFieldError, fieldKey, type FieldDef } from "./customFields";
import { normalizeHex } from "./color";

// ------------------------------------------------------------------ preferences

export const THEMES = ["system", "light", "dark"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;
export type Theme = (typeof THEMES)[number];
export type Density = (typeof DENSITIES)[number];

export interface Preferences {
  theme: Theme;
  density: Density;
  landingPage: string;
  dateFormat: string;
  numberFormat: string;
}

const DEFAULT_PREFS: Preferences = {
  theme: "system",
  density: "comfortable",
  landingPage: "/dashboard",
  dateFormat: "YYYY-MM-DD",
  numberFormat: "1,234.56",
};

const NAV_HREFS = NAV.map((n) => n.href as string);

/** One query per request, however many components ask. */
export const getPreferences = cache(async (userId: string): Promise<Preferences> => {
  const p = await prisma.userPreference.findUnique({ where: { userId } });
  if (!p) return DEFAULT_PREFS;
  return {
    theme: (THEMES as readonly string[]).includes(p.theme) ? (p.theme as Theme) : "system",
    density: (DENSITIES as readonly string[]).includes(p.density) ? (p.density as Density) : "comfortable",
    landingPage: NAV_HREFS.includes(p.landingPage) ? p.landingPage : "/dashboard",
    dateFormat: p.dateFormat,
    numberFormat: p.numberFormat,
  };
});

export async function getFormatter(userId: string) {
  const p = await getPreferences(userId);
  return makeFormatter(p.numberFormat, p.dateFormat);
}

export async function savePreferences(userId: string, input: Partial<Preferences>): Promise<void> {
  const data: Partial<Preferences> = {};
  if (input.theme && (THEMES as readonly string[]).includes(input.theme)) data.theme = input.theme;
  if (input.density && (DENSITIES as readonly string[]).includes(input.density)) data.density = input.density;
  if (input.landingPage && NAV_HREFS.includes(input.landingPage)) data.landingPage = input.landingPage;
  if (input.dateFormat && (DATE_FORMATS as readonly string[]).includes(input.dateFormat)) data.dateFormat = input.dateFormat;
  if (input.numberFormat && input.numberFormat in NUMBER_FORMATS) data.numberFormat = input.numberFormat;
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, ...DEFAULT_PREFS, ...data },
    update: data,
  });
}

// ------------------------------------------------------------------ dashboard

export async function getDashboardLayout(membershipId: string): Promise<{ widgets: WidgetSetting[]; range: RangeId }> {
  const l = await prisma.dashboardLayout.findUnique({ where: { membershipId } });
  return { widgets: normalizeLayout(l?.widgets), range: normalizeRange(l?.range) };
}

export async function saveDashboardLayout(membershipId: string, widgets: unknown, range: unknown): Promise<void> {
  const clean = normalizeLayout(widgets);
  const r = normalizeRange(range);
  await prisma.dashboardLayout.upsert({
    where: { membershipId },
    create: { membershipId, widgets: clean as unknown as Prisma.InputJsonValue, range: r },
    update: { widgets: clean as unknown as Prisma.InputJsonValue, range: r },
  });
}

export async function resetDashboardLayout(membershipId: string): Promise<void> {
  await prisma.dashboardLayout.deleteMany({ where: { membershipId } });
}

// ------------------------------------------------------------------ navigation (admins)

export function readNavConfig(raw: unknown): NavConfig {
  return normalizeNavConfig(raw, NAV_HREFS);
}

export async function saveNavConfig(params: { companyId: string; membershipId: string; userId: string; order: unknown; hidden: unknown }) {
  await requirePermission(params.membershipId, "settings", "EDIT");
  const cfg = normalizeNavConfig({ order: params.order, hidden: params.hidden }, NAV_HREFS);
  await prisma.company.update({ where: { id: params.companyId }, data: { navConfig: cfg as unknown as Prisma.InputJsonValue } });
  await recordAuditEvent({
    companyId: params.companyId, userId: params.userId, action: "settings.navigation_updated",
    entityType: "Company", entityId: params.companyId, newValue: cfg, source: "web",
  });
}

export { LOCKED_NAV };

// ------------------------------------------------------------------ branding (admins)

export class BrandingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrandingError";
  }
}

export async function saveBranding(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  brandColor?: string | null;
  invoiceFooter?: string | null;
  invoiceTerms?: string | null;
}) {
  await requirePermission(params.membershipId, "settings", "EDIT");
  const data: Prisma.CompanyUpdateInput = {};
  if (params.brandColor !== undefined) {
    if (params.brandColor && !normalizeHex(params.brandColor)) throw new BrandingError("Brand colour must be a hex colour like #4F46E5.");
    data.brandColor = params.brandColor ? normalizeHex(params.brandColor) : null;
  }
  if (params.invoiceFooter !== undefined) data.invoiceFooter = params.invoiceFooter?.trim().slice(0, 500) || null;
  if (params.invoiceTerms !== undefined) data.invoiceTerms = params.invoiceTerms?.trim().slice(0, 2000) || null;
  await prisma.company.update({ where: { id: params.companyId }, data });
  await recordAuditEvent({
    companyId: params.companyId, userId: params.userId, action: "settings.branding_updated",
    entityType: "Company", entityId: params.companyId,
    newValue: { brandColor: data.brandColor, footer: data.invoiceFooter !== undefined, terms: data.invoiceTerms !== undefined },
    source: "web",
  });
}

// ------------------------------------------------------------------ custom fields

export const ENTITIES: Record<CustomFieldEntity, string> = { CUSTOMER: "Customers", SUPPLIER: "Suppliers", INVOICE: "Invoices" };
export const FIELD_TYPES: Record<CustomFieldType, string> = { TEXT: "Text", NUMBER: "Number", DATE: "Date", SELECT: "Dropdown", CHECKBOX: "Yes / No" };

export async function listCustomFields(companyId: string, entity?: CustomFieldEntity, activeOnly = true) {
  return prisma.customFieldDefinition.findMany({
    where: { companyId, ...(entity ? { entity } : {}), ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ entity: "asc" }, { position: "asc" }, { createdAt: "asc" }],
  });
}

/** Active field definitions in the shape the validator expects. */
export async function fieldDefs(companyId: string, entity: CustomFieldEntity): Promise<FieldDef[]> {
  const rows = await listCustomFields(companyId, entity, true);
  return rows.map((r) => ({ key: r.key, label: r.label, type: r.type, options: r.options, required: r.required }));
}

export async function createCustomField(params: {
  companyId: string; membershipId: string; userId: string;
  entity: CustomFieldEntity; label: string; type: CustomFieldType; options: string[]; required: boolean;
}) {
  await requirePermission(params.membershipId, "settings", "EDIT");
  const label = params.label.trim().slice(0, 60);
  if (!label) throw new CustomFieldError("Give the field a name.");
  const options = [...new Set(params.options.map((o) => o.trim()).filter(Boolean))].slice(0, 50);
  if (params.type === "SELECT" && options.length < 2) throw new CustomFieldError("A dropdown needs at least two options.");
  const count = await prisma.customFieldDefinition.count({ where: { companyId: params.companyId, entity: params.entity } });
  if (count >= 25) throw new CustomFieldError("That's the maximum of 25 fields for this record type.");

  let key = fieldKey(label);
  const taken = new Set((await prisma.customFieldDefinition.findMany({ where: { companyId: params.companyId, entity: params.entity }, select: { key: true } })).map((r) => r.key));
  for (let i = 2; taken.has(key); i++) key = `${fieldKey(label)}_${i}`;

  const def = await prisma.customFieldDefinition.create({
    data: {
      companyId: params.companyId, entity: params.entity, key, label, type: params.type,
      options: params.type === "SELECT" ? options : [], required: params.required, position: count,
    },
  });
  await recordAuditEvent({
    companyId: params.companyId, userId: params.userId, action: "settings.custom_field_created",
    entityType: "CustomFieldDefinition", entityId: def.id, newValue: { entity: def.entity, key, label, type: def.type }, source: "web",
  });
  return def;
}

export async function updateCustomField(params: {
  companyId: string; membershipId: string; userId: string; id: string;
  isActive?: boolean; required?: boolean; move?: "up" | "down"; label?: string;
}) {
  await requirePermission(params.membershipId, "settings", "EDIT");
  const def = await prisma.customFieldDefinition.findFirstOrThrow({ where: { id: params.id, companyId: params.companyId } });

  if (params.move) {
    const siblings = await prisma.customFieldDefinition.findMany({
      where: { companyId: params.companyId, entity: def.entity }, orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    const i = siblings.findIndex((s) => s.id === def.id);
    const j = params.move === "up" ? i - 1 : i + 1;
    const other = siblings[j];
    if (other) {
      [siblings[i], siblings[j]] = [other, def];
      await prisma.$transaction(siblings.map((s, idx) => prisma.customFieldDefinition.update({ where: { id: s.id }, data: { position: idx } })));
    }
    return;
  }

  // Values are never deleted: deactivating hides the field but keeps the data.
  await prisma.customFieldDefinition.update({
    where: { id: def.id },
    data: {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.required !== undefined ? { required: params.required } : {}),
      ...(params.label?.trim() ? { label: params.label.trim().slice(0, 60) } : {}),
    },
  });
  await recordAuditEvent({
    companyId: params.companyId, userId: params.userId, action: "settings.custom_field_updated",
    entityType: "CustomFieldDefinition", entityId: def.id,
    previousValue: { isActive: def.isActive, required: def.required, label: def.label },
    newValue: { isActive: params.isActive, required: params.required, label: params.label }, source: "web",
  });
}
