import { z } from "zod";
import { createInvoice } from "@/lib/sales";
import { createBill } from "@/lib/purchases";
import { getResource } from "@/lib/api/v1Resources";
import type { ApiContext } from "@/lib/api/v1";

/**
 * Draft creation over the API. Drafts only: nothing here touches the ledger
 * — posting an invoice or approving a bill stays a deliberate action in the
 * app. Both go through the same createInvoice()/createBill() the web UI
 * uses, so line maths, tax codes, currency rules and cross-tenant reference
 * checks are identical.
 */

const amount = z.union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)]).transform(Number);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

const line = z.object({
  description: z.string().min(1).max(500),
  quantity: amount.refine((n) => n > 0, "must be positive"),
  unitPrice: amount.refine((n) => n >= 0, "can't be negative"),
  taxCodeId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
});

const base = {
  issueDate: date,
  dueDate: date,
  currency: z.string().length(3),
  exchangeRate: amount.refine((n) => n > 0, "must be positive").optional(),
  lines: z.array(line).min(1).max(200),
};

const invoiceBody = z.object({ customerId: z.string().min(1), ...base }).strict();
const billBody = z.object({ supplierId: z.string().min(1), ...base }).strict();

const toDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

export async function createDraftInvoice(ctx: ApiContext, req: Request) {
  const body = invoiceBody.parse(await req.json().catch(() => null));
  const invoice = await createInvoice({
    companyId: ctx.companyId,
    membershipId: ctx.membershipId,
    userId: ctx.userId,
    customerId: body.customerId,
    issueDate: toDate(body.issueDate),
    dueDate: toDate(body.dueDate),
    currency: body.currency,
    exchangeRate: body.exchangeRate,
    lines: body.lines,
  });
  return getResource("invoice", ctx, invoice.id);
}

export async function createDraftBill(ctx: ApiContext, req: Request) {
  const body = billBody.parse(await req.json().catch(() => null));
  const bill = await createBill({
    companyId: ctx.companyId,
    membershipId: ctx.membershipId,
    userId: ctx.userId,
    supplierId: body.supplierId,
    issueDate: toDate(body.issueDate),
    dueDate: toDate(body.dueDate),
    currency: body.currency,
    exchangeRate: body.exchangeRate,
    lines: body.lines,
  });
  return getResource("bill", ctx, bill.id);
}
