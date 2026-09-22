import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Finloraq — AI Finance Operating System",
    template: "%s · Finloraq",
  },
  description:
    "Accounting, cash flow, tax, automation and financial intelligence in one intelligent platform.",
  // This app is the authenticated product itself (app.finloraq.com), not
  // the marketing site — finloraq.com stays on WordPress/Hostinger and is
  // the thing that should actually rank. Every page here is behind login
  // or exists only to route into one, so there's nothing here for a
  // search engine to usefully index; robots.txt (public/robots.txt)
  // backs this up for crawlers that ignore per-page meta tags.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
