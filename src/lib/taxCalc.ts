import type { PrismaClient, Prisma } from "@prisma/client";
import type Decimal from "decimal.js";
import { money, roundMoney, sum } from "@/lib/currency";
import { InvalidLineError } from "@/lib/ledger";

/**
 * Single source of truth for "line total = qty × unit price, line tax =
 * line total × tax code rate" — sales.ts (createInvoice/updateInvoice)
 * and purchases.ts (createBill/updateBill) each used to compute this
 * independently with identical inline code; a rate-lookup bug fixed in
 * one would silently persist in the other. Centralizing it here means
 * an invoice and a bill built from the same tax code always agree to
 * the cent, and there's exactly one place that rounds mid-calculation
 * (per-line, via roundMoney) versus only at the end.
 */

export interface TaxableLineInput {
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
}

export interface TaxedLine<T extends TaxableLineInput> {
  line: T;
  lineTotal: Decimal;
  lineTax: Decimal;
}

export interface TaxedLinesResult<T extends TaxableLineInput> {
  lines: TaxedLine<T>[];
  subtotal: Decimal;
  taxTotal: Decimal;
  total: Decimal;
}

/**
 * Looks up the referenced tax codes (scoped to `companyId`; a taxCodeId
 * that isn't this company's is refused rather than stored on the line,
 * where it would point at another tenant's record) and computes each line's total
 * and tax, plus the document-level subtotal/tax/total. Accepts either
 * the ordinary Prisma client or a `$transaction` client, matching how
 * both sales.ts and purchases.ts call this from inside a transaction
 * for the line-replace-on-edit path.
 */
export async function computeTaxedLines<T extends TaxableLineInput>(
  db: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  lines: T[],
): Promise<TaxedLinesResult<T>> {
  const taxCodeIds = [...new Set(lines.map((l) => l.taxCodeId).filter((id): id is string => Boolean(id)))];
  const taxCodes = taxCodeIds.length
    ? await db.taxCode.findMany({ where: { companyId, id: { in: taxCodeIds } } }) as Array<{ id: string; rate: number | { toNumber(): number } }>
    : [] as Array<{ id: string; rate: number | { toNumber(): number } }>;
  if (taxCodes.length !== taxCodeIds.length) throw new InvalidLineError("Tax code not found.");
  const taxCodeById = new Map(taxCodes.map((t) => [t.id, t]));

  const computed = lines.map((line) => {
    const lineTotal = roundMoney(money(line.quantity).times(line.unitPrice));
    const taxCode = line.taxCodeId ? taxCodeById.get(line.taxCodeId) : undefined;
    const rate = taxCode ? (typeof taxCode.rate === "number" ? taxCode.rate : taxCode.rate.toNumber()) : 0;
    const lineTax = taxCode ? roundMoney(lineTotal.times(rate)) : roundMoney(0);
    return { line, lineTotal, lineTax };
  });

  const subtotal = roundMoney(sum(computed.map((l) => l.lineTotal)));
  const taxTotal = roundMoney(sum(computed.map((l) => l.lineTax)));
  const total = roundMoney(subtotal.plus(taxTotal));

  return { lines: computed, subtotal, taxTotal, total };
}
