import { recordAuditEvent } from "@/lib/audit";
import type { PaymentAdapter, PaymentChargeResult } from "@/lib/integrations/types";

/**
 * Dev/simulated payment adapter — no Stripe (or other) secret key is
 * configured in this environment, so a plan upgrade never actually
 * charges anything. It still returns a shaped, auditable result
 * (live: false, a "SIMULATED-" reference) so the billing UI and the
 * Subscription row behave exactly as they would with a real provider —
 * only the "did money actually move" fact differs, and it's never hidden.
 *
 * TODO(production): implement a real adapter (Stripe Checkout/PaymentIntents
 * is the natural fit given `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are
 * already in .env.example) behind this same interface, selected by
 * isPaymentConfigured() the same way AiProvider/EInvoicingAdapter are.
 */
class DevPaymentAdapter implements PaymentAdapter {
  readonly provider = "dev-simulated";

  async charge(input: { amount: number; currency: string; description: string }): Promise<PaymentChargeResult> {
    const result: PaymentChargeResult = {
      live: false,
      reference: `SIMULATED-${Date.now()}`,
      status: "simulated",
    };

    await recordAuditEvent({
      action: "payment.charged_simulated",
      entityType: "Payment",
      entityId: result.reference,
      newValue: { amount: input.amount, currency: input.currency, description: input.description, live: false },
      source: "system",
    });

    return result;
  }
}

export function isPaymentConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cached: PaymentAdapter | null = null;
export function getPaymentAdapter(): PaymentAdapter {
  if (!cached) cached = new DevPaymentAdapter();
  return cached;
}
