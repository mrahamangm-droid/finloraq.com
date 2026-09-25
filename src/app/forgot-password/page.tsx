"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      // Same message whether or not the account exists — see the API
      // route's comment on why this never reveals account existence.
      setSent(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-card-foreground">Reset your password</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Enter the email on your account and we&apos;ll send you a link to reset your password.
        </p>

        {sent ? (
          <div className="space-y-4">
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              If that email has an account, we&apos;ve sent a link to reset the password. It expires in 1 hour.
            </p>
            <Link href="/login" className="block text-center text-sm text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
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
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>

            <Link href="/login" className="block text-center text-xs text-muted-foreground hover:underline">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
