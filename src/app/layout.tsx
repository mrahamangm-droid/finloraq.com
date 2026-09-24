import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  // Resolves every relative URL used in metadata (alternates.canonical,
  // openGraph.url/images, twitter.images, …) to an absolute
  // https://finloraq.com/... URL in the rendered tags. Without this, Next
  // renders those as bare relative paths (confirmed in production: <link
  // rel="canonical" href="/ai-accounting"/> and <meta property="og:url"
  // content="/ai-accounting"/> — both technically against spec and against
  // Google's own guidance to use absolute canonical URLs).
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Finloraq — AI Finance Operating System",
    template: "%s · Finloraq",
  },
  description:
    "Accounting, cash flow, tax, automation and financial intelligence in one intelligent platform.",
  // DEPLOYMENT.md's original plan (2026-09-22) was to keep the marketing
  // site on WordPress/Hostinger and use this Next.js app only for the
  // authenticated product at app.finloraq.com. That plan changed: the
  // marketing pages now live in this app too (src/app/page.tsx,
  // ai-accounting/, ai-cfo/, cash-flow-forecasting/, guides/,
  // how-it-works/), and finloraq.com itself now points at this Vercel
  // project (confirmed live 2026-09-24 — finloraq.com, www.finloraq.com
  // and app.finloraq.com are all "Valid Configuration" on the same
  // project). So `robots: { index: false, follow: false }` here is the
  // *default* for this whole app (the authenticated product, onboarding,
  // auth routes, etc. — everything that isn't a marketing page) — each
  // marketing page overrides it to indexable via buildMarketingMetadata()
  // (src/components/marketing/marketing-routes.ts). /robots.txt
  // (src/app/robots.ts, generated from MARKETING_ROUTES) backs this up
  // for crawlers that ignore per-page meta tags.
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
