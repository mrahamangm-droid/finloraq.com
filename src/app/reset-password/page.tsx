"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const missingLink = !email || !token;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-card-foreground">Set a new password</h1>
        <p className="mb-6 text-sm text-muted-foreground">{email || "Your account"}</p>

        {missingLink ? (
          <div className="space-y-4">
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This reset link is missing or incomplete. Request a new one.
            </p>
            <Link href="/forgot-password" className="block text-center text-sm text-primary hover:underline">
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            Password updated. Taking you to sign in…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-card-foreground">
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                At least 12 characters, with an uppercase letter, a lowercase letter, and a digit.
              </p>
            </div>
            <div>
              <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-card-foreground">
                Confirm new password
              </label>
              <input
                id="confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              {loading ? "Updating…" : "Update password"}
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
