import type Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { shipStock } from "@/lib/inventory";
import { postJournalEntry, buildInvoicePosting, buildInvoicePaymentPosting, InvalidLineError, assertBaseCurrency, normalizeCurrencyCode } from "@/lib/ledger";
import { roundMoney, sum } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/numbering";
import { computeTaxedLines } from "@/lib/taxCalc";
import { foreignReferenceProblem } from "@/lib/tenantRefs";

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
  lines: InvoiceLineInput[];
}) {
  await requirePermission(params.membershipId, "invoices", "CREATE");
  await assertBaseCurrency(prisma, params.companyId, params.currency);

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
        currency: normalizeCurrencyCode(params.currency),
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
  lines?: InvoiceLineInput[];
}) {
  await requirePermission(params.membershipId, "invoices", "EDIT");

  const before = await prisma.invoice.findFirst({ where: { id: params.invoiceId, companyId: params.companyId }, include: { lines: true } });
  if (!before) throw new NotFoundError("Invoice not found.");
  if (before.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft invoice can be edited. Once sent, correct it with a credit note or a new invoice.");
  }
  // Editing may keep the draft's current currency (so an edit never silently
  // re-labels it) or move it to the base currency, but never to another
  // foreign currency. Posting re-checks via postJournalEntry().
  if (params.currency !== undefined && normalizeCurrencyCode(params.currency) !== normalizeCurrencyCode(before.currency)) {
    await assertBaseCurrency(prisma, params.companyId, params.currency);
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
        currency: params.currency === undefined ? undefined : normalizeCurrencyCode(params.currency),
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
        include: { product: { select: { id: true, trackInventory: true } } },
      },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice not found.");

  if (invoice.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft invoice can be posted.");
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
    lines: buildInvoicePosting({ subtotal: invoice.subtotal, taxTotal: invoice.taxTotal, total: invoice.total }),
    post: true,
  });

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "SENT", journalEntryId: entry.id },
  });

  // Deduct inventory for any line that references a tracked product.
  // Failures are logged but never abort the invoice posting — the ledger
  // entry is already committed and immutable; a manual stock adjustment can
  // correct the inventory side later. This follows the same "best effort"
  // approach used by Zoho Books when stock is below zero.
  for (const line of (invoice as any).lines) {
    if (line.product?.trackInventory && line.quantity) {
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
        // Log but do not rethrow — stock adjustments are correctable,
        // un-posting a journal entry is not.
        console.error(`[inventory] shipStock failed for invoice ${invoice.id} product ${line.product.id}: ${err?.message}`);
      }
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
  amount: number;
  date: Date;
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

  // unique per payment so multiple partial payments can each post
  const paymentId = `${invoice.id}:${params.sourceRef ?? Date.now()}`;

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
    lines: buildInvoicePaymentPosting({ amount: params.amount }),
    post: true,
  });

  const paidSoFar = await sumInvoicePayments(params.companyId, invoice.id);
  const newStatus = paidSoFar.gte(invoice.total) ? "PAID" : "PARTIALLY_PAID";

  await prisma.invoice.update({ where: { id: invoice.id }, data: { status: newStatus } });

  return entry;
}

export async function sumInvoicePayments(companyId: string, invoiceId: string) {
  const [entries, appliedCreditNotes] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${invoiceId}:` }, status: "POSTED" },
      include: { lines: { include: { account: true } } },
    }),
    // Credit notes applied to this invoice also reduce the balance due
    prisma.creditNote.findMany({
      where: { companyId, invoiceId, status: "APPLIED" },
      select: { total: true },
    }),
  ]);
  const bankDebits = entries.flatMap((e: any) => e.lines.filter((l: any) => l.account.code === "1000"));
  const cashPaid = sum(bankDebits.map((l: any) => l.debit));
  const creditApplied = appliedCreditNotes.reduce((s: number, cn: any) => s + Number(cn.total), 0);
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
