import type Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { receiveStock } from "@/lib/inventory";
import { postJournalEntry, buildBillPosting, buildSupplierPaymentPosting, InvalidLineError, resolveDocumentCurrency } from "@/lib/ledger";
import { roundMoney, sum, money } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/numbering";
import { computeTaxedLines } from "@/lib/taxCalc";
import { getBankAccountCode, getInputTaxReceivableCode, getAccountsPayableCode, getOrCreateInventoryAssetCode, getOrCreateExchangeGainLossCode, getOrCreateGrniCode, getOrCreateCogsExpenseCode } from "@/lib/accounts";
import { foreignReferenceProblem } from "@/lib/tenantRefs";
import { releasePOBilledQuantities } from "@/lib/po-billing";

export interface BillLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
  productId?: string; // optional; if the product trackInventory=true, stock is received on approval
  /** Set only by convertPOToBill (purchase-orders.ts) — never taken from a
   *  request body. See BillLine.purchaseOrderLineId. */
  purchaseOrderLineId?: string;
}

export async function createBill(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  supplierId: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  /** Rate to convert 1 unit of `currency` into the company's base currency.
   *  Required (and must be a positive number) when `currency` isn't the
   *  company's base currency; must be 1 or omitted otherwise. There is no
   *  live FX rate lookup — the caller supplies the rate. */
  exchangeRate?: number;
  lines: BillLineInput[];
}) {
  await requirePermission(params.membershipId, "bills", "CREATE");
  const { currency, exchangeRate } = await resolveDocumentCurrency(prisma, params.companyId, params.currency, params.exchangeRate);

  if (params.lines.length === 0) {
    throw new InvalidLineError("A bill needs at least one line.");
  }
  const supplierProblem = await foreignReferenceProblem(prisma, params.companyId, "supplier", [params.supplierId]);
  if (supplierProblem) throw new InvalidLineError(supplierProblem);
  const poLineIds = [...new Set(params.lines.map((l) => l.purchaseOrderLineId).filter((id): id is string => Boolean(id)))];
  if (poLineIds.length > 0) {
    const owned = await prisma.purchaseOrderLine.count({
      where: { id: { in: poLineIds }, purchaseOrder: { companyId: params.companyId, supplierId: params.supplierId } },
    });
    if (owned !== poLineIds.length) throw new InvalidLineError("Purchase order line not found.");
  }

  const { lines: computedLines, subtotal, taxTotal, total } = await computeTaxedLines(prisma, params.companyId, params.lines);

  const bill = await prisma.$transaction(async (tx: any) => {
    const billNumber = await nextDocumentNumber(tx, params.companyId, "BILL", () =>
      tx.bill.findFirst({ where: { companyId: params.companyId }, orderBy: { billNumber: "desc" }, select: { billNumber: true } }).then((r: any) => (r ? { number: r.billNumber } : null))
    );

    return tx.bill.create({
      data: {
        companyId: params.companyId,
        supplierId: params.supplierId,
        billNumber,
        issueDate: params.issueDate,
        dueDate: params.dueDate,
        currency,
        exchangeRate,
        subtotal,
        taxTotal,
        total,
        status: "DRAFT",
        lines: {
          create: computedLines.map((l) => ({
            description: l.line.description,
            quantity: l.line.quantity,
            unitPrice: l.line.unitPrice,
            taxCodeId: l.line.taxCodeId,
            lineTotal: l.lineTotal,
            ...(l.line.productId ? { productId: l.line.productId } : {}),
            ...(l.line.purchaseOrderLineId ? { purchaseOrderLineId: l.line.purchaseOrderLineId } : {}),
          })),
        },
      },
      include: { lines: true },
    });
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bill.created",
    entityType: "Bill",
    entityId: bill.id,
    newValue: { billNumber: bill.billNumber, total: total.toFixed(2) },
  });

  return bill;
}

/**
 * Edits a DRAFT bill's own fields and lines, recomputing subtotal/tax/total
 * exactly like createBill() does. Refused once the bill has left DRAFT
 * (approveAndPostBill already posted it to the ledger by then) — mirrors
 * updateInvoice() in src/lib/sales.ts. Correct an approved bill with a
 * debit note / new bill instead.
 */
export async function updateBill(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  billId: string;
  supplierId?: string;
  issueDate?: Date;
  dueDate?: Date;
  currency?: string;
  exchangeRate?: number;
  lines?: BillLineInput[];
}) {
  await requirePermission(params.membershipId, "bills", "EDIT");

  const before = await prisma.bill.findFirst({ where: { id: params.billId, companyId: params.companyId }, include: { lines: true } });
  if (!before) throw new NotFoundError("Bill not found.");
  if (before.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft bill can be edited. Once approved, correct it with a debit note or a new bill.");
  }
  // Editing may change currency freely (including into or out of a foreign
  // currency) since nothing has posted yet — resolveDocumentCurrency
  // re-validates the rate every time, same as createBill(). Keeps the
  // existing currency+rate when neither is supplied.
  let currency = before.currency;
  let exchangeRate = before.exchangeRate;
  if (params.currency !== undefined || params.exchangeRate !== undefined) {
    const resolved = await resolveDocumentCurrency(
      prisma,
      params.companyId,
      params.currency ?? before.currency,
      params.exchangeRate ?? (params.currency !== undefined ? undefined : before.exchangeRate)
    );
    currency = resolved.currency;
    exchangeRate = resolved.exchangeRate;
  }
  const supplierProblem = await foreignReferenceProblem(prisma, params.companyId, "supplier", [params.supplierId]);
  if (supplierProblem) throw new InvalidLineError(supplierProblem);
  if (params.supplierId && params.supplierId !== before.supplierId && before.lines.some((l: any) => l.purchaseOrderLineId)) {
    throw new InvalidLineError("This bill was raised from a purchase order, so its supplier can't be changed.");
  }

  let subtotal = before.subtotal, taxTotal = before.taxTotal, total = before.total;
  let lineData: { description: string; quantity: number; unitPrice: number; taxCodeId?: string; lineTotal: Decimal }[] | undefined;

  if (params.lines) {
    if (params.lines.length === 0) {
      throw new InvalidLineError("A bill needs at least one line.");
    }
    // A bill raised from a Purchase Order keeps its link to the PO lines.
    // Prices, tax codes and descriptions may be corrected to match the
    // supplier's actual invoice (any price difference is booked as a
    // purchase price variance on approval), but the lines themselves —
    // their count, products and quantities — must stay as billed
    // from the PO, since the PO's billed quantities were counted from them.
    // To bill different quantities, delete this draft and convert again.
    const poLinked = before.lines.some((l: any) => l.purchaseOrderLineId);
    if (poLinked) {
      // Pair each submitted line with an existing one of the same product and
      // quantity (preferring the same description), independent of order.
      const unmatched = [...(before.lines as any[])];
      const relinked: BillLineInput[] = [];
      for (const l of params.lines) {
        const candidates = unmatched.filter((prev) => money(l.quantity).equals(prev.quantity) && (l.productId ?? null) === (prev.productId ?? null));
        const match = candidates.find((prev) => prev.description === l.description) ?? candidates[0];
        if (!match) { relinked.length = 0; break; }
        unmatched.splice(unmatched.indexOf(match), 1);
        relinked.push({ ...l, purchaseOrderLineId: match.purchaseOrderLineId ?? undefined });
      }
      if (relinked.length !== before.lines.length || params.lines.length !== before.lines.length) {
        throw new InvalidLineError("This bill was raised from a purchase order: its lines, products and quantities can't be changed. Delete the draft and convert the purchase order again to bill different quantities.");
      }
      params = { ...params, lines: relinked };
    }
    const computedLines = await computeTaxedLines(prisma, params.companyId, params.lines!);
    subtotal = computedLines.subtotal;
    taxTotal = computedLines.taxTotal;
    total = computedLines.total;
    lineData = computedLines.lines.map((l) => ({ description: l.line.description, quantity: l.line.quantity, unitPrice: l.line.unitPrice, taxCodeId: l.line.taxCodeId, lineTotal: l.lineTotal, ...(l.line.productId ? { productId: l.line.productId } : {}), ...(l.line.purchaseOrderLineId ? { purchaseOrderLineId: l.line.purchaseOrderLineId } : {}) }));
  }

  const bill = await prisma.$transaction(async (tx: any) => {
    if (lineData) {
      await tx.billLine.deleteMany({ where: { billId: before.id } });
    }
    return tx.bill.update({
      where: { id: before.id },
      data: {
        supplierId: params.supplierId,
        issueDate: params.issueDate,
        dueDate: params.dueDate,
        currency: params.currency === undefined && params.exchangeRate === undefined ? undefined : currency,
        exchangeRate: params.currency === undefined && params.exchangeRate === undefined ? undefined : exchangeRate,
        subtotal,
        taxTotal,
        total,
        lines: lineData ? { create: lineData } : undefined,
      },
      include: { lines: true },
    });
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bill.updated",
    entityType: "Bill",
    entityId: bill.id,
    previousValue: { total: before.total.toFixed(2), lineCount: before.lines.length },
    newValue: { total: bill.total.toFixed(2), lineCount: bill.lines.length },
  });

  return bill;
}

/** Deletes a DRAFT bill outright — refused once it's been approved/posted,
 *  same boundary as updateBill() above. */
export async function deleteBill(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  billId: string;
}) {
  await requirePermission(params.membershipId, "bills", "DELETE");

  const bill = await prisma.bill.findFirst({ where: { id: params.billId, companyId: params.companyId } });
  if (!bill) throw new NotFoundError("Bill not found.");
  if (bill.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft bill can be deleted. An approved bill can't be removed — reverse it via a debit note instead.");
  }

  // Hand any PO-linked quantities back to the purchase order first, so they
  // can be billed again.
  await releasePOBilledQuantities(params.companyId, bill.id);
  await prisma.$transaction([
    prisma.billLine.deleteMany({ where: { billId: bill.id } }),
    prisma.bill.delete({ where: { id: bill.id } }),
  ]);

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bill.deleted",
    entityType: "Bill",
    entityId: bill.id,
    previousValue: { billNumber: bill.billNumber, total: bill.total.toFixed(2) },
  });
}

/** Draft -> Approved, and posts to the ledger in the same step. A
 *  Finance Manager/CFO/Company Admin (who hold bills:APPROVE) can do this;
 *  posting itself additionally requires journals:APPROVE inside
 *  postJournalEntry, same layered-permission pattern as invoices. */
export async function approveAndPostBill(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  billId: string;
  expenseAccountCode?: string;
}) {
  await requirePermission(params.membershipId, "bills", "APPROVE");

  const bill = await prisma.bill.findFirst({
    where: { id: params.billId, companyId: params.companyId },
    include: { lines: { include: { product: true } } },
  });
  if (!bill) throw new NotFoundError("Bill not found.");

  if (bill.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft bill can be approved and posted.");
  }

  const [inputTaxCode, accountsPayableCode] = await Promise.all([
    getInputTaxReceivableCode(params.companyId),
    getAccountsPayableCode(params.companyId),
  ]);

  // The ledger always posts in base currency. Convert each line at the
  // rate captured at issue time (bill.exchangeRate) — mirrors
  // postInvoiceToLedger in src/lib/sales.ts. baseTotal and baseTaxTotal are
  // each rounded independently; every line but the last is rounded on its
  // own and the last absorbs whatever's left, so the lines always sum
  // exactly to baseTotal - baseTaxTotal and the entry balances to the cent.
  const baseTotal = roundMoney(money(bill.total).times(bill.exchangeRate));
  const baseTaxTotal = roundMoney(money(bill.taxTotal).times(bill.exchangeRate));
  const baseSubtotal = baseTotal.minus(baseTaxTotal);
  const billLines = bill.lines as any[];
  let convertedSoFar = money(0);
  const baseLineAmounts = billLines.map((l, i) => {
    if (i === billLines.length - 1) return baseSubtotal.minus(convertedSoFar);
    const amount = roundMoney(money(l.lineTotal).times(bill.exchangeRate));
    convertedSoFar = convertedSoFar.plus(amount);
    return amount;
  });

  // Where each line's base amount lands:
  //  - a tracked-inventory line raised from a Purchase Order was already
  //    capitalized by its PurchaseReceive (DR Inventory / CR GRNI), so it
  //    clears GRNI at the received cost; any difference between that and
  //    the bill's own line value (supplier price change or FX movement since
  //    the PO) is a purchase price variance, booked to Cost of Goods Sold;
  //  - any other tracked-inventory line is capitalized to Inventory Asset
  //    (it becomes COGS only when later sold, see postInvoiceToLedger);
  //  - everything else expenses immediately to its product's
  //    expenseAccountCode, or the bill-level default, or "5000".
  const receivedLines = billLines.filter((l) => l.product?.trackInventory && l.purchaseOrderLineId);
  const directStockLines = billLines.filter((l) => l.product?.trackInventory && !l.purchaseOrderLineId);
  const inventoryAssetCode = directStockLines.length > 0 ? await getOrCreateInventoryAssetCode(params.companyId) : undefined;
  const [grniCode, varianceCode] = receivedLines.length > 0
    ? await Promise.all([getOrCreateGrniCode(params.companyId), getOrCreateCogsExpenseCode(params.companyId)])
    : [undefined, undefined];
  const receivedCostByPoLine = new Map<string, Decimal>();
  if (receivedLines.length > 0) {
    const poLines = await prisma.purchaseOrderLine.findMany({
      where: { id: { in: receivedLines.map((l) => l.purchaseOrderLineId) }, purchaseOrder: { companyId: params.companyId } },
      select: { id: true, unitPrice: true, purchaseOrder: { select: { exchangeRate: true } } },
    });
    for (const pl of poLines) {
      // Same base unit cost createPurchaseReceive capitalized at.
      receivedCostByPoLine.set(pl.id, roundMoney(money(pl.unitPrice).times(pl.purchaseOrder.exchangeRate)));
    }
  }

  const expenseGroups = new Map<string, Decimal>();
  const addTo = (code: string, amount: Decimal) => expenseGroups.set(code, (expenseGroups.get(code) ?? money(0)).plus(amount));
  billLines.forEach((line, i) => {
    const baseAmount = baseLineAmounts[i]!;
    if (line.product?.trackInventory && line.purchaseOrderLineId) {
      const unitCost = receivedCostByPoLine.get(line.purchaseOrderLineId);
      if (!unitCost) throw new InvalidLineError(`The purchase order line behind "${line.description}" no longer exists.`);
      const grniAmount = roundMoney(unitCost.times(line.quantity));
      addTo(grniCode!, grniAmount);
      addTo(varianceCode!, baseAmount.minus(grniAmount));
    } else if (line.product?.trackInventory) {
      addTo(inventoryAssetCode!, baseAmount);
    } else {
      addTo(line.product?.expenseAccountCode ?? params.expenseAccountCode ?? "5000", baseAmount);
    }
  });
  const baseExpenseLines = [...expenseGroups.entries()].map(([accountCode, amount]) => ({ accountCode, amount }));

  const entry = await postJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: bill.issueDate,
    sourceType: "BILL",
    sourceId: bill.id,
    memo: `Bill ${bill.billNumber}`,
    currency: bill.currency,
    exchangeRate: bill.exchangeRate,
    lines: buildBillPosting({
      expenseLines: baseExpenseLines,
      taxTotal: baseTaxTotal,
      total: baseTotal,
      inputTaxCode,
      accountsPayableCode,
    }),
    post: true,
  });

  const updated = await prisma.bill.update({
    where: { id: bill.id },
    data: { status: "APPROVED", journalEntryId: entry.id },
  });

  // Receive inventory for any line that references a tracked product.
  // Failures are logged but never abort the bill approval — the ledger
  // entry is already committed. A manual stock adjustment can correct later.
  for (const line of bill.lines) {
    // A PO-linked line's stock was already received by its PurchaseReceive.
    if (line.product?.trackInventory && line.quantity && !line.purchaseOrderLineId) {
      try {
        await receiveStock(
          params.companyId,
          params.userId,
          line.product.id,
          Number(line.quantity),
          {
            // Inventory Asset is a base-currency GL account, so the cost
            // layer this creates must be in base currency too — convert the
            // bill's own-currency unit price the same way the journal
            // entry above converted the line total.
            unitCost: roundMoney(money(line.unitPrice).times(bill.exchangeRate)).toNumber(),
            notes: `Bill ${bill.billNumber}`,
            referenceType: "Bill",
            referenceId: bill.id,
            date: bill.issueDate,
          }
        );
      } catch (err: any) {
        console.error(`[inventory] receiveStock failed for bill ${bill.id} product ${line.product.id}: ${err?.message}`);
      }
    }
  }

  return updated;
}

export async function recordSupplierPayment(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  billId: string;
  /** In the bill's own currency (what was actually paid to the supplier). */
  amount: number;
  date: Date;
  /** Rate to convert `amount` (bill currency) to base currency, as of the
   *  payment date. Defaults to the bill's own booking rate (assumes no FX
   *  movement since issue) when omitted — pass an explicit rate to book
   *  realized exchange gain/loss on a foreign-currency bill settled at a
   *  different rate than it was raised at. Ignored (must be 1 if given) for
   *  a base-currency bill. */
  exchangeRate?: number;
}) {
  await requirePermission(params.membershipId, "bills", "EDIT");

  const bill = await prisma.bill.findFirst({ where: { id: params.billId, companyId: params.companyId } });
  if (!bill) throw new NotFoundError("Bill not found.");

  if (!["APPROVED", "PARTIALLY_PAID", "OVERDUE"].includes(bill.status)) {
    throw new InvalidLineError("Only an approved bill can receive a payment.");
  }

  const paymentExchangeRate = params.exchangeRate !== undefined ? money(params.exchangeRate) : money(bill.exchangeRate);
  if (!paymentExchangeRate.greaterThan(0)) {
    throw new InvalidLineError("Payment exchange rate must be positive.");
  }
  if (money(bill.exchangeRate).equals(1) && !paymentExchangeRate.equals(1)) {
    throw new InvalidLineError("A base-currency bill's payment exchange rate must be 1.");
  }

  const paymentId = `${bill.id}:${Date.now()}`;
  const [bankAccountCode, accountsPayableCode] = await Promise.all([
    getBankAccountCode(params.companyId),
    getAccountsPayableCode(params.companyId),
  ]);

  // Both amounts are base currency: what actually left the bank (at the
  // payment-date rate) vs. how much of the base-currency Accounts Payable
  // balance this settles (at the bill's own booking rate). Any difference
  // is realized exchange gain/loss — see buildSupplierPaymentPosting.
  const baseCashPaid = roundMoney(money(params.amount).times(paymentExchangeRate));
  const baseApCleared = roundMoney(money(params.amount).times(bill.exchangeRate));
  const exchangeGainLossCode = baseCashPaid.equals(baseApCleared)
    ? undefined
    : await getOrCreateExchangeGainLossCode(params.companyId);

  const entry = await postJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: params.date,
    sourceType: "PAYMENT",
    sourceId: paymentId,
    memo: `Payment sent — Bill ${bill.billNumber}`,
    currency: bill.currency,
    inheritsPostedCurrency: true, // settles a bill that is already posted
    lines: buildSupplierPaymentPosting({ amount: baseCashPaid, apAmount: baseApCleared, bankAccountCode, accountsPayableCode, exchangeGainLossCode }),
    post: true,
  });

  // Decided in base currency, not the bill's own currency — dividing the
  // base-currency AP-cleared total back by the bill's rate and rounding
  // (as sumBillPayments() does for display) can leave a fully-cleared
  // bill a fraction short of bill.total, permanently stuck at
  // PARTIALLY_PAID with an unpayable residual balance (the next payment
  // for that fraction would post a zero-amount AP line, which
  // postJournalEntry refuses).
  const baseApClearedSoFar = await sumBillPaymentsBase(params.companyId, bill.id);
  const baseBillTotal = roundMoney(money(bill.total).times(bill.exchangeRate));
  const newStatus = baseApClearedSoFar.gte(baseBillTotal) ? "PAID" : "PARTIALLY_PAID";

  await prisma.bill.update({ where: { id: bill.id }, data: { status: newStatus } });

  return entry;
}

/** Base-currency Accounts Payable cleared so far for this bill (sum of
 *  posted PAYMENT entries' AP debit lines, already base currency). */
async function sumBillPaymentsBase(companyId: string, billId: string) {
  const [entries, accountsPayableCode] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${billId}:` }, status: "POSTED" },
      include: { lines: { include: { account: true } } },
    }),
    getAccountsPayableCode(companyId),
  ]);
  const apDebits = entries.flatMap((e: any) => e.lines.filter((l: any) => l.account.code === accountsPayableCode));
  return sum(apDebits.map((l: any) => l.debit));
}

/** Returns the cumulative amount paid toward this bill, in the bill's own
 *  currency (comparable directly to bill.total) — for display only; the
 *  PAID/PARTIALLY_PAID decision in recordSupplierPayment() above compares
 *  in base currency instead (see sumBillPaymentsBase), since dividing
 *  back to the bill's own currency and rounding can make a fully-cleared
 *  bill look a fraction short. */
export async function sumBillPayments(companyId: string, billId: string) {
  const [bill, baseApCleared] = await Promise.all([
    prisma.bill.findFirstOrThrow({ where: { id: billId, companyId }, select: { exchangeRate: true } }),
    sumBillPaymentsBase(companyId, billId),
  ]);
  return roundMoney(baseApCleared.dividedBy(bill.exchangeRate));
}
