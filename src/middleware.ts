import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { appContentSecurityPolicy, generateNonce } from "@/lib/csp";

// Route-level gate: unauthenticated users are bounced to /login before any
// server component under (dashboard) renders. This is a defense-in-depth
// layer, not the authorization boundary itself — every server action and
// API route still calls requirePermission()/requireTenantContext() because
// middleware alone can't express per-module, per-action RBAC.
export default withAuth(
  function middleware(req) {
    // API callers get a JSON 401 instead of an HTML redirect to /login.
    if (req.nextUrl.pathname.startsWith("/api/") && !req.nextauth.token) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

    // App pages get a per-request nonce CSP (src/lib/csp.ts). Setting it on
    // the request is what lets Next.js stamp the nonce onto its own scripts;
    // setting it on the response is what the browser enforces.
    const nonce = generateNonce();
    const csp = appContentSecurityPolicy(nonce);
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
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
    // NB: the lookahead must sit in front of `.*` — the previous form
    // "/api/((?!auth|webhooks|public).)*" compiled to single-character
    // segments and never matched real paths like /api/billing/subscription.
    "/api/((?!auth/|auth$|webhooks/|public/|pay/).*)",
  ],
};
