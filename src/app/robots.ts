import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { MARKETING_ROUTES } from "@/components/marketing/marketing-routes";

// Next.js serves this from /robots.txt automatically, replacing what used
// to be a hand-maintained public/robots.txt. Generated from
// MARKETING_ROUTES — the same list app/sitemap.ts reads — so a route can
// never end up listed in the sitemap while blocked here, or allowed here
// without being in the sitemap. That drift isn't hypothetical: the old
// static robots.txt was missing an Allow line for /how-it-works after it
// was added to MARKETING_ROUTES (and therefore to the sitemap) — caught
// 2026-09-24. Google was seeing the page in sitemap.xml while robots.txt
// told it not to crawl it, a contradictory signal. Deriving both files
// from one list makes that specific bug structurally impossible.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        // Every path gets a trailing `$` (end-of-string anchor) — for "/"
        // that's what stops this from accidentally allowing every path
        // (every path starts with "/"), and for the rest it means a
        // future nested route (e.g. a real /guides/[slug]) doesn't
        // silently inherit an Allow it never asked for just because its
        // parent has one.
        ...MARKETING_ROUTES.map((route) => `${route.path}$`),
        "/sitemap.xml$",
        // The dynamically-rendered OG image route (no trailing `$`: it's
        // requested as /opengraph-image plus a Next-appended cache-busting
        // query string, which Allow needs to match as a prefix).
        "/opengraph-image",
        "/icon.png$",
        "/apple-icon.png$",
        // Static assets referenced from <head> that Google's Search
        // Console favicon/PWA reports expect to be fetchable, not just
        // served — they're public, non-sensitive files either way.
        "/favicon.ico$",
        "/manifest.json$",
      ],
      disallow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
