// Browser Sentry events go to the DSN's origin; allowed in connect-src only
// when NEXT_PUBLIC_SENTRY_DSN is set (same rule as src/lib/csp.ts).
const sentryOrigin = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SENTRY_DSN ?? "");
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Next's default Server Action body limit is 1MB, too small for the
    // member-file uploads on Users & Roles (src/lib/memberFiles.ts caps
    // the actual file at 5MB) — raised to give multipart/other-field
    // overhead some room above that 5MB cap.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  // argon2 (native binary) was removed in favor of hash-wasm (WASM,
  // no native build) — see src/lib/password.ts. @prisma/client stays
  // external since it loads its query engine binary at runtime.
  // (Next 15 promoted this out of `experimental` as serverExternalPackages.)
  serverExternalPackages: ["@prisma/client"],
  // One public address. Once CANONICAL_HOST is set in Vercel (e.g.
  // "finloraq.com", only after that domain is live), visits to the old
  // finloraq-app.vercel.app address are sent there permanently. Stripe keeps
  // posting to /api/webhooks/* on the old host, so those are never redirected.
  async redirects() {
    const canonical = process.env.CANONICAL_HOST;
    if (!canonical) return [];
    return [
      {
        source: "/:path((?!api/webhooks/).*)",
        has: [{ type: "host", value: "finloraq-app.vercel.app" }],
        destination: `https://${canonical}/:path`,
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // The service worker script itself must never be served from a
        // stale CDN/browser cache — that's the classic "my PWA update
        // never reaches users" bug. `no-cache` forces a revalidation
        // request every time the browser checks for an update, so a new
        // deploy's sw.js is picked up promptly instead of being stuck
        // behind whatever cache lifetime Vercel would otherwise apply to
        // a static file under public/.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Only takes effect over HTTPS (which Vercel terminates by
          // default) — preload is opt-in on hstspreload.org once the
          // domain is confirmed to always serve HTTPS; not submitted here.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        // Site-wide CSP for everything EXCEPT the signed-in app pages, which
        // get a stricter per-request nonce policy from src/middleware.ts
        // (src/lib/csp.ts) instead. The marketing/auth pages here stay
        // statically prerendered — a nonce would force every one of them to
        // render per request — so they keep 'unsafe-inline' for Next.js's
        // inline hydration script. Prefix list = the middleware matcher's.
        source: "/:path((?!(?:dashboard|accounting|sales|purchases|expenses|banking|customers|suppliers|projects|taxes|reports|documents|import|users|settings|audit|ai-copilot|billing|approvals|credit-notes|crm|inventory|products|purchase-orders|quotes|recurring-invoices|sales-orders)(?:/|$)).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob:",
              "font-src 'self' data: https://fonts.gstatic.com",
              `connect-src 'self'${sentryOrigin ? ` ${sentryOrigin}` : ""}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
