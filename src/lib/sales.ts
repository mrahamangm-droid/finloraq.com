import type Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { shipStock, previewFifoCost } from "@/lib/inventory";
import { postJournalEntry, buildInvoicePosting, buildInvoicePaymentPosting, InvalidLineError, resolveDocumentCurrency } from "@/lib/ledger";
import { roundMoney, sum, money } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/numbering";
import { computeTaxedLines } from "@/lib/taxCalc";
import { foreignReferenceProblem } from "@/lib/tenantRefs";
import { getBankAccountCode, getAccountsReceivableCode, getOutputTaxPayableCode, getOrCreateExchangeGainLossCode, getOrCreateCogsExpenseCode, getOrCreateInventoryAssetCode } from "@/lib/accounts";

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
  productId?: string; // optional; if the product trackInventory=true, stock is deducted on posting
}

/** Draft only — no ledger impact. Revenue is recognized in postInvoiceToLedger(). */
export async function createInvoice(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  customerId: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  /** Rate to convert 1 unit of `currency` into the company's base currency.
   *  Required (and must be a positive number) when `currency` isn't the
   *  company's base currency; must be 1 or omitted otherwise. There is no
   *  live FX rate lookup — the caller supplies the rate. */
  exchangeRate?: number;
  lines: InvoiceLineInput[];
  /** Set only by createInvoiceFromSalesOrder() in src/lib/sales-orders.ts —
   *  marks this invoice as billing already-shipped Sales Order quantities,
   *  so postInvoiceToLedger() skips shipping stock and posting COGS again
   *  (both already happened at Shipment time). Never set by a direct,
   *  order-less invoice. */
  salesOrderId?: string;
}) {
  await requirePermission(params.membershipId, "invoices", "CREATE");
  const { currency, exchangeRate } = await resolveDocumentCurrency(prisma, params.companyId, params.currency, params.exchangeRate);

  if (params.lines.length === 0) {
    throw new InvalidLineError("An invoice needs at least one line.");
  }
  const customerProblem = await foreignReferenceProblem(prisma, params.companyId, "customer", [params.customerId]);
  if (customerProblem) throw new InvalidLineError(customerProblem);

  const { lines: computedLines, subtotal, taxTotal, total } = await computeTaxedLines(prisma, params.companyId, params.lines);

  const invoice = await prisma.$transaction(async (tx: any) => {
    const invoiceNumber = await nextDocumentNumber(tx, params.companyId, "INV", () =>
      tx.invoice.findFirst({ where: { companyId: params.companyId }, orderBy: { invoiceNumber: "desc" }, select: { invoiceNumber: true } }).then((r: any) => (r ? { number: r.invoiceNumber } : null))
    );

    return tx.invoice.create({
      data: {
        companyId: params.companyId,
        customerId: params.customerId,
        invoiceNumber,
        issueDate: params.issueDate,
        dueDate: params.dueDate,
        currency,
        exchangeRate,
        subtotal,
        taxTotal,
        total,
        status: "DRAFT",
        ...(params.salesOrderId ? { salesOrderId: params.salesOrderId } : {}),
        lines: {
          create: computedLines.map((l) => ({
            description: l.line.description,
            quantity: l.line.quantity,
            unitPrice: l.line.unitPrice,
            taxCodeId: l.line.taxCodeId,
            lineTotal: l.lineTotal,
            ...(l.line.productId ? { productId: l.line.productId } : {}),
          })),
        },
      },
      include: { lines: true },
    });
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "invoice.created",
    entityType: "Invoice",
    entityId: invoice.id,
    newValue: { invoiceNumber: invoice.invoiceNumber, total: total.toFixed(2) },
  });

  return invoice;
}

/**
 * Edits a DRAFT invoice's own fields and lines, recomputing subtotal/tax/
 * total exactly like createInvoice() does. Refused once the invoice has
 * left DRAFT (postInvoiceToLedger already posted it to the ledger by
 * then) — the immutable-once-posted rule in src/lib/ledger.ts applies to
 * the source document too, not just the JournalEntry it produced:
 * changing a SENT invoice's numbers after the fact would silently
 * desynchronize it from the revenue already recognized. Correct a posted
 * invoice with a credit note / new invoice instead. Replaces every line
 * (delete-then-recreate under one transaction) rather than diffing,
 * mirroring how createInvoice() builds them the first time.
 */
export async function updateInvoice(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  invoiceId: string;
  customerId?: string;
  issueDate?: Date;
  dueDate?: Date;
  currency?: string;
  exchangeRate?: number;
  lines?: InvoiceLineInput[];
}) {
  await requirePermission(params.membershipId, "invoices", "EDIT");

  const before = await prisma.invoice.findFirst({ where: { id: params.invoiceId, companyId: params.companyId }, include: { lines: true } });
  if (!before) throw new NotFoundError("Invoice not found.");
  if (before.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft invoice can be edited. Once sent, correct it with a credit note or a new invoice.");
  }
  // Editing may change currency freely (including into or out of a foreign
  // currency) since nothing has posted yet — resolveDocumentCurrency
  // re-validates the rate every time, same as createInvoice(). Keeps the
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
  const customerProblem = await foreignReferenceProblem(prisma, params.companyId, "customer", [params.customerId]);
  if (customerProblem) throw new InvalidLineError(customerProblem);

  let subtotal = before.subtotal, taxTotal = before.taxTotal, total = before.total;
  let lineData: { description: string; quantity: number; unitPrice: number; taxCodeId?: string; lineTotal: Decimal }[] | undefined;

  if (params.lines) {
    if (params.lines.length === 0) {
      throw new InvalidLineError("An invoice needs at least one line.");
    }
    const computedLines = await computeTaxedLines(prisma, params.companyId, params.lines);
    subtotal = computedLines.subtotal;
    taxTotal = computedLines.taxTotal;
    total = computedLines.total;
    lineData = computedLines.lines.map((l) => ({ description: l.line.description, quantity: l.line.quantity, unitPrice: l.line.unitPrice, taxCodeId: l.line.taxCodeId, lineTotal: l.lineTotal, ...(l.line.productId ? { productId: l.line.productId } : {}) }));
  }

  const invoice = await prisma.$transaction(async (tx: any) => {
    if (lineData) {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: before.id } });
    }
    return tx.invoice.update({
      where: { id: before.id },
      data: {
        customerId: params.customerId,
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
    action: "invoice.updated",
    entityType: "Invoice",
    entityId: invoice.id,
    previousValue: { total: before.total.toFixed(2), lineCount: before.lines.length },
    newValue: { total: invoice.total.toFixed(2), lineCount: invoice.lines.length },
  });

  return invoice;
}

/** Deletes a DRAFT invoice outright — refused once it's been posted
 *  (SENT or later), same boundary as updateInvoice() above. */
export async function deleteInvoice(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  invoiceId: string;
}) {
  await requirePermission(params.membershipId, "invoices", "DELETE");

  const invoice = await prisma.invoice.findFirst({ where: { id: params.invoiceId, companyId: params.companyId } });
  if (!invoice) throw new NotFoundError("Invoice not found.");
  if (invoice.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft invoice can be deleted. A sent invoice can't be removed — void it via a credit note instead.");
  }

  await prisma.$transaction([
    prisma.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } }),
    prisma.invoice.delete({ where: { id: invoice.id } }),
  ]);

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "invoice.deleted",
    entityType: "Invoice",
    entityId: invoice.id,
    previousValue: { invoiceNumber: invoice.invoiceNumber, total: invoice.total.toFixed(2) },
  });
}

/** Draft -> Sent: this is what actually recognizes revenue by posting to
 *  the ledger. Requires invoices:EDIT (transition) *and*, inside
 *  postJournalEntry, journals:APPROVE — so an Accountant can raise an
 *  invoice but typically can't be the one to post it, matching the spec's
 *  approval-workflow intent even though invoices and journals are
 *  separate modules in the permission matrix. */
export async function postInvoiceToLedger(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  invoiceId: string;
}) {
  await requirePermission(params.membershipId, "invoices", "EDIT");

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, companyId: params.companyId },
    include: {
      lines: {
        include: { product: { select: { id: true, name: true, trackInventory: true, quantityOnHand: true, expenseAccountCode: true } } },
      },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice not found.");

  if (invoice.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft invoice can be posted.");
  }

  const [accountsReceivableCode, outputTaxCode] = await Promise.all([
    getAccountsReceivableCode(params.companyId),
    getOutputTaxPayableCode(params.companyId),
  ]);

  // The ledger always posts in base currency. For a foreign-currency
  // invoice, convert using the rate captured at issue time (invoice.exchangeRate).
  // baseTotal and baseTaxTotal are each rounded independently, then
  // baseSubtotal is derived as the difference (not rounded independently)
  // so the three always sum exactly — independent rounding of all three
  // could otherwise leave the entry off by a cent and fail the ledger's
  // debit=credit check.
  const baseTotal = roundMoney(money(invoice.total).times(invoice.exchangeRate));
  const baseTaxTotal = roundMoney(money(invoice.taxTotal).times(invoice.exchangeRate));
  const baseSubtotal = baseTotal.minus(baseTaxTotal);

  // Every tracked-inventory line relieves the Inventory Asset account to
  // COGS at its FIFO cost, in the SAME journal entry as the revenue — see
  // buildInvoicePosting. previewFifoCost() only reads (it doesn't consume
  // anything yet); the actual physical consumption happens in the shipStock
  // loop below, once this entry has posted. Fails fast, before anything is
  // written, if there isn't enough physical stock — recognizing revenue and
  // cost of goods you don't have would misstate both the P&L and the
  // balance sheet; this is a deliberate behavior change from the previous
  // "ship best-effort, log and ignore a shortfall" approach.
  //
  // An invoice raised from a Sales Order (salesOrderId set) skips this
  // entirely: the goods already shipped — and COGS already posted — at
  // Shipment time (see createShipment in src/lib/sales-orders.ts). Costing
  // it again here would both double-book COGS and try to ship stock a
  // second time.
  const trackedLines = invoice.salesOrderId
    ? []
    : (invoice.lines as any[]).filter((l) => l.product?.trackInventory && Number(l.quantity) > 0);
  let cogsLines: { accountCode: string; amount: Decimal }[] = [];
  let inventoryAssetCode: string | undefined;
  if (trackedLines.length > 0) {
    const [defaultCogsCode, resolvedInventoryAssetCode] = await Promise.all([
      getOrCreateCogsExpenseCode(params.companyId),
      getOrCreateInventoryAssetCode(params.companyId),
    ]);
    inventoryAssetCode = resolvedInventoryAssetCode;
    const cogsGroups = new Map<string, Decimal>();
    for (const line of trackedLines) {
      const available = Number(line.product.quantityOnHand);
      const qty = Number(line.quantity);
      if (available < qty) {
        throw new InvalidLineError(
          `Not enough stock of "${line.product.name}" to post this invoice — available ${available}, need ${qty}. Adjust the stock level or the invoice quantity first.`
        );
      }
      const { totalCost } = await previewFifoCost(params.companyId, line.product.id, qty);
      const code = line.product.expenseAccountCode ?? defaultCogsCode;
      cogsGroups.set(code, (cogsGroups.get(code) ?? money(0)).plus(totalCost));
    }
    cogsLines = [...cogsGroups.entries()].map(([accountCode, amount]) => ({ accountCode, amount }));
  }

  const entry = await postJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: invoice.issueDate,
    sourceType: "INVOICE",
    sourceId: invoice.id,
    memo: `Invoice ${invoice.invoiceNumber}`,
    currency: invoice.currency,
    exchangeRate: invoice.exchangeRate,
    lines: buildInvoicePosting({ subtotal: baseSubtotal, taxTotal: baseTaxTotal, total: baseTotal, accountsReceivableCode, outputTaxCode, cogsLines, inventoryAssetCode }),
    post: true,
  });

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "SENT", journalEntryId: entry.id },
  });

  // Physically consume the stock the journal entry above already costed.
  // Failures are logged but never abort — the ledger entry is already
  // committed and immutable; a manual stock adjustment can correct the
  // physical side later. Under normal operation this always succeeds (the
  // availability check above just ran); the residual risk is a concurrent
  // shipment of the same product landing between the check and this call,
  // an accepted pre-existing limitation (no per-product locking here).
  for (const line of trackedLines) {
    try {
      await shipStock(
        params.companyId,
        params.userId,
        line.product.id,
        Number(line.quantity),
        {
          notes: `Invoice ${invoice.invoiceNumber}`,
          referenceType: "Invoice",
          referenceId: invoice.id,
          date: invoice.issueDate,
        }
      );
    } catch (err: any) {
      console.error(`[inventory] shipStock failed for invoice ${invoice.id} product ${line.product.id}: ${err?.message}`);
    }
  }

  return updated;
}

/** Customer payment against a sent invoice: DR Bank, CR Accounts
 *  Receivable, and moves the invoice to PARTIALLY_PAID/PAID depending on
 *  cumulative payments recorded via this same JournalSourceType.PAYMENT
 *  trail (summed from posted journal entries, not a separate counter that
 *  could drift). */
export async function recordInvoicePayment(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  invoiceId: string;
  /** In the invoice's own currency (what the customer actually paid). */
  amount: number;
  date: Date;
  /** Rate to convert `amount` (invoice currency) to base currency, as of
   *  the payment date. Defaults to the invoice's own booking rate (assumes
   *  no FX movement since issue) when omitted — pass an explicit rate to
   *  book realized exchange gain/loss on a foreign-currency invoice
   *  settled at a different rate than it was raised at. Ignored (must be 1
   *  if given) for a base-currency invoice. */
  exchangeRate?: number;
  /** Stable reference for payments that arrive from a provider (e.g. "stripe:pi_123").
   *  Makes the posting idempotent: the ledger refuses a second entry with the same source. */
  sourceRef?: string;
  memo?: string;
}) {
  await requirePermission(params.membershipId, "invoices", "EDIT");

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, companyId: params.companyId },
  });
  if (!invoice) throw new NotFoundError("Invoice not found.");

  if (!["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)) {
    throw new InvalidLineError("Only a sent invoice can receive a payment.");
  }

  const paymentExchangeRate = params.exchangeRate !== undefined ? money(params.exchangeRate) : money(invoice.exchangeRate);
  if (!paymentExchangeRate.greaterThan(0)) {
    throw new InvalidLineError("Payment exchange rate must be positive.");
  }
  if (money(invoice.exchangeRate).equals(1) && !paymentExchangeRate.equals(1)) {
    throw new InvalidLineError("A base-currency invoice's payment exchange rate must be 1.");
  }

  // unique per payment so multiple partial payments can each post
  const paymentId = `${invoice.id}:${params.sourceRef ?? Date.now()}`;
  const [bankAccountCode, accountsReceivableCode] = await Promise.all([
    getBankAccountCode(params.companyId),
    getAccountsReceivableCode(params.companyId),
  ]);

  // Both amounts are base currency: what actually hit the bank (at the
  // payment-date rate) vs. how much of the base-currency AR balance this
  // settles (at the invoice's own booking rate). Any difference is
  // realized exchange gain/loss — see buildInvoicePaymentPosting.
  const baseCashReceived = roundMoney(money(params.amount).times(paymentExchangeRate));
  const baseArCleared = roundMoney(money(params.amount).times(invoice.exchangeRate));
  const exchangeGainLossCode = baseCashReceived.equals(baseArCleared)
    ? undefined
    : await getOrCreateExchangeGainLossCode(params.companyId);

  const entry = await postJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: params.date,
    sourceType: "PAYMENT",
    sourceId: paymentId,
    memo: params.memo ?? `Payment received — Invoice ${invoice.invoiceNumber}`,
    currency: invoice.currency,
    inheritsPostedCurrency: true, // settles an invoice that is already posted
    lines: buildInvoicePaymentPosting({ amount: baseCashReceived, arAmount: baseArCleared, bankAccountCode, accountsReceivableCode, exchangeGainLossCode }),
    post: true,
  });

  // Decided in base currency, not the invoice's own currency — dividing
  // the base-currency AR-cleared total back by the invoice's rate and
  // rounding (as sumInvoicePayments() does for display) can leave a
  // fully-cleared invoice a fraction short of invoice.total, permanently
  // stuck at PARTIALLY_PAID with an unpayable residual balance (the next
  // payment for that fraction would post a zero-amount AR line, which
  // postJournalEntry refuses).
  const baseClearedSoFar = await sumInvoiceClearedBase(params.companyId, invoice.id);
  const baseInvoiceTotal = roundMoney(money(invoice.total).times(invoice.exchangeRate));
  const newStatus = baseClearedSoFar.gte(baseInvoiceTotal) ? "PAID" : "PARTIALLY_PAID";

  await prisma.invoice.update({ where: { id: invoice.id }, data: { status: newStatus } });

  return entry;
}

/** Base-currency amount cleared against this invoice so far: cash payments
 *  (AR credit lines, already base currency) plus credit notes applied,
 *  each converted at its OWN booking rate (cn.exchangeRate) — that's the
 *  rate its own journal entry actually posted the AR reduction at (see
 *  postCreditNote in src/lib/credit-notes.ts), which can differ from the
 *  invoice's own rate if FX moved between the invoice and the credit note.
 *  applyCreditNoteToInvoice requires cn.currency === invoice.currency, so
 *  the two are always directly comparable in that currency even though
 *  their base-currency rates may differ. */
export async function sumInvoiceClearedBase(companyId: string, invoiceId: string) {
  const [entries, appliedCreditNotes, accountsReceivableCode] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${invoiceId}:` }, status: "POSTED" },
      include: { lines: { include: { account: true } } },
    }),
    // Credit notes applied to this invoice also reduce the balance due
    prisma.creditNote.findMany({
      where: { companyId, invoiceId, status: "APPLIED" },
      select: { total: true, exchangeRate: true },
    }),
    getAccountsReceivableCode(companyId),
  ]);
  const arCredits = entries.flatMap((e: any) => e.lines.filter((l: any) => l.account.code === accountsReceivableCode));
  const baseArCleared = sum(arCredits.map((l: any) => l.credit));
  const creditAppliedBase = sum(appliedCreditNotes.map((cn: any) => roundMoney(money(cn.total).times(cn.exchangeRate))));
  return baseArCleared.plus(creditAppliedBase);
}

/** Returns the cumulative amount paid toward this invoice, in the
 *  invoice's own currency (comparable directly to invoice.total) — for
 *  display only; the PAID/PARTIALLY_PAID decision in
 *  recordInvoicePayment() above compares in base currency instead (see
 *  sumInvoiceClearedBase), since dividing back to the invoice's own
 *  currency and rounding can make a fully-cleared invoice look a fraction
 *  short.
 *
 *  Cash payments are derived from the base-currency AR credit sum divided
 *  back by the invoice's own booking rate (a payment always clears AR at
 *  that rate — see recordInvoicePayment). Credit notes applied are added
 *  at face value instead of going through sumInvoiceClearedBase's
 *  base-currency figure: applyCreditNoteToInvoice requires a credit
 *  note's currency to match the invoice's, so cn.total is already in the
 *  invoice's own currency — converting it via the invoice's rate (rather
 *  than adding it directly) would misstate it whenever the credit note's
 *  own rate differs from the invoice's (FX moved between the two). */
export async function sumInvoicePayments(companyId: string, invoiceId: string) {
  const [invoice, entries, appliedCreditNotes, accountsReceivableCode] = await Promise.all([
    prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, companyId }, select: { exchangeRate: true } }),
    prisma.journalEntry.findMany({
      where: { companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${invoiceId}:` }, status: "POSTED" },
      include: { lines: { include: { account: true } } },
    }),
    prisma.creditNote.findMany({
      where: { companyId, invoiceId, status: "APPLIED" },
      select: { total: true },
    }),
    getAccountsReceivableCode(companyId),
  ]);
  const arCredits = entries.flatMap((e: any) => e.lines.filter((l: any) => l.account.code === accountsReceivableCode));
  const baseArCleared = sum(arCredits.map((l: any) => l.credit));
  const cashPaid = baseArCleared.dividedBy(invoice.exchangeRate);
  const creditApplied = sum(appliedCreditNotes.map((cn: any) => cn.total));
  return roundMoney(cashPaid.plus(creditApplied));
}

/**
 * Send an invoice to the customer by email.
 * - Only invoices in SENT, PARTIALLY_PAID, or OVERDUE status can be emailed
 *   (drafts should be posted first; paid invoices can use the receipt action).
 * - When email is unconfigured, the DevEmailSender logs the content and
 *   records an audit event (same pattern as payment-reminders.ts).
 * - An audit event is recorded on success so the activity trail shows when
 *   each invoice was emailed (searchable in Audit → action: invoice.emailed).
 */
export async function sendInvoiceByEmail(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  invoiceId: string;
  /** Override the customer email for this send (BCC-style custom recipient). */
  toEmail?: string;
}) {
  await requirePermission(params.membershipId, "invoices", "EDIT");

  const invoice = await prisma.invoice.findFirstOrThrow({
    where: { id: params.invoiceId, companyId: params.companyId },
    include: {
      customer: true,
      lines: { include: { taxCode: true } },
    },
  });

  const company = await prisma.company.findFirstOrThrow({
    where: { id: params.companyId },
    select: { name: true, brandEmail: true, invoiceTerms: true },
  });

  if (!["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)) {
    throw new Error(`Invoice ${invoice.invoiceNumber} cannot be emailed in status ${invoice.status}. Post it first.`);
  }

  const recipientEmail = params.toEmail ?? invoice.customer.email;
  if (!recipientEmail) {
    throw new Error(`Customer "${invoice.customer.name}" has no email address on file.`);
  }

  const { sendEmail } = await import("@/lib/email");

  const subject = `Invoice ${invoice.invoiceNumber} from ${company.name}`;
  const lineRows = (invoice as any).lines
    .map((l: any) => `<tr style="border-bottom:1px solid #eee">
      <td style="padding:6px 8px">${l.description ?? ""}</td>
      <td style="padding:6px 8px;text-align:right">${Number(l.quantity)}</td>
      <td style="padding:6px 8px;text-align:right">${Number(l.unitPrice).toFixed(2)}</td>
      <td style="padding:6px 8px;text-align:right">${Number(l.lineTotal).toFixed(2)}</td>
    </tr>`)
    .join("");

  const html = `<!doctype html><html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
<h2 style="margin-bottom:4px">${company.name}</h2>
<p style="color:#666;margin-top:0">Invoice ${invoice.invoiceNumber}</p>
<p>Dear ${invoice.customer.name},</p>
<p>Please find your invoice details below.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
  <thead><tr style="background:#f5f5f5">
    <th style="padding:6px 8px;text-align:left">Description</th>
    <th style="padding:6px 8px;text-align:right">Qty</th>
    <th style="padding:6px 8px;text-align:right">Unit price</th>
    <th style="padding:6px 8px;text-align:right">Total</th>
  </tr></thead>
  <tbody>${lineRows}</tbody>
</table>
<p style="text-align:right">
  Subtotal: ${Number(invoice.subtotal).toFixed(2)} ${invoice.currency}<br>
  Tax: ${Number(invoice.taxTotal).toFixed(2)} ${invoice.currency}<br>
  <strong>Total: ${Number(invoice.total).toFixed(2)} ${invoice.currency}</strong>
</p>
<p>Issue date: ${invoice.issueDate.toISOString().slice(0, 10)}<br>
Due date: ${invoice.dueDate.toISOString().slice(0, 10)}</p>
${company.invoiceTerms ? `<p style="color:#666;font-size:13px">${company.invoiceTerms}</p>` : ""}
${company.brandEmail ? `<p style="color:#888;font-size:12px">Questions? Reply to ${company.brandEmail}</p>` : ""}
</body></html>`;

  const text = [
    `${company.name} — Invoice ${invoice.invoiceNumber}`,
    ``,
    `Dear ${invoice.customer.name},`,
    `Please see your invoice details:`,
    ``,
    ...(invoice as any).lines.map((l: any) =>
      `  ${l.description ?? ""} — ${Number(l.quantity)} × ${Number(l.unitPrice).toFixed(2)} = ${Number(l.lineTotal).toFixed(2)} ${invoice.currency}`
    ),
    ``,
    `Subtotal: ${Number(invoice.subtotal).toFixed(2)} ${invoice.currency}`,
    `Tax:      ${Number(invoice.taxTotal).toFixed(2)} ${invoice.currency}`,
    `Total:    ${Number(invoice.total).toFixed(2)} ${invoice.currency}`,
    ``,
    `Due: ${invoice.dueDate.toISOString().slice(0, 10)}`,
    company.invoiceTerms ? `\n${company.invoiceTerms}` : "",
  ].filter((s) => s !== undefined).join("\n");

  const result = await sendEmail({ to: recipientEmail, subject, html, text });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "invoice.emailed",
    entityType: "Invoice",
    entityId: invoice.id,
    newValue: { to: recipientEmail, emailId: result.id, live: result.live },
    source: "web",
  });

  return { emailId: result.id, live: result.live, to: recipientEmail };
}
