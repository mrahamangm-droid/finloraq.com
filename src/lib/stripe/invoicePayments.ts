import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { requirePermission } from "@/lib/rbac";
import { SITE_URL } from "@/lib/site";
import { recordInvoicePayment, sumInvoicePayments } from "@/lib/sales";
import { DuplicatePostingError } from "@/lib/ledger";
import { stripeRequest } from "./client";
import { fromMinorUnits, toMinorUnits } from "./core";

/**
 * "Pay now" links for invoices. A company shares /pay/<token> with its
 * customer; the page opens Stripe Checkout on the company's connected
 * account; the webhook posts the receipt (DR Bank / CR Accounts Receivable)
 * through the normal ledger path and marks the invoice paid.
 */

const PAYABLE = ["SENT", "PARTIALLY_PAID", "OVERDUE"] as const;

export class PaymentLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentLinkError";
  }
}

export async function getOrCreatePayLink(params: { companyId: string; membershipId: string; invoiceId: string }): Promise<string> {
  await requirePermission(params.membershipId, "invoices", "EDIT");
  const conn = await prisma.paymentConnection.findUnique({ where: { companyId: params.companyId } });
  if (!conn?.chargesEnabled) {
    throw new PaymentLinkError("Connect Stripe in Settings → Online payments before sharing payment links.");
  }
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { id: params.invoiceId, companyId: params.companyId } });
  if (!PAYABLE.includes(invoice.status as (typeof PAYABLE)[number])) {
    throw new PaymentLinkError("Only a sent, unpaid invoice can have a payment link. Post the invoice first.");
  }
  let token = invoice.payToken;
  if (!token) {
    token = randomBytes(24).toString("base64url");
    await prisma.invoice.update({ where: { id: invoice.id }, data: { payToken: token } });
  }
  return `${SITE_URL}/pay/${token}`;
}

/** Everything the public pay page shows. Returns null for an unknown token. */
export async function loadPayPage(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const invoice = await prisma.invoice.findUnique({
    where: { payToken: token },
    include: { company: { include: { paymentConnection: true } }, customer: true },
  });
  if (!invoice) return null;
  const paid = await sumInvoicePayments(invoice.companyId, invoice.id);
  const balance = invoice.total.minus(paid.toString());
  const payable =
    PAYABLE.includes(invoice.status as (typeof PAYABLE)[number]) &&
    balance.gt(0) &&
    Boolean(invoice.company.paymentConnection?.chargesEnabled);
  return {
    invoiceNumber: invoice.invoiceNumber,
    companyName: invoice.company.legalName || invoice.company.name,
    customerName: invoice.customer.name,
    currency: invoice.currency,
    total: invoice.total.toFixed(2),
    balanceDue: balance.gt(0) ? balance.toFixed(2) : "0.00",
    dueDate: invoice.dueDate,
    status: invoice.status,
    payable,
  };
}

/** Opens a Stripe Checkout session for the outstanding balance. */
export async function createPayCheckout(token: string): Promise<string> {
  const invoice = await prisma.invoice.findUnique({
    where: { payToken: token },
    include: { company: { include: { paymentConnection: true } }, customer: true },
  });
  const conn = invoice?.company.paymentConnection;
  if (!invoice || !conn?.chargesEnabled) throw new PaymentLinkError("This invoice can't be paid online right now.");
  if (!PAYABLE.includes(invoice.status as (typeof PAYABLE)[number])) throw new PaymentLinkError("This invoice is already settled.");

  const balance = invoice.total.minus((await sumInvoicePayments(invoice.companyId, invoice.id)).toString());
  if (balance.lte(0)) throw new PaymentLinkError("This invoice is already paid.");

  const currency = invoice.currency.toLowerCase();
  const metadata = { kind: "invoice", invoiceId: invoice.id, companyId: invoice.companyId };
  const session = await stripeRequest<{ url: string }>(
    "POST",
    "/checkout/sessions",
    {
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: toMinorUnits(balance.toFixed(2), currency),
          product_data: { name: `Invoice ${invoice.invoiceNumber}`, description: invoice.company.legalName || invoice.company.name },
        },
      }],
      customer_email: invoice.customer.email ?? undefined,
      metadata,
      payment_intent_data: { metadata, description: `Invoice ${invoice.invoiceNumber}` },
      success_url: `${SITE_URL}/pay/${token}?paid=1`,
      cancel_url: `${SITE_URL}/pay/${token}`,
    },
    { stripeAccount: conn.accountId },
  );
  return session.url;
}

interface CheckoutSession {
  id: string;
  mode: string;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  payment_intent: string | null;
  metadata?: Record<string, string>;
}

/** Webhook handler for a paid invoice checkout on a connected account. Safe to call repeatedly. */
export async function handleInvoiceCheckoutPaid(session: CheckoutSession, connectedAccountId: string | undefined): Promise<void> {
  const { invoiceId, companyId } = session.metadata ?? {};
  if (!invoiceId || !companyId || session.payment_status !== "paid" || session.amount_total == null || !session.currency) return;

  // The event must come from the account this company connected — never trust metadata alone.
  const conn = await prisma.paymentConnection.findUnique({ where: { companyId } });
  if (!conn || conn.accountId !== connectedAccountId) return;

  const providerPaymentId = session.payment_intent ?? session.id;
  if (await prisma.onlinePayment.findUnique({ where: { providerPaymentId } })) return;

  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId } });
  if (!invoice) return;
  const amount = fromMinorUnits(session.amount_total, session.currency);

  let status: "POSTED" | "NEEDS_REVIEW" = "POSTED";
  let journalEntryId: string | null = null;
  let note: string | null = null;

  if (invoice.currency.toLowerCase() !== session.currency.toLowerCase()) {
    status = "NEEDS_REVIEW";
    note = `Paid in ${session.currency.toUpperCase()} but the invoice is in ${invoice.currency}.`;
  } else {
    const membership = await prisma.companyMembership.findUnique({ where: { id: conn.connectedByMembershipId } });
    try {
      if (!membership?.isActive) throw new Error("The admin who connected Stripe is no longer active — reconnect payments in Settings.");
      const entry = await recordInvoicePayment({
        companyId,
        membershipId: membership.id,
        userId: membership.userId,
        invoiceId,
        amount: Number(amount),
        date: new Date(),
        sourceRef: `stripe:${providerPaymentId}`,
        memo: `Online card payment (Stripe) — Invoice ${invoice.invoiceNumber}`,
      });
      journalEntryId = entry.id;
    } catch (err) {
      if (err instanceof DuplicatePostingError) {
        const existing = await prisma.journalEntry.findFirst({ where: { companyId, sourceType: "PAYMENT", sourceId: `${invoiceId}:stripe:${providerPaymentId}` } });
        journalEntryId = existing?.id ?? null;
      } else {
        status = "NEEDS_REVIEW";
        note = err instanceof Error ? err.message : "Could not post the payment.";
      }
    }
  }

  try {
    const payment = await prisma.onlinePayment.create({
      data: {
        companyId, invoiceId, providerPaymentId, checkoutSessionId: session.id,
        amount: new Prisma.Decimal(amount), currency: session.currency.toUpperCase(), status, journalEntryId, note,
      },
    });
    await recordAuditEvent({
      companyId, action: status === "POSTED" ? "payments.invoice_paid_online" : "payments.invoice_payment_needs_review",
      entityType: "Invoice", entityId: invoiceId,
      newValue: { onlinePaymentId: payment.id, amount, currency: session.currency, providerPaymentId, note },
      source: "system",
    });
  } catch (err) {
    // a concurrent delivery of the same event already recorded it
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
}

export type { CheckoutSession };
