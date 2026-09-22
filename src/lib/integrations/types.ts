/**
 * Adapter interfaces for external services the spec names (section 25):
 * Tax/E-invoicing, Payment, Banking, Identity, AI providers. AI already
 * has its own abstraction (src/lib/ai/provider.ts) since Phase 6; this
 * file covers the rest.
 *
 * Every adapter here follows the same rule (spec section 28): when the
 * real external service isn't configured, the "dev" implementation is
 * NOT a silent no-op that pretends to succeed — it does the safe,
 * observable equivalent (writes an audit event, returns a value clearly
 * marked as simulated) so nothing downstream can mistake a dev run for a
 * live filing, payment, or message actually reaching a third party.
 */

export interface EInvoiceSubmissionResult {
  /** true only when a real e-invoicing provider actually accepted the
   *  document; false for the dev/simulated path. */
  live: boolean;
  referenceNumber: string;
  submittedAt: Date;
  provider: string;
}

export interface EInvoicingAdapter {
  readonly provider: string;
  submitInvoice(input: { invoiceId: string; companyId: string }): Promise<EInvoiceSubmissionResult>;
}

export interface PaymentChargeResult {
  live: boolean;
  reference: string;
  status: "succeeded" | "simulated";
}

export interface PaymentAdapter {
  readonly provider: string;
  charge(input: { amount: number; currency: string; description: string }): Promise<PaymentChargeResult>;
}

export interface WhatsAppSendResult {
  live: boolean;
  messageId: string;
}

export interface WhatsAppAdapter {
  readonly provider: string;
  sendDocumentLink(input: { toPhoneNumber: string; documentUrl: string; caption: string }): Promise<WhatsAppSendResult>;
  sendPaymentReminder(input: { toPhoneNumber: string; invoiceNumber: string; amount: number; currency: string }): Promise<WhatsAppSendResult>;
}
