import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { Module } from "@/lib/rbac";
import { ApiError, page, pageParams, type ApiContext } from "@/lib/api/v1";

/**
 * What /api/v1 exposes for each resource. Every field is listed explicitly
 * (never `include` the whole row), so internal or secret columns — payment
 * link tokens, portal tokens, import refs — can't leak when the schema grows.
 * Every query is scoped to the key's company.
 */

const lineSelect = {
  id: true, description: true, quantity: true, unitPrice: true, lineTotal: true, taxCodeId: true, productId: true,
} as const;

export const SELECTS = {
  account: {
    id: true, code: true, name: true, type: true, parentId: true, purpose: true, isSystem: true, isActive: true, currency: true, createdAt: true,
  },
  customer: {
    id: true, name: true, email: true, phone: true, taxRegNumber: true, currency: true, paymentTermsDays: true, isActive: true, customFields: true, createdAt: true,
  },
  supplier: {
    id: true, name: true, email: true, phone: true, taxRegNumber: true, currency: true, paymentTermsDays: true, isActive: true, customFields: true, createdAt: true,
  },
  invoice: {
    id: true, invoiceNumber: true, customerId: true, projectId: true, issueDate: true, dueDate: true, currency: true, exchangeRate: true,
    subtotal: true, taxTotal: true, total: true, status: true, journalEntryId: true, customFields: true, createdAt: true,
  },
  bill: {
    id: true, billNumber: true, supplierId: true, projectId: true, issueDate: true, dueDate: true, currency: true, exchangeRate: true,
    subtotal: true, taxTotal: true, total: true, status: true, journalEntryId: true, createdAt: true,
  },
  journalEntry: {
    id: true, entryNumber: true, date: true, sourceType: true, sourceId: true, memo: true, status: true, reversalOfId: true,
    currency: true, exchangeRate: true, postedAt: true, createdAt: true,
  },
} as const;

const DETAIL_INCLUDES = {
  invoice: { lines: { select: lineSelect, orderBy: { id: "asc" as const } } },
  bill: { lines: { select: lineSelect, orderBy: { id: "asc" as const } } },
  journalEntry: {
    lines: {
      select: { id: true, debit: true, credit: true, description: true, costCentreId: true, projectId: true, account: { select: { id: true, code: true, name: true } } },
      orderBy: { id: "asc" as const },
    },
  },
} as const;

export type ResourceName = keyof typeof SELECTS;

export const RESOURCE_MODULE: Record<ResourceName, Module> = {
  account: "accounting",
  customer: "customers",
  supplier: "suppliers",
  invoice: "invoices",
  bill: "bills",
  journalEntry: "journals",
};

type Delegate = {
  findMany: (args: unknown) => Promise<{ id: string }[]>;
  findFirst: (args: unknown) => Promise<{ id: string } | null>;
};

function delegate(name: ResourceName): Delegate {
  return (prisma as unknown as Record<string, Delegate>)[name]!;
}

const ORDER: Record<ResourceName, unknown> = {
  account: [{ code: "asc" }, { id: "asc" }],
  customer: [{ createdAt: "desc" }, { id: "desc" }],
  supplier: [{ createdAt: "desc" }, { id: "desc" }],
  invoice: [{ issueDate: "desc" }, { id: "desc" }],
  bill: [{ issueDate: "desc" }, { id: "desc" }],
  journalEntry: [{ date: "desc" }, { id: "desc" }],
};

/** Optional, validated equality filters per resource (?status=…, ?customerId=…). */
const FILTERS: Partial<Record<ResourceName, Record<string, RegExp>>> = {
  invoice: { status: /^[A-Z_]+$/, customerId: /^[\w-]+$/ },
  bill: { status: /^[A-Z_]+$/, supplierId: /^[\w-]+$/ },
  journalEntry: { status: /^[A-Z_]+$/, sourceType: /^[A-Z_]+$/ },
  customer: { isActive: /^(true|false)$/ },
  supplier: { isActive: /^(true|false)$/ },
  account: { type: /^[A-Z]+$/, isActive: /^(true|false)$/ },
};

function filters(name: ResourceName, req: Request): Record<string, unknown> {
  const url = new URL(req.url);
  const out: Record<string, unknown> = {};
  for (const [key, pattern] of Object.entries(FILTERS[name] ?? {})) {
    const v = url.searchParams.get(key);
    if (v === null) continue;
    if (!pattern.test(v)) throw new ApiError(400, "invalid_request", `Invalid value for "${key}".`);
    out[key] = v === "true" ? true : v === "false" ? false : v;
  }
  return out;
}

export async function listResource(name: ResourceName, ctx: ApiContext, req: Request) {
  const { take, cursor } = pageParams(req);
  const where = { ...filters(name, req), companyId: ctx.companyId };
  if (cursor) {
    // The cursor must be a row of this company; otherwise Prisma would
    // happily page from another tenant's row position.
    const ok = await delegate(name).findFirst({ where: { id: cursor, companyId: ctx.companyId }, select: { id: true } });
    if (!ok) throw new ApiError(400, "invalid_request", "Unknown cursor.");
  }
  const rows = await delegate(name).findMany({
    where,
    select: SELECTS[name],
    orderBy: ORDER[name],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  return page(rows, take);
}

export async function getResource(name: ResourceName, ctx: ApiContext, id: string) {
  const include = (DETAIL_INCLUDES as Record<string, unknown>)[name];
  const row = await delegate(name).findFirst({
    where: { id, companyId: ctx.companyId },
    select: { ...SELECTS[name], ...((include as object) ?? {}) },
  });
  if (!row) throw new NotFoundError("Not found.");
  return { data: row };
}
