import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Route-level gate: unauthenticated users are bounced to /login before any
// server component under (dashboard) renders. This is a defense-in-depth
// layer, not the authorization boundary itself — every server action and
// API route still calls requirePermission()/requireTenantContext() because
// middleware alone can't express per-module, per-action RBAC.
export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
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
    // Protect all API routes except NextAuth's own and the inbound
    // webhooks (email/WhatsApp/Stripe) — those are unauthenticated
    // server-to-server callbacks with no user session to check; each one
    // verifies its own shared secret/signature instead (see
    // src/lib/integrations/email.ts, the WhatsApp/Stripe webhook routes).
    // Without this exclusion, withAuth would 401 every provider callback
    // before it ever reached that verification logic.
    "/api/((?!auth|webhooks).)*",
  ],
};
