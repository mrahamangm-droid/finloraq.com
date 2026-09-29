/**
 * Startup environment checks, run once per server instance from
 * src/instrumentation.ts.
 *
 * `errors` are settings the app cannot run without — in a production server
 * they stop startup, so a misconfigured deploy fails at boot with a clear
 * message instead of on some user's first sign-in. `warnings` are half-done
 * or risky configurations that degrade a feature; they're logged, never fatal.
 * Values are never printed, only variable names.
 */
export interface EnvReport {
  errors: string[];
  warnings: string[];
}

type Env = Record<string, string | undefined>;

export function checkEnv(env: Env = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const set = (k: string) => typeof env[k] === "string" && env[k]!.trim() !== "";
  const isProd = env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production";

  if (!set("DATABASE_URL")) errors.push("DATABASE_URL is not set — the app has no database.");
  if (!set("NEXTAUTH_SECRET")) {
    errors.push("NEXTAUTH_SECRET is not set — sessions can't be signed. Generate one with `openssl rand -base64 32`.");
  } else if (env.NEXTAUTH_SECRET!.length < 32) {
    warnings.push("NEXTAUTH_SECRET is shorter than 32 characters; use `openssl rand -base64 32`.");
  }

  const pairs: [string, string, string][] = [
    ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "subscription changes made in Stripe will never sync back"],
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "the Google sign-in button stays hidden"],
    ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WhatsApp stays in simulated mode"],
  ];
  for (const [a, b, effect] of pairs) {
    if (set(a) !== set(b)) warnings.push(`${set(a) ? a : b} is set but ${set(a) ? b : a} isn't — ${effect}.`);
  }
  if (set("RESEND_API_KEY") && !set("EMAIL_FROM")) {
    warnings.push("RESEND_API_KEY is set without EMAIL_FROM — mail goes out from Resend's shared onboarding@resend.dev sender.");
  }

  const stripeKey = env.STRIPE_SECRET_KEY ?? "";
  if (stripeKey.startsWith("sk_live_") && !isProd) {
    warnings.push("STRIPE_SECRET_KEY is a LIVE key outside production — real cards can be charged from this environment.");
  }
  if (stripeKey.startsWith("sk_test_") && isProd) {
    warnings.push("STRIPE_SECRET_KEY is a test key in production — billing runs in Stripe test mode.");
  }

  if (isProd && !set("CRON_SECRET")) {
    warnings.push("CRON_SECRET is not set — /api/cron/* answers 501, so recurring invoices and payment reminders don't run.");
  }

  for (const k of ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]) {
    if (set(k) && !/^https:\/\/[^@\s]+@[^/\s]+\/\S+$/.test(env[k]!)) warnings.push(`${k} doesn't look like a Sentry DSN (https://<key>@<host>/<project>).`);
  }

  if (set("FIELD_ENCRYPTION_KEY") && Buffer.from(env.FIELD_ENCRYPTION_KEY!, "base64").length !== 32) {
    warnings.push("FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }

  return { errors, warnings };
}

/** Logs the report; throws in a production server when anything required is missing. */
export function validateEnvAtStartup(env: Env = process.env): EnvReport {
  const report = checkEnv(env);
  for (const w of report.warnings) console.warn(`[env] ${w}`);
  for (const e of report.errors) console.error(`[env] ${e}`);
  // `next build` also loads instrumentation; a build must not need runtime secrets.
  const isBuild = env.NEXT_PHASE === "phase-production-build";
  if (report.errors.length > 0 && env.NODE_ENV === "production" && !isBuild) {
    throw new Error(`Missing required environment configuration: ${report.errors.join(" ")}`);
  }
  return report;
}
