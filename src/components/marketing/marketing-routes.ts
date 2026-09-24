// Single source of truth for every PUBLIC, indexable marketing route in
// this app. app/sitemap.ts reads this to build the sitemap, and the
// marketing header/footer read it for internal navigation — so a new
// landing page only has to be added here once to show up in both places
// consistently, instead of drifting between three hand-maintained lists.
//
// `priority`/`changeFrequency` follow standard sitemap.xml semantics: the
// homepage is the most important, most frequently updated URL; flagship
// landing pages are next; hub/index pages are lowest. lastModified is set
// per-entry (not "now" at build time) so the sitemap reflects when a page's
// content actually changed, which is what sitemap freshness signals are
// supposed to mean.
export type MarketingRoute = {
  path: string;
  title: string;
  navLabel: string;
  description: string;
  lastModified: string; // ISO date — bump when the page's content changes
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
  /** Which footer column this route is linked from, if any. */
  footerGroup?: "product" | "solutions" | "resources";
};

export const MARKETING_ROUTES: MarketingRoute[] = [
  {
    path: "/",
    title: "Finloraq — AI Finance Operating System",
    navLabel: "Home",
    description:
      "Finloraq turns your financial data into clarity, predictions and controlled actions.",
    lastModified: "2026-09-24",
    changeFrequency: "weekly",
    priority: 1.0,
  },
  {
    path: "/how-it-works",
    title: "How Finloraq Works — From Any Document to Approved, Explained Books",
    navLabel: "How it works",
    description:
      "Drop an invoice, receipt, bank statement or email and watch Finloraq read it, draft the entry, check it and explain it — with a person approving before anything posts.",
    lastModified: "2026-09-24",
    changeFrequency: "monthly",
    priority: 0.8,
    footerGroup: "product",
  },
  {
    path: "/ai-accounting",
    title: "AI Accounting Software — Real Double-Entry Books, Explained by AI",
    navLabel: "AI Accounting",
    description:
      "AI accounting software that still keeps real double-entry books — see the difference between AI bolted onto a dashboard and AI built on an actual ledger.",
    lastModified: "2026-09-22",
    changeFrequency: "monthly",
    priority: 0.9,
    footerGroup: "product",
  },
  {
    path: "/ai-cfo",
    title: "AI CFO Software — Financial Intelligence Without Hiring One",
    navLabel: "AI CFO",
    description:
      "What an AI CFO agent actually does, what it can't do, and how it compares to hiring a fractional or full-time CFO.",
    lastModified: "2026-09-22",
    changeFrequency: "monthly",
    priority: 0.9,
    footerGroup: "solutions",
  },
  {
    path: "/cash-flow-forecasting",
    title: "Cash Flow Forecasting Software — See Cash Pressure Before It Hits",
    navLabel: "Cash Flow Forecasting",
    description:
      "How AI-driven cash flow forecasting works, why most forecasts are wrong within 30 days, and what a forecast needs to actually be useful.",
    lastModified: "2026-09-22",
    changeFrequency: "monthly",
    priority: 0.9,
    footerGroup: "product",
  },
  {
    path: "/guides",
    title: "Finance & Accounting Guides",
    navLabel: "Guides",
    description:
      "Practical guides on AI in accounting, cash flow, and running finance for a small or growing business.",
    lastModified: "2026-09-22",
    changeFrequency: "weekly",
    priority: 0.6,
    footerGroup: "resources",
  },
];

export function getMarketingRoute(path: string): MarketingRoute | undefined {
  return MARKETING_ROUTES.find((r) => r.path === path);
}

// Shared Metadata builder for every marketing page, so the og:image/
// twitter:image bug below can only exist in one place — not six.
//
// The bug: Next.js's per-segment `opengraph-image.tsx` file convention only
// auto-populates `openGraph.images` when a route (and its layouts) don't
// define their own `openGraph` object at all. The instant a page exports
// its own `openGraph: { title, description, url, type }` — as every one of
// these pages does, to get the right per-page title/description/canonical
// into the tag — that object *replaces* the inherited one instead of
// merging into it, and the auto-detected image silently disappears from
// that page's og:image (and, since Twitter falls back to og:image when
// twitter:image is absent, from its Twitter Card preview too). Confirmed
// in production: the homepage (whose metadata never sets `openGraph`) gets
// og:image for free; every other marketing page did not, until this
// builder started setting `images` explicitly everywhere.
//
// `metadataBase` (src/app/layout.tsx) resolves these relative URLs to
// absolute ones in the rendered tags, matching Google's preference for
// absolute canonical/og:url values.
const MARKETING_OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630 };

export function buildMarketingMetadata(
  route: MarketingRoute,
  overrides: { description?: string } = {}
): import("next").Metadata {
  const description = overrides.description ?? route.description;
  return {
    title: route.title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: route.path },
    openGraph: {
      title: route.title,
      description,
      url: route.path,
      type: "website",
      images: [{ ...MARKETING_OG_IMAGE, alt: route.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: route.title,
      description,
      images: [MARKETING_OG_IMAGE.url],
    },
  };
}
