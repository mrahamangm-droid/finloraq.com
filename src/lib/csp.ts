/**
 * Strict Content-Security-Policy for the authenticated app, applied per
 * request by src/middleware.ts. Scripts need this request's nonce
 * ('strict-dynamic' lets scripts Next.js loads from a nonced script run too),
 * so an injected inline <script> or on*= handler can't execute. Every other
 * directive matches the site-wide policy in next.config.mjs, which still
 * covers the static marketing pages (see the note there).
 */
export function appContentSecurityPolicy(nonce: string, isDev = process.env.NODE_ENV !== "production"): string {
  return [
    "default-src 'self'",
    // React dev tooling evaluates code at runtime; production never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self'",
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
