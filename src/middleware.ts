/**
 * Next.js edge middleware.
 *
 * Two responsibilities:
 *   1. Authentication gate (withAuth) — unauthenticated traffic is redirected
 *      to /login before any server component under the protected segments runs.
 *   2. Security headers — every response gets a nonce-based Content-Security-
 *      Policy plus the standard hardening headers (X-Frame-Options, etc.).
 *
 * The nonce is forwarded to the RSC pipeline via the `x-nonce` request header
 * so Next.js can nonce its own injected hydration scripts, and so the root
 * layout (<RootLayout>) can read it from `headers()` and pass it to any
 * inline Script elements.
 */

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { appContentSecurityPolicy, generateNonce } from "@/lib/csp";

export default withAuth(
  function middleware(req) {
    // Generate a fresh nonce for this request (via csp.ts).
    const nonce = generateNonce();
    const csp = appContentSecurityPolicy(nonce);

    // Clone the request headers and thread the nonce in.
    // Next.js 13.4+ reads `x-nonce` from the request headers and applies
    // it to its own injected RSC/hydration <script> tags automatically.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);

    // API callers get a JSON 401 instead of an HTML redirect to /login.
    if (req.nextUrl.pathname.startsWith("/api/") && !req.nextauth.token) {
      const res = NextResponse.json({ error: "Not signed in." }, { status: 401 });
      res.headers.set("Content-Security-Policy", csp);
      return res;
    }
    if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

    // App pages get a per-request nonce CSP (src/lib/csp.ts). Setting it on
    // the request is what lets Next.js stamp the nonce onto its own scripts;
    // setting it on the response is what the browser enforces.
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  },
  {
    callbacks: {
      // Pages: redirect to /login when there's no session. API routes are let
      // through here so the middleware function above can answer with a 401.
      authorized: ({ token, req }) => req.nextUrl.pathname.startsWith("/api/") || !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/accounting/:path*",
    "/sales/:path*",
    "/purchases/:path*",
    "/expenses/:path*",
    "/banking/:path*",
    "/customers/:path*",
    "/suppliers/:path*",
    "/projects/:path*",
    "/taxes/:path*",
    "/reports/:path*",
    "/documents/:path*",
    "/import/:path*",
    "/users/:path*",
    "/settings/:path*",
    "/audit/:path*",
    "/ai-copilot/:path*",
    "/billing/:path*",
    // Protect all API routes except NextAuth's own and the inbound
    // webhooks (email/WhatsApp/Stripe) — those are unauthenticated
    // server-to-server callbacks with no user session to check; each one
    // verifies its own shared secret/signature instead (see
    // src/lib/integrations/email.ts, the WhatsApp/Stripe webhook routes).
    // Without this exclusion, withAuth would 401 every provider callback
    // before it ever reached that verification logic.
    // /api/public/* is public by design (pricing/currency context for the
    // marketing site — no user data).
    // /api/pay/* is the public "Pay now" checkout for invoice links —
    // protected by its unguessable token instead of a session.
    // /api/cron/* is invoked by the scheduler (Vercel Cron), which has no
    // user session — each route verifies its own CRON_SECRET bearer token
    // instead (see src/app/api/cron/*/route.ts). Without this exclusion,
    // withAuth would 401 every cron invocation before it ever reached that
    // check.
    // NB: the lookahead must sit in front of `.*` — the previous form
    // "/api/((?!auth|webhooks|public).)*" compiled to single-character
    // segments and never matched real paths like /api/billing/subscription.
    "/api/((?!auth/|auth$|webhooks/|public/|pay/|cron/).*)",
  ],
};
