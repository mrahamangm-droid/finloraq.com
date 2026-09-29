/**
 * Runs once when each server instance starts (Node and Edge runtimes).
 *
 * 1. Environment validation (src/lib/env.ts) — fail fast on a deploy that's
 *    missing DATABASE_URL / NEXTAUTH_SECRET, and log half-configured
 *    integrations.
 * 2. Sentry, only when SENTRY_DSN is set. Unset, @sentry/nextjs is never
 *    even imported, so the app behaves exactly as before; every error is
 *    still logged to the host's runtime logs (src/lib/monitoring.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnvAtStartup } = await import("@/lib/env");
    validateEnvAtStartup();
  }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const [Sentry, { SENTRY_DATA_COLLECTION }] = await Promise.all([import("@sentry/nextjs"), import("@/lib/sentryConfig")]);
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Errors only by default; opt in to performance tracing explicitly.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // See src/lib/sentryConfig.ts: errors and stack traces only, no request data.
    dataCollection: SENTRY_DATA_COLLECTION,
  });
}

/** Errors thrown by server components, route handlers and server actions. */
export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
