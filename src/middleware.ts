import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Route-level gate: unauthenticated users are bounced to /login before any
// server component under (dashboard) renders. This is a defense-in-depth
// layer, not the authorization boundary itself — every server action and
// API route still calls requirePermission()/requireTenantContext() because
// middleware alone can't express per-module, per-action RBAC.
export default withAuth(
  function middleware(req) {
    // API requests without a session get a machine-readable 401 instead of
    // an HTML redirect to /login, which a fetch() caller can't act on.
    if (req.nextUrl.pathname.startsWith("/api/") && !req.nextauth.token) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      // Let unauthenticated API requests through to the function above so
      // it can answer 401; page routes still bounce to the sign-in page.
      authorized: ({ req, token }) => req.nextUrl.pathname.startsWith("/api/") || !!token,
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
    "/users/:path*",
    "/settings/:path*",
    "/audit/:path*",
    "/ai-copilot/:path*",
    "/billing/:path*",
    "/onboarding/:path*",
    // Protect all API routes except NextAuth's own and the inbound
    // webhooks (email/WhatsApp/Stripe) — those are unauthenticated
    // server-to-server callbacks with no user session to check; each one
    // verifies its own shared secret/signature instead (see
    // src/lib/integrations/email.ts, the WhatsApp/Stripe webhook routes).
    // Without this exclusion, withAuth would 401 every provider callback
    // before it ever reached that verification logic. /api/register is
    // excluded too: it's how a signed-out visitor creates an account.
    //
    // The previous pattern, "/api/((?!auth|webhooks).)*", never matched in
    // production (unauthenticated calls reached the route handlers), so
    // this uses the lookahead form from the Next.js matcher docs instead.
    "/api/((?!auth|webhooks|register).*)",
  ],
};
