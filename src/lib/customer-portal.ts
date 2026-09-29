/**
 * Customer Portal — self-service invoice/statement view for end customers.
 *
 * A customer is given a URL: /portal/[portalToken]
 * The token is the only credential — no login required. It is:
 * - Minted with randomBytes(24).toString("base64url") on first portal link generation
 * - Stored as Customer.portalToken (unique index)
 * - Rotatable by the company (generates a new token, old URLs stop working)
 *
 * The portal shows:
 * - Customer name, outstanding balance
 * - Open invoices (SENT, OVERDUE, PARTIALLY_PAID) with Pay links
 * - Paid invoice history
 */

import { randomBytes } from "crypto";
import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { SITE_URL } from "@/lib/site";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  status: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
  currency: string;
  /** Pay URL for this invoice (null if invoice has no payToken) */
  payUrl: string | null;
}

export interface PortalPageData {
  customer: {
    id: string;
    name: string;
    email: string | null;
    companyName: string;
  };
  openInvoices: PortalInvoice[];
  paidInvoices: PortalInvoice[];
  totalOutstanding: number;
  currency: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function mintToken(): string {
  return randomBytes(24).toString("base64url");
}

const OPEN_STATUSES: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID];
const PAID_STATUSES: InvoiceStatus[] = [InvoiceStatus.PAID];

// ─── Public read — no auth required (token IS the credential) ─────────────────

export async function loadPortalPage(token: string): Promise<PortalPageData | null> {
  // Note: Invoice model has no isActive or amountPaid fields — balance due is
  // computed from journal entries (PAYMENT sourceType) and applied credit notes.
  const customer = await prisma.customer.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      name: true,
      email: true,
      company: { select: { name: true, baseCurrency: true, id: true } },
      invoices: {
        where: { status: { in: [...OPEN_STATUSES, ...PAID_STATUSES] } },
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          dueDate: true,
          status: true,
          total: true,
          currency: true,
          payToken: true,
        },
        orderBy: { dueDate: "asc" },
      },
    },
  });

  if (!customer) return null;

  const currency = customer.company.baseCurrency ?? "USD";
  const companyId = customer.company.id;

  // Compute balance due for each invoice from cash payments + applied credit notes
  const invoiceIds = customer.invoices.map((i: { id: string }) => i.id);

  // Fetch all PAYMENT journal entries for these invoices in one query
  const paymentEntries = invoiceIds.length > 0
    ? await prisma.journalEntry.findMany({
        where: {
          companyId,
          sourceType: "PAYMENT",
          status: "POSTED",
          OR: invoiceIds.map((id: string) => ({ sourceId: { startsWith: `${id}:` } })),
        },
        include: { lines: { include: { account: true } } },
      })
    : [];

  // Fetch all applied credit notes for these invoices in one query
  const appliedCredits = invoiceIds.length > 0
    ? await prisma.creditNote.findMany({
        where: { companyId, invoiceId: { in: invoiceIds }, status: "APPLIED" },
        select: { invoiceId: true, total: true },
      })
    : [];

  // Build lookup maps: invoiceId → amounts
  const cashPaidByInvoice = new Map<string, number>();
  for (const entry of paymentEntries) {
    const sourceInvoiceId = entry.sourceId?.split(":")?.[0];
    if (!sourceInvoiceId) continue;
    const bankDebit = entry.lines
      .filter((l: any) => l.account?.code === "1000")
      .reduce((s: number, l: any) => s + Number(l.debit), 0);
    cashPaidByInvoice.set(
      sourceInvoiceId,
      (cashPaidByInvoice.get(sourceInvoiceId) ?? 0) + bankDebit
    );
  }

  const creditAppliedByInvoice = new Map<string, number>();
  for (const cn of appliedCredits) {
    if (!cn.invoiceId) continue;
    creditAppliedByInvoice.set(
      cn.invoiceId,
      (creditAppliedByInvoice.get(cn.invoiceId) ?? 0) + Number(cn.total)
    );
  }

  const mapInvoice = (inv: {
    id: string;
    invoiceNumber: string;
    issueDate: Date;
    dueDate: Date | null;
    status: string;
    total: unknown;
    currency: string | null;
    payToken: string | null;
  }): PortalInvoice => {
    const total = Number(inv.total);
    const amountPaid =
      (cashPaidByInvoice.get(inv.id) ?? 0) +
      (creditAppliedByInvoice.get(inv.id) ?? 0);
    const balanceDue = Math.max(0, total - amountPaid);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      status: inv.status,
      total,
      amountPaid,
      balanceDue,
      currency: inv.currency ?? currency,
      payUrl: inv.payToken ? `${SITE_URL}/pay/${inv.payToken}` : null,
    };
  };

  type InvRow = typeof customer.invoices[number];

  const openInvoices = customer.invoices
    .filter((i: InvRow) => OPEN_STATUSES.includes(i.status))
    .map(mapInvoice);

  const paidInvoices = customer.invoices
    .filter((i: InvRow) => PAID_STATUSES.includes(i.status))
    .map(mapInvoice)
    .sort((a: PortalInvoice, b: PortalInvoice) => b.issueDate.getTime() - a.issueDate.getTime());

  const totalOutstanding = openInvoices.reduce((s: number, i: PortalInvoice) => s + i.balanceDue, 0);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      companyName: customer.company.name,
    },
    openInvoices,
    paidInvoices,
    totalOutstanding,
    currency,
  };
}

// ─── Company-side: generate / rotate portal link ──────────────────────────────

/**
 * Generate (or return existing) portal token for a customer.
 * Called by the company, requires EDIT permission on customers.
 */
export async function getOrCreatePortalToken(
  companyId: string,
  membershipId: string,
  customerId: string
): Promise<string> {
  await requirePermission(membershipId, "customers", "EDIT");

  const existing = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
    select: { portalToken: true },
  });
  if (!existing) throw new Error("Customer not found");
  if (existing.portalToken) return existing.portalToken;

  const token = mintToken();
  await prisma.customer.update({
    where: { id: customerId },
    data: { portalToken: token },
  });
  return token;
}

/**
 * Rotate the portal token for a customer (invalidates old portal links).
 * Requires EDIT permission on customers.
 */
export async function rotatePortalToken(
  companyId: string,
  membershipId: string,
  customerId: string
): Promise<string> {
  await requirePermission(membershipId, "customers", "EDIT");

  const existing = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
    select: { id: true },
  });
  if (!existing) throw new Error("Customer not found");

  const token = mintToken();
  await prisma.customer.update({
    where: { id: customerId },
    data: { portalToken: token },
  });
  return token;
}

/** Full portal URL for a customer — mint token if needed. */
export async function getPortalUrl(
  companyId: string,
  membershipId: string,
  customerId: string
): Promise<string> {
  const token = await getOrCreatePortalToken(companyId, membershipId, customerId);
  return `${SITE_URL}/portal/${token}`;
}

/** Portal URL without any permission check — for use in emails etc. */
export function buildPortalUrl(token: string): string {
  return `${SITE_URL}/portal/${token}`;
}
