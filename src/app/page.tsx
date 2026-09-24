import type { Metadata } from "next";
import { MarketingHomePage } from "@/components/marketing/MarketingHomePage";
import { getMarketingRoute, buildMarketingMetadata } from "@/components/marketing/marketing-routes";

const route = getMarketingRoute("/")!;

// This route ("/") is the public marketing homepage — the one page in
// this app that's meant to be found and indexed. Everything else here
// stays behind login and stays noindex (see the root layout's metadata).
// The root layout sets `robots: { index: false, follow: false }` for
// the whole app; buildMarketingMetadata() overrides that to
// `{ index: true, follow: true }` for this route only — Next.js merges
// page metadata over layout metadata per field, so this object replaces
// the layout's `robots` value on this route without touching any other
// route. Uses buildMarketingMetadata() like every other marketing page
// (so it gets a real og:image/twitter:image and an absolute canonical —
// see that function's comment for the bug this fixes), but keeps its own
// longer, CTA-driven description instead of the shorter one used in the
// sitemap/nav (MARKETING_ROUTES's description is what shows in search
// results snippets less reliably than this one, which is written for
// social/search click-through specifically).
export const metadata: Metadata = buildMarketingMetadata(route, {
  description:
    "Finloraq turns your financial data into clarity, predictions and controlled actions — real double-entry accounting plus AI that explains what happened, why, and what to do next. Try the live demo, no registration required.",
});

export default function RootPage() {
  return <MarketingHomePage />;
}
