"use client";

import { useEffect } from "react";
import { captureException } from "@/lib/monitoring";

// Only catches errors thrown by the root layout itself (src/app/layout.tsx)
// — a much rarer case than error.tsx above, but Next.js requires this file
// to exist separately to handle it, and it must render its own <html>/
// <body> since it fully replaces the root layout when it activates. No
// Tailwind class names here on purpose (globals.css is imported by the
// layout that just failed), so this is plain inline styles as a last-resort
// fallback that can't depend on anything else having loaded.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { boundary: "global-error-boundary", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          textAlign: "center",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          background: "#F6F7FA",
          color: "#0E1526",
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#C0392B" }}>
          Something went wrong
        </p>
        <h1 style={{ marginTop: 12, fontSize: 22, fontWeight: 700 }}>Finloraq hit an unexpected error</h1>
        <p style={{ marginTop: 8, maxWidth: 360, fontSize: 14, color: "#4B5568" }}>
          We&apos;ve logged it on our end. Please try again in a moment.
          {error.digest ? ` Reference: ${error.digest}.` : ""}
        </p>
        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <button
            onClick={reset}
            style={{
              borderRadius: 6,
              background: "#4F46E5",
              color: "#fff",
              border: "none",
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <a
            href="mailto:support@finloraq.com"
            style={{
              borderRadius: 6,
              border: "1px solid #DFE3EB",
              background: "#fff",
              color: "#0E1526",
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Contact support
          </a>
        </div>
      </body>
    </html>
  );
}
