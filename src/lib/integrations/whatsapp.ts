import { recordAuditEvent } from "@/lib/audit";
import type { WhatsAppAdapter, WhatsAppSendResult } from "@/lib/integrations/types";

/**
 * Dev/simulated WhatsApp Business API adapter. A live implementation
 * needs WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID (see
 * .env.example) and Meta app review — not configured here. This one
 * logs an audit event and returns live:false instead of silently
 * dropping the message or pretending it sent, so a caller (or a test)
 * can tell the difference.
 */
class DevWhatsAppAdapter implements WhatsAppAdapter {
  readonly provider = "dev-simulated";

  async sendDocumentLink(input: { toPhoneNumber: string; documentUrl: string; caption: string }): Promise<WhatsAppSendResult> {
    return this.logAndSimulate("whatsapp.document_link_simulated", input);
  }

  async sendPaymentReminder(input: { toPhoneNumber: string; invoiceNumber: string; amount: number; currency: string }): Promise<WhatsAppSendResult> {
    return this.logAndSimulate("whatsapp.payment_reminder_simulated", input);
  }

  private async logAndSimulate(action: string, payload: unknown): Promise<WhatsAppSendResult> {
    const messageId = `SIMULATED-${Date.now()}`;
    await recordAuditEvent({
      action,
      entityType: "WhatsAppMessage",
      entityId: messageId,
      newValue: payload as object,
      source: "system",
    });
    return { live: false, messageId };
  }
}

function isConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

let cached: WhatsAppAdapter | null = null;

/** Returns the dev adapter today regardless of isConfigured() — a live
 *  WhatsAppAdapter implementation (real Graph API calls) is the next
 *  step once credentials are actually present; isConfigured() is exposed
 *  so the Settings UI can show accurate "not connected" status without
 *  the adapter itself lying about which mode it's in. */
export function getWhatsAppAdapter(): WhatsAppAdapter {
  if (!cached) cached = new DevWhatsAppAdapter();
  return cached;
}

export { isConfigured as isWhatsAppConfigured };
