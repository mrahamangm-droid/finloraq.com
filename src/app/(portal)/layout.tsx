import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: { default: "Customer Portal", template: "%s — Customer Portal" },
};

/**
 * Minimal layout for the public customer portal — no app sidebar, no auth
 * session. The portal token in the URL IS the credential.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
