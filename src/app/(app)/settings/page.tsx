import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { getAiProvider } from "@/lib/ai/provider";
import { isWhatsAppConfigured } from "@/lib/integrations/whatsapp";
import { getEInvoicingAdapter } from "@/lib/integrations/einvoicing";
import { updateCompanySettingsAction } from "./actions";
import { MfaPanel } from "@/components/settings/mfa-panel";

function StatusBadge({ live, label }: { live: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        live
          ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400"
          : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-green-600" : "bg-amber-600"}`} />
      {label}
    </span>
  );
}

export default async function SettingsPage() {
  const { active } = await requireTenantContext();
  const canEdit = await can(active.id, "settings", "EDIT");

  const aiConfigured = getAiProvider() !== null;
  const whatsappConfigured = isWhatsAppConfigured();
  const einvoicingProvider = getEInvoicingAdapter().provider;
  const emailWebhookConfigured = Boolean(process.env.INBOUND_EMAIL_WEBHOOK_SECRET);

  const { company } = active;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Company profile and the live/simulated status of every external integration.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Company Profile
        </div>
        <form action={updateCompanySettingsAction} className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Company name</label>
            <input
              name="name"
              defaultValue={company.name}
              disabled={!canEdit}
              required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Legal name</label>
            <input
              name="legalName"
              defaultValue={company.legalName ?? ""}
              disabled={!canEdit}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Country</label>
            <input
              value={company.countryCode}
              disabled
              className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">Fixed after setup — drives the seeded tax pack.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Base currency</label>
            <input
              value={company.baseCurrency}
              disabled
              className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">Fixed after setup — changing it would invalidate historical reports.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Timezone</label>
            <input
              name="timezone"
              defaultValue={company.timezone}
              disabled={!canEdit}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Fiscal year end (month)</label>
            <input
              name="fiscalYearEnd"
              type="number"
              min={1}
              max={12}
              defaultValue={company.fiscalYearEnd}
              disabled={!canEdit}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Tax registration number (TRN)</label>
            <input
              name="taxRegNumber"
              defaultValue={company.taxRegNumber ?? ""}
              disabled={!canEdit}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
          {canEdit && (
            <div className="sm:col-span-2">
              <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Save changes
              </button>
            </div>
          )}
          {!canEdit && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Your role doesn&apos;t have permission to edit company settings.
            </p>
          )}
        </form>
      </div>

      <MfaPanel />

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Integrations
        </div>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">AI Copilot &amp; document extraction</div>
              <div className="text-xs text-muted-foreground">
                {aiConfigured
                  ? "ANTHROPIC_API_KEY is set — Copilot answers and receipt/invoice extraction use the live model."
                  : "No ANTHROPIC_API_KEY / OPENAI_API_KEY set — Copilot falls back to templated answers computed from your ledger; document extraction is unavailable."}
              </div>
            </div>
            <StatusBadge live={aiConfigured} label={aiConfigured ? "Live" : "Not configured"} />
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">Inbound email ingestion</div>
              <div className="text-xs text-muted-foreground">
                {emailWebhookConfigured
                  ? "INBOUND_EMAIL_WEBHOOK_SECRET is set — /api/webhooks/email will accept authenticated requests."
                  : "INBOUND_EMAIL_WEBHOOK_SECRET is not set — the inbound email webhook refuses every request until it is."}
              </div>
            </div>
            <StatusBadge live={emailWebhookConfigured} label={emailWebhookConfigured ? "Configured" : "Not configured"} />
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">WhatsApp Business</div>
              <div className="text-xs text-muted-foreground">
                {whatsappConfigured
                  ? "WhatsApp credentials are set — reminders and document links send via the live Business API."
                  : "No WhatsApp credentials set — outbound messages are logged and simulated (never silently dropped), and inbound media isn't wired up yet."}
              </div>
            </div>
            <StatusBadge live={whatsappConfigured} label={whatsappConfigured ? "Live" : "Simulated"} />
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">E-invoicing</div>
              <div className="text-xs text-muted-foreground">
                Provider: <span className="font-mono">{einvoicingProvider}</span> — no live e-invoicing
                service (e.g. UAE Peppol access point) is configured yet, so submissions are recorded
                and clearly marked as simulated rather than actually transmitted.
              </div>
            </div>
            <StatusBadge live={false} label="Simulated" />
          </div>
        </div>
      </div>
    </div>
  );
}
