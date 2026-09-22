import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { MARKETING_ROUTES } from "@/components/marketing/marketing-routes";

// Next.js serves this from /sitemap.xml automatically. It's generated from
// MARKETING_ROUTES — the same list the header/footer nav reads — so it can
// only ever list real, indexable public pages: there's no separate
// hand-maintained URL list to drift out of sync or accidentally list a
// noindex/authenticated route.
export default function sitemap(): MetadataRoute.Sitemap {
  return MARKETING_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: route.lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
