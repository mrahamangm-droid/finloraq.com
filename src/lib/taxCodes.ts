import { Prisma, type TaxTreatment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";

/** A bad tax code create/edit — duplicate code, rate out of range, etc. */
export class TaxCodeValidationError extends Error {}

/** An edit or delete refused because the code is already referenced. */
export class TaxCodeInUseError extends Error {}

export const TAX_TREATMENTS: TaxTreatment[] = ["STANDARD", "ZERO_RATED", "EXEMPT", "OUT_OF_SCOPE"];

/**
 * Fields that define what a tax code *means*: what rate it charges, how the
 * supply is treated, and whether it's sales (output) or purchase (input)
 * tax. Once anything references the code, these are frozen — a posted line
 * computed its tax from them, and a draft, quote, PO, recurring template or
 * product default would quietly start computing a different tax if they
 * changed. Only the label and the active flag stay editable.
 */
const LOCKED_WHEN_USED = ["code", "rate", "treatment", "isInput"] as const;

export interface TaxCodeChange {
  code?: string;
  name?: string;
  /** Percent, e.g. "5" or 5 for 5%. Stored as a fraction (0.0500). */
  ratePercent?: string | number;
  treatment?: TaxTreatment;
  isInput?: boolean;
  isActive?: boolean;
}

export interface TaxCodeSnapshot {
  code: string;
  name: string;
  rate: Prisma.Decimal | string | number;
  treatment: TaxTreatment;
  isInput: boolean;
  isActive: boolean;
}

/**
 * Converts a percent ("5", 12.5) to the stored fraction as an exact decimal
 * (never via floating point) and checks it fits the column: Decimal(6,4),
 * so 0–100% with at most two decimal places of percent.
 */
export function percentToRate(ratePercent: string | number): Prisma.Decimal {
  const raw = typeof ratePercent === "number" ? String(ratePercent) : ratePercent.trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new TaxCodeValidationError("Rate must be a number between 0 and 100.");
  const pct = new Prisma.Decimal(raw);
  if (pct.lessThan(0) || pct.greaterThan(100)) throw new TaxCodeValidationError("Rate must be between 0 and 100.");
  if (pct.decimalPlaces() > 2) throw new TaxCodeValidationError("Rate can have at most two decimal places (e.g. 12.75).");
  return pct.dividedBy(100);
}

/**
 * Pure: given the current code, whether it's referenced, and a requested
 * change, returns the normalized fields to write — or throws. No database
 * access, so the in-use rules are unit-tested directly.
 */
export function checkTaxCodeChange(
  current: TaxCodeSnapshot,
  inUse: boolean,
  change: TaxCodeChange
): Partial<{ code: string; name: string; rate: Prisma.Decimal; treatment: TaxTreatment; isInput: boolean; isActive: boolean }> {
  const out: ReturnType<typeof checkTaxCodeChange> = {};

  if (change.code !== undefined) {
    const code = normalizeCode(change.code);
    if (code !== current.code) out.code = code;
  }
  if (change.name !== undefined) {
    const name = change.name.trim();
    if (!name) throw new TaxCodeValidationError("Name can't be empty.");
    if (name !== current.name) out.name = name;
  }
  if (change.ratePercent !== undefined && change.ratePercent !== "") {
    const rate = percentToRate(change.ratePercent);
    if (!rate.equals(new Prisma.Decimal(current.rate))) out.rate = rate;
  }
  if (change.treatment !== undefined) {
    if (!TAX_TREATMENTS.includes(change.treatment)) throw new TaxCodeValidationError("Unknown tax treatment.");
    if (change.treatment !== current.treatment) out.treatment = change.treatment;
  }
  if (change.isInput !== undefined && change.isInput !== current.isInput) out.isInput = change.isInput;
  if (change.isActive !== undefined && change.isActive !== current.isActive) out.isActive = change.isActive;

  if (inUse) {
    const blocked = LOCKED_WHEN_USED.filter((k) => k in out);
    if (blocked.length > 0) {
      throw new TaxCodeInUseError(
        `This tax code is already used, so its ${blocked.map(fieldLabel).join(", ")} can't change. ` +
          "You can still rename or deactivate it — or deactivate it and add a new code with the new rate."
      );
    }
  }
  return out;
}

function fieldLabel(k: (typeof LOCKED_WHEN_USED)[number]): string {
  return k === "isInput" ? "direction" : k;
}

function normalizeCode(code: string): string {
  const c = code.trim().toUpperCase();
  if (!c) throw new TaxCodeValidationError("Code can't be empty.");
  if (!/^[A-Z0-9_.-]{1,32}$/.test(c)) {
    throw new TaxCodeValidationError("Code may use letters, digits, '_', '.' and '-' only (max 32).");
  }
  return c;
}

/** Every relation that points at a TaxCode. Keep in sync with the TaxCode model. */
export const USAGE_RELATIONS = {
  invoiceLines: true, billLines: true, creditNoteLines: true, recurringLines: true,
  quoteLines: true, purchaseOrderLines: true, salesOrderLines: true, products: true,
} as const;

/** How many rows of each kind reference a tax code. Any non-zero count means "in use". */
export async function taxCodeUsage(taxCodeId: string) {
  const c = await prisma.taxCode.findUniqueOrThrow({
    where: { id: taxCodeId },
    select: { _count: { select: USAGE_RELATIONS } },
  });
  const counts = c._count;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total };
}

async function findOwned(companyId: string, taxCodeId: string) {
  const tc = await prisma.taxCode.findFirst({ where: { id: taxCodeId, companyId } });
  if (!tc) throw new NotFoundError("Tax code not found.");
  return tc;
}

/** Every tax code for the company, with whether each is in use (drives which fields the UI offers). */
export async function listTaxCodes(companyId: string) {
  const rows = await prisma.taxCode.findMany({
    where: { companyId },
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    include: { _count: { select: USAGE_RELATIONS } },
  });
  return rows.map(({ _count, ...tc }) => ({
    ...tc,
    usageCount: Object.values(_count).reduce((a, b) => a + b, 0),
  }));
}

interface Actor {
  companyId: string;
  membershipId: string;
  userId: string;
}

/**
 * Tax codes are company configuration that every VAT figure depends on, so
 * changing them needs settings:EDIT (Company Admin by default) — the same
 * gate this screen has always had, not the broader taxes:EDIT.
 */
export async function createTaxCode(params: Actor & {
  code: string;
  name: string;
  ratePercent: string | number;
  treatment: TaxTreatment;
  isInput: boolean;
}) {
  await requirePermission(params.membershipId, "settings", "EDIT");

  const code = normalizeCode(params.code);
  const name = params.name.trim();
  if (!name) throw new TaxCodeValidationError("Name can't be empty.");
  if (!TAX_TREATMENTS.includes(params.treatment)) throw new TaxCodeValidationError("Unknown tax treatment.");
  const rate = percentToRate(params.ratePercent);

  const clash = await prisma.taxCode.findUnique({ where: { companyId_code: { companyId: params.companyId, code } } });
  if (clash) throw new TaxCodeValidationError(`Tax code "${code}" already exists.`);

  const company = await prisma.company.findUniqueOrThrow({ where: { id: params.companyId }, select: { countryCode: true } });
  const tc = await prisma.taxCode.create({
    data: {
      companyId: params.companyId,
      countryCode: company.countryCode,
      code,
      name,
      rate,
      treatment: params.treatment,
      isInput: params.isInput,
      isActive: true,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "tax_code.created",
    entityType: "TaxCode",
    entityId: tc.id,
    newValue: { code, name, rate: rate.toString(), treatment: tc.treatment, isInput: tc.isInput },
  });
  return tc;
}

export async function updateTaxCode(params: Actor & { taxCodeId: string } & TaxCodeChange) {
  await requirePermission(params.membershipId, "settings", "EDIT");
  const owned = await findOwned(params.companyId, params.taxCodeId);
  // Same lock as deleteTaxCode: the in-use check and the write can't be
  // split by a line being added in between.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TaxCode" WHERE id = ${owned.id} FOR UPDATE`;
    const { _count, ...current } = await tx.taxCode.findUniqueOrThrow({
      where: { id: owned.id },
      include: { _count: { select: USAGE_RELATIONS } },
    });
    const inUse = Object.values(_count).some((n) => n > 0);
    const data = checkTaxCodeChange(current, inUse, params);
    if (Object.keys(data).length === 0) return { current, updated: current, data };
    if (data.code) {
      const clash = await tx.taxCode.findUnique({ where: { companyId_code: { companyId: params.companyId, code: data.code } } });
      if (clash) throw new TaxCodeValidationError(`Tax code "${data.code}" already exists.`);
    }
    const updated = await tx.taxCode.update({ where: { id: owned.id }, data });
    return { current, updated, data };
  });
  const { current, updated, data } = result;
  if (Object.keys(data).length === 0) return updated;
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of Object.keys(data) as (keyof typeof data)[]) {
    before[k] = String(current[k]);
    after[k] = String(updated[k]);
  }
  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: data.isActive === false ? "tax_code.deactivated" : data.isActive === true ? "tax_code.activated" : "tax_code.updated",
    entityType: "TaxCode",
    entityId: current.id,
    previousValue: before,
    newValue: after,
  });
  return updated;
}

/**
 * Only a never-referenced code can be deleted; anything else must be
 * deactivated. This matters more than it looks: every taxCodeId foreign key
 * is ON DELETE SET NULL, so deleting a used code wouldn't fail — it would
 * silently strip the tax code off posted lines. The check and the delete run
 * in one transaction behind a row lock; a concurrent insert of a line naming
 * this code takes a key-share lock on the same row for its FK check, so it
 * either committed before our count (and is counted) or waits and then fails
 * its FK check once the row is gone.
 */
export async function deleteTaxCode(params: Actor & { taxCodeId: string }) {
  await requirePermission(params.membershipId, "settings", "EDIT");
  const current = await findOwned(params.companyId, params.taxCodeId);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TaxCode" WHERE id = ${current.id} FOR UPDATE`;
    const { _count } = await tx.taxCode.findUniqueOrThrow({ where: { id: current.id }, select: { _count: { select: USAGE_RELATIONS } } });
    const total = Object.values(_count).reduce((a, b) => a + b, 0);
    if (total > 0) {
      throw new TaxCodeInUseError(`"${current.code}" is used on ${total} line(s) or product(s), so it can't be deleted. Deactivate it instead.`);
    }
    await tx.taxCode.delete({ where: { id: current.id } });
  });
  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "tax_code.deleted",
    entityType: "TaxCode",
    entityId: current.id,
    previousValue: { code: current.code, name: current.name, rate: current.rate.toString(), treatment: current.treatment },
  });
}
