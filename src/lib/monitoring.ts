/**
 * Minimal, dependency-free error reporting.
 *
 * Why not @sentry/nextjs directly: adding a new npm dependency here would
 * change package.json without an accurate package-lock.json to match (this
 * environment's npm registry access is policy-blocked, so `npm install`
 * can't regenerate the lockfile), and CI runs `npm ci`, which fails hard on
 * a lockfile mismatch. So this stays dependency-free today. It is not a
 * placeholder, though — every error already reaches Vercel's own Runtime
 * Logs (Project → Observability → Logs, or `vercel logs`) via the
 * console.error() call below, so nothing is silently swallowed in the
 * meantime. If/when @sentry/nextjs is added properly (`npm install` run
 * with real registry access, so the lockfile updates correctly), swap the
 * body of `captureException` for `Sentry.captureException(error, {extra:
 * context})` — every call site below stays the same.
 *
 * `MONITORING_WEBHOOK_URL` (optional, unset by default — see
 * .env.example) can point at any endpoint that accepts a JSON POST, e.g. a
 * Slack "Incoming Webhook" URL from an existing Slack workspace, so you get
 * a push notification the moment something breaks in production without
 * creating any new third-party account. If it's unset, this is a no-op
 * beyond the console.error.
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
