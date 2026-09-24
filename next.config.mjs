/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // argon2 (native binary) was removed in favor of hash-wasm (WASM,
    // no native build) — see src/lib/password.ts. @prisma/client stays
    // external since it loads its query engine binary at runtime.
    serverComponentsExternalPackages: ["@prisma/client"],
  },
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
          // Deliberately not nonce-based yet — Next.js's own inline
          // hydration script needs 'unsafe-inline' without one, and
          // wiring a per-request nonce through the App Router is a
          // real follow-up (Next supports it via middleware), not
          // something to fake here. This still meaningfully narrows
          // where scripts/styles/connections can come from vs. no CSP
          // at all, and blocks this app from ever being framed.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self'",
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
