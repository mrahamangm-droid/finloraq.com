"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureException } from "@/lib/monitoring";

// Catches any error thrown while rendering below the root layout — across
// both marketing pages and the authenticated (app) routes, since neither
// defines a more specific error.tsx of its own. Must be a Client Component
// (Next.js requirement for error.tsx) and uses the global Tailwind tokens
// rather than the #fm-root-scoped marketing CSS, since it can render
// without that page's own <style> tag ever having mounted.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    captureException(error, { boundary: "app-error-boundary", digest: error.digest, path: pathname });
  }, [error, pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-destructive">Something went wrong</p>
      <h1 className="mt-3 text-2xl font-semibold text-foreground">This page hit an error</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        We&apos;ve logged it on our end. Nothing in your account was affected by this.
        {error.digest ? ` Reference: ${error.digest}.` : ""}
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
        <a
          href="mailto:support@finloraq.com"
          className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
