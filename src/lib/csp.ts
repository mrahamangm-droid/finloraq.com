/**
 * Strict Content-Security-Policy for the authenticated app, applied per
 * request by src/middleware.ts. Scripts need this request's nonce
 * ('strict-dynamic' lets scripts Next.js loads from a nonced script run too),
 * so an injected inline <script> or on*= handler can't execute. Every other
 * directive matches the site-wide policy in next.config.mjs, which still
 * covers the static marketing pages (see the note there).
 */
/**
 * Origin the browser sends Sentry events to, from NEXT_PUBLIC_SENTRY_DSN
 * (https://<key>@o123.ingest.sentry.io/456 → https://o123.ingest.sentry.io).
 * Null when unset or malformed, so connect-src stays 'self' only.
 */
export function sentryConnectOrigin(dsn = process.env.NEXT_PUBLIC_SENTRY_DSN): string | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function appContentSecurityPolicy(nonce: string, isDev = process.env.NODE_ENV !== "production"): string {
  const sentry = sentryConnectOrigin();
  return [
    "default-src 'self'",
    // React dev tooling evaluates code at runtime; production never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self'${sentry ? ` ${sentry}` : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
