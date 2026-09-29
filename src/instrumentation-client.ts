/**
 * Browser-side Sentry, only when NEXT_PUBLIC_SENTRY_DSN is set at build time.
 * The DSN is inlined by the bundler, so with it unset this whole branch is
 * dead code and @sentry/nextjs is never downloaded by the browser.
 * (The DSN's host is added to connect-src in src/lib/csp.ts and next.config.mjs.)
 */
import { SENTRY_DATA_COLLECTION } from "@/lib/sentryConfig";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0,
      // See src/lib/sentryConfig.ts: errors and stack traces only, no request data.
      dataCollection: SENTRY_DATA_COLLECTION,
    });
  });
}
