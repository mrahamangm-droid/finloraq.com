import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import type { EInvoicingAdapter, EInvoiceSubmissionResult } from "@/lib/integrations/types";

/**
 * Dev/simulated e-invoicing adapter — the UAE's FTA e-invoicing mandate
 * (and equivalents elsewhere) require registering with an accredited
 * service provider, which isn't configured in this environment. Rather
 * than pretending to file, this returns a clearly-marked simulated result
 * and audit-logs it as such, so nobody downstream (a report, a customer
 * communication) can mistake it for a real regulatory filing.
 *
 * TODO(production): implement a real adapter (e.g. a UAE-accredited
 * Peppol access point) behind this same interface, selected by
 * `EINVOICING_PROVIDER` env var, the same pattern as AiProvider.
 */
class DevEInvoicingAdapter implements EInvoicingAdapter {
  readonly provider = "dev-simulated";

  async submitInvoice(input: { invoiceId: string; companyId: string }): Promise<EInvoiceSubmissionResult> {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { id: input.invoiceId, companyId: input.companyId },
    });
    if (invoice.status === "DRAFT") {
      throw new Error("Only a posted (sent) invoice can be submitted for e-invoicing.");
    }

    const result: EInvoiceSubmissionResult = {
      live: false,
      referenceNumber: `SIMULATED-${invoice.invoiceNumber}`,
      submittedAt: new Date(),
      provider: this.provider,
    };

    await recordAuditEvent({
      companyId: input.companyId,
      action: "einvoice.submitted_simulated",
      entityType: "Invoice",
      entityId: invoice.id,
      newValue: { referenceNumber: result.referenceNumber, live: false },
      source: "system",
    });

    return result;
  }
}

let cached: EInvoicingAdapter | null = null;

export function getEInvoicingAdapter(): EInvoicingAdapter {
  if (!cached) cached = new DevEInvoicingAdapter();
  return cached;
}
