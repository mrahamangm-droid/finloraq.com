/**
 * Minimal error reporting used by the error boundaries (src/app/error.tsx,
 * global-error.tsx).
 *
 * Every error is logged with console.error(), which reaches the host's
 * runtime logs (Vercel: Project → Observability → Logs). On top of that,
 * optionally:
 *   - Sentry, when SENTRY_DSN (server) / NEXT_PUBLIC_SENTRY_DSN (browser) is
 *     set — @sentry/nextjs is imported lazily, only then, so with no DSN it
 *     costs nothing (initialised in src/instrumentation*.ts);
 *   - `MONITORING_WEBHOOK_URL` (server only), any endpoint that accepts a
 *     JSON POST, e.g. a Slack "Incoming Webhook", for a push notification.
 * Either one failing never breaks the error page itself.
 */

export interface ErrorContext {
  /** Where the error was caught, e.g. "app-error-boundary", "global-error-boundary". */
  boundary: string;
  /** The Next.js error digest, when present — matches the id shown to the user. */
  digest?: string;
  /** The path the error happened on, when known. */
  path?: string;
}

export function captureException(error: unknown, context: ErrorContext): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Always logged — this alone reaches Vercel's Runtime Logs / Runtime
  // Errors views for both server and edge execution.
  console.error(`[${context.boundary}]`, message, { digest: context.digest, path: context.path, stack });

  const sentryDsn = typeof window === "undefined" ? process.env.SENTRY_DSN : process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (sentryDsn) {
    void import("@sentry/nextjs")
      .then((Sentry) => Sentry.captureException(error, { tags: { boundary: context.boundary }, extra: { digest: context.digest, path: context.path } }))
      .catch(() => {});
  }

  const webhookUrl = process.env.MONITORING_WEBHOOK_URL;
  if (!webhookUrl) return;

  // Fire-and-forget — a broken webhook must never break the error page
  // itself or hold up the response.
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `:rotating_light: Finloraq error [${context.boundary}]${context.path ? ` at ${context.path}` : ""}: ${message}${
        context.digest ? ` (digest: ${context.digest})` : ""
      }`,
    }),
  }).catch(() => {
    // Reporting failure isn't itself reportable without risking a loop —
    // the console.error above already covers this case.
  });
}
