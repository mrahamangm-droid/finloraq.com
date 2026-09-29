import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { recordAuditEvent } from "@/lib/audit";
import { SITE_URL } from "@/lib/site";

/**
 * Automated payment reminders. Finds every SENT / PARTIALLY_PAID / OVERDUE
 * invoice whose due date has passed and whose customer has an email address,
 * then sends one reminder per invoice per reminder-interval window.
 *
 * Duplicate-guard: instead of a dedicated table we piggy-back on AuditEvent
 * (action="payment_reminder.sent", entityId=invoiceId). If a matching audit
 * row exists within the cooldown window we skip that invoice. This keeps the
 * schema stable and gives us a free history view in the Audit Log UI.
 *
 * Security note: a payToken is minted here using the same randomBytes(24)
 * approach as getOrCreatePayLink, but WITHOUT calling requirePermission()
 * because this runs as a system cron, not on behalf of any user. The token is
 * only used to build the /pay/<token> URL — the same public page that the
 * manual "Get payment link" flow creates — so no ledger mutations happen here.
 */

export interface ReminderResult {
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{ invoiceId: string; invoiceNumber: string; status: "sent" | "skipped" | "error"; reason?: string }>;
}

export async function processPaymentReminders(opts: {
  dryRun?: boolean;
  intervalDays?: number;
} = {}): Promise<ReminderResult> {
  const { dryRun = false, intervalDays = Number(process.env.REMINDER_INTERVAL_DAYS ?? "7") } = opts;

  const result: ReminderResult = { sent: 0, skipped: 0, errors: 0, details: [] };

  // Find all overdue payable invoices with a customer email
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      dueDate: { lt: new Date() },
      customer: { email: { not: null } },
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      company: { select: { id: true, name: true, legalName: true, baseCurrency: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  if (invoices.length === 0) return result;

  // Batch-check which invoices already have a reminder in the cooldown window
  const cutoff = new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000);
  const recentReminders = await prisma.auditEvent.findMany({
    where: {
      action: "payment_reminder.sent",
      entityType: "Invoice",
      entityId: { in: invoices.map((inv: { id: string }) => inv.id) },
      createdAt: { gte: cutoff },
    },
    select: { entityId: true, createdAt: true },
  });

  const recentSet = new Set(recentReminders.map((r: { entityId: string }) => r.entityId));

  for (const invoice of invoices) {
    const { id: invoiceId, invoiceNumber, customer, company } = invoice;

    if (recentSet.has(invoiceId)) {
      result.skipped++;
      result.details.push({ invoiceId, invoiceNumber, status: "skipped", reason: "reminder already sent within cooldown window" });
      continue;
    }

    if (!customer.email) {
      // Shouldn't happen given the WHERE clause, but guard anyway
      result.skipped++;
      result.details.push({ invoiceId, invoiceNumber, status: "skipped", reason: "no customer email" });
      continue;
    }

    if (dryRun) {
      result.details.push({ invoiceId, invoiceNumber, status: "sent", reason: "dry-run (not actually sent)" });
      result.sent++;
      continue;
    }

    try {
      // Mint a payToken if none exists yet (same approach as getOrCreatePayLink)
      let token = invoice.payToken;
      if (!token) {
        token = randomBytes(24).toString("base64url");
        await prisma.invoice.update({ where: { id: invoiceId }, data: { payToken: token } });
      }
      const payUrl = `${SITE_URL}/pay/${token}`;
      const companyName = company.legalName || company.name;
      const dueDate = invoice.dueDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const total = Number(invoice.total).toFixed(2);
      const currency = invoice.currency;

      const subject = `Payment Reminder: Invoice ${invoiceNumber} from ${companyName}`;
      const text = buildReminderText({ invoiceNumber, companyName, customerName: customer.name, dueDate, total, currency, payUrl });
      const html = buildReminderHtml({ invoiceNumber, companyName, customerName: customer.name, dueDate, total, currency, payUrl });

      await sendEmail({ to: customer.email, subject, html, text });

      await recordAuditEvent({
        companyId: company.id,
        action: "payment_reminder.sent",
        entityType: "Invoice",
        entityId: invoiceId,
        newValue: { to: customer.email, invoiceNumber, dueDate: invoice.dueDate.toISOString(), payUrl },
        source: "system",
      });

      result.sent++;
      result.details.push({ invoiceId, invoiceNumber, status: "sent" });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      result.errors++;
      result.details.push({ invoiceId, invoiceNumber, status: "error", reason });

      await recordAuditEvent({
        companyId: invoice.companyId,
        action: "payment_reminder.failed",
        entityType: "Invoice",
        entityId: invoiceId,
        newValue: { invoiceNumber, error: reason },
        source: "system",
      }).catch(() => {/* best-effort */});
    }
  }

  return result;
}

// ─── Email templates ──────────────────────────────────────────────────────────

interface ReminderTemplateInput {
  invoiceNumber: string;
  companyName: string;
  customerName: string;
  dueDate: string;
  total: string;
  currency: string;
  payUrl: string;
}

function buildReminderText(d: ReminderTemplateInput): string {
  return [
    `Dear ${d.customerName},`,
    "",
    `This is a reminder that Invoice ${d.invoiceNumber} from ${d.companyName} remains outstanding.`,
    "",
    `  Amount due:  ${d.currency} ${d.total}`,
    `  Due date:    ${d.dueDate}`,
    "",
    `To pay online, visit: ${d.payUrl}`,
    "",
    "If you have already submitted payment, please disregard this message.",
    "",
    `Thank you,`,
    d.companyName,
  ].join("\n");
}

function buildReminderHtml(d: ReminderTemplateInput): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Reminder</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" width="100%" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" width="560" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <!-- header -->
        <tr>
          <td style="background:#18181b;padding:24px 32px;">
            <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.3px;">${escapeHtml(d.companyName)}</span>
          </td>
        </tr>
        <!-- body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:14px;color:#71717a;">Payment Reminder</p>
            <h1 style="margin:0 0 24px;font-size:22px;font-weight:600;color:#09090b;">Invoice ${escapeHtml(d.invoiceNumber)}</h1>

            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3f3f46;">
              Dear ${escapeHtml(d.customerName)},<br /><br />
              This is a friendly reminder that the following invoice is overdue. Please arrange payment at your earliest convenience.
            </p>

            <!-- summary box -->
            <table cellpadding="0" cellspacing="0" width="100%" style="background:#f4f4f5;border-radius:6px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-size:13px;color:#71717a;padding-bottom:8px;">Invoice number</td>
                      <td align="right" style="font-size:13px;font-weight:600;color:#09090b;padding-bottom:8px;">${escapeHtml(d.invoiceNumber)}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#71717a;padding-bottom:8px;">Due date</td>
                      <td align="right" style="font-size:13px;color:#ef4444;font-weight:500;padding-bottom:8px;">${escapeHtml(d.dueDate)}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#71717a;border-top:1px solid #e4e4e7;padding-top:12px;">Amount due</td>
                      <td align="right" style="font-size:18px;font-weight:700;color:#09090b;border-top:1px solid #e4e4e7;padding-top:12px;">${escapeHtml(d.currency)} ${escapeHtml(d.total)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
              <tr>
                <td align="center">
                  <a href="${escapeHtml(d.payUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;">
                    Pay Now
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center;">
              If you have already submitted payment, please disregard this message.
              <br />You can also copy and paste this link: <a href="${escapeHtml(d.payUrl)}" style="color:#18181b;">${escapeHtml(d.payUrl)}</a>
            </p>
          </td>
        </tr>
        <!-- footer -->
        <tr>
          <td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:20px 32px;text-align:center;">
            <span style="font-size:12px;color:#a1a1aa;">Sent by ${escapeHtml(d.companyName)} via Finloraq</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
