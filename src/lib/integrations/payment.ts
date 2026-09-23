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
 * When STRIPE_SECRET_KEY is set, paid plan changes bypass this adapter
 * entirely and go through real Stripe Checkout / Customer Portal
 * (src/lib/integrations/stripe.ts, wired in /api/billing/change-plan);
 * this simulated path is only used while Stripe is unconfigured.
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
