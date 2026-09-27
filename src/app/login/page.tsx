"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { GoogleButton } from "@/components/auth/google-button";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only ever redirect to a same-site relative path — never trust an
  // absolute/external URL from a query param (open-redirect prevention).
  const rawCallback = searchParams.get("callbackUrl");
  const callbackUrl = rawCallback && rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/start";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  // MFA is a second step in the same form, not a separate page: password
  // is verified first (server-side, in src/lib/auth.ts's authorize()),
  // and only once that succeeds does the server tell us a code is needed
  // — this state just reveals the field, it never itself decides whether
  // the password was right.
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  // Errors that come back via redirect (Google sign-in, NextAuth).
  const urlError = searchParams.get("error");
  const urlErrorMessage: string | null = urlError
    ? ({
        GoogleUnverified: "Your Google email address isn't verified, so we can't use it to sign you in.",
        AccountDisabled: "This account has been deactivated. Contact your administrator.",
        GoogleMfa: "This account uses two-step verification. Sign in with your email, password and authentication code.",
        GoogleFailed: "Google sign-in didn't complete. Please try again.",
      } as Record<string, string>)[urlError] ?? "Sign-in didn't complete. Please try again."
    : null;

  async function resendVerification() {
    setResent(false);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Same generic confirmation either way; the server never reveals more.
    }
    setResent(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setUnverified(false);
    setResent(false);

    const result = await signIn("credentials", {
      email,
      password,
      mfaToken: needsMfa ? mfaToken : undefined,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      if (result.error === "EMAIL_NOT_VERIFIED") {
        setUnverified(true);
        setError(null);
        return;
      }
      if (result.error === "MFA_REQUIRED") {
        setNeedsMfa(true);
        setError(null);
        return;
      }
      setError(needsMfa ? result.error : "Invalid email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-card-foreground">Sign in to Finloraq</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          The AI Finance Operating System for Modern Businesses
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-card-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              disabled={needsMfa}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary focus:ring-2 disabled:opacity-60"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-card-foreground">
                Password
              </label>
              {!needsMfa && (
                <a href="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </a>
              )}
            </div>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={needsMfa}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary focus:ring-2 disabled:opacity-60"
            />
          </div>

          {needsMfa && (
            <div>
              <label htmlFor="mfaToken" className="mb-1 block text-sm font-medium text-card-foreground">
                Authentication code
              </label>
              <input
                id="mfaToken"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                placeholder="123456 or a backup code"
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Enter the 6-digit code from your authenticator app, or a backup code.
              </p>
            </div>
          )}

          {(error ?? urlErrorMessage) && (
            <p role="alert" className="text-sm text-destructive">{error ?? urlErrorMessage}</p>
          )}

          {unverified && (
            <div role="alert" className="rounded-md border border-border bg-muted p-3 text-sm text-card-foreground">
              <p>Please confirm your email address first. We sent you a link when you signed up.</p>
              <button type="button" onClick={resendVerification} className="mt-2 text-primary hover:underline">
                Send a new confirmation link
              </button>
              {resent && <p className="mt-1 text-xs text-muted-foreground">If that account needs confirming, a new link is on its way.</p>}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {loading ? "Signing in…" : needsMfa ? "Verify" : "Sign in"}
          </button>

          {needsMfa && (
            <button
              type="button"
              onClick={() => { setNeedsMfa(false); setMfaToken(""); setError(null); }}
              className="w-full text-center text-xs text-muted-foreground hover:underline"
            >
              Use a different account
            </button>
          )}
        </form>
        {!needsMfa && (
          <>
            <GoogleButton callbackUrl={callbackUrl} />
            <p className="mt-6 text-center text-xs text-muted-foreground">
              New to Finloraq?{" "}
              <a href="/register" className="text-primary hover:underline">
                Create an account
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
