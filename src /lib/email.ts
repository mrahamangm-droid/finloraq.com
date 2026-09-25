import { recordAuditEvent } from "@/lib/audit";

/**
 * Outbound transactional email (password resets today; invitation emails
 * and payment reminders are natural next callers). Same dev/live selection
 * pattern as src/lib/ai/provider.ts's getAiProvider() and
 * src/lib/integrations/whatsapp.ts's getWhatsAppAdapter(): a live sender
 * when RESEND_API_KEY is set, a logging/no-op sender otherwise, so a
 * missing key fails loud (in the audit log and server logs) rather than
 * silently dropping mail or crashing the request that triggered it.
 *
 * Resend's plain HTTP API is used directly (a single fetch call) rather
 * than pulling in the resend npm package — same reasoning as
 * AnthropicProvider's raw fetch to api.anthropic.com: one dependency-free
 * call is simpler to audit than an SDK, and this project already has a
 * precedent (see src/lib/password.ts's hash-wasm note) of preferring
 * fewer native/heavy dependencies where a plain HTTP call will do.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendResult {
  live: boolean;
  id: string;
}

interface EmailSender {
  readonly provider: string;
  send(input: SendEmailInput): Promise<EmailSendResult>;
}

class DevEmailSender implements EmailSender {
  readonly provider = "dev-logged";

  async send(input: SendEmailInput): Promise<EmailSendResult> {
    const id = `LOGGED-${Date.now()}`;
    // No RESEND_API_KEY configured — log the email server-side (visible in
    // Vercel's function logs) instead of silently discarding it, so a
    // password-reset link is still reachable during setup/testing.
    console.log(`[email:dev] to=${input.to} subject=${JSON.stringify(input.subject)}\n${input.text}`);
    await recordAuditEvent({
      action: "email.logged_not_sent",
      entityType: "Email",
      entityId: id,
      newValue: { to: input.to, subject: input.subject },
      source: "system",
    });
    return { live: false, id };
  }
}

class ResendEmailSender implements EmailSender {
  readonly provider = "resend";

  constructor(private readonly apiKey: string, private readonly from: string) {}

  async send(input: SendEmailInput): Promise<EmailSendResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!res.ok || !data.id) {
      const reason = data.message ?? `HTTP ${res.status}`;
      await recordAuditEvent({
        action: "email.send_failed",
        entityType: "Email",
        entityId: `FAILED-${Date.now()}`,
        newValue: { to: input.to, subject: input.subject, reason },
        source: "system",
      });
      throw new Error(`Email send failed: ${reason}`);
    }

    await recordAuditEvent({
      action: "email.sent",
      entityType: "Email",
      entityId: data.id,
      newValue: { to: input.to, subject: input.subject },
      source: "system",
    });
    return { live: true, id: data.id };
  }
}

function isConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

let cached: EmailSender | null | undefined;

function getEmailSender(): EmailSender {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Finloraq <onboarding@resend.dev>";
  cached = apiKey ? new ResendEmailSender(apiKey, from) : new DevEmailSender();
  return cached;
}

export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  return getEmailSender().send(input);
}

export { isConfigured as isEmailConfigured };
