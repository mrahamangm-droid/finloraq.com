import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";

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
  // src/app/icon.png and src/app/apple-icon.png already auto-generate the
  // matching <link> tags via Next's file-based icon convention — this is
  // just explicit about it, and adds the legacy public/favicon.ico for
  // browsers/bookmark managers that request /favicon.ico directly instead
  // of reading <head>.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.json",
  // Installable-PWA meta for iOS Safari, which doesn't read the web
  // manifest for install behavior the way Chromium/Edge/Android do —
  // it needs these tags to open "Add to Home Screen" as a standalone app
  // (no browser chrome) instead of just a bookmark.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Finloraq",
  },
};

export const viewport: Viewport = {
  themeColor: "#5048E5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
