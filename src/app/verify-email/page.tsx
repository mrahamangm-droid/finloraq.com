"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}

function VerifyEmail() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";
  const missing = !email || !token;
  const [state, setState] = useState<"working" | "done" | "failed">(missing ? "failed" : "working");
  const [message, setMessage] = useState<string | null>(missing ? "This confirmation link is incomplete." : null);

  useEffect(() => {
    if (missing) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setState("done");
        } else {
          setState("failed");
          setMessage(data.error ?? "This link is invalid or has expired.");
        }
      } catch {
        if (cancelled) return;
        setState("failed");
        setMessage("Couldn't reach the server. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, token, missing]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-card-foreground">Confirm your email</h1>
        {state === "working" && <p className="text-sm text-muted-foreground">Confirming your email address…</p>}
        {state === "done" && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">Your email address is confirmed. You can sign in now.</p>
            <Link href="/login" className="block w-full rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground">
              Continue to sign in
            </Link>
          </>
        )}
        {state === "failed" && (
          <>
            <p role="alert" className="mb-4 text-sm text-destructive">{message}</p>
            <Link href="/login" className="text-sm text-primary hover:underline">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
