import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/MarketingChrome";
import { MARKETING_BASE_STYLE } from "@/components/marketing/marketing-base-style";
import { BreadcrumbJsonLd } from "@/components/marketing/StructuredData";
import { getMarketingRoute, buildMarketingMetadata } from "@/components/marketing/marketing-routes";
import { HowFinloraqWorks } from "@/components/marketing/how-it-works/HowFinloraqWorks";

const route = getMarketingRoute("/how-it-works")!;

export const metadata: Metadata = buildMarketingMetadata(route);

// The interactive 3D walkthrough that used to sit under the homepage hero.
// It has its own page so the homepage stays short for first-time visitors,
// while anyone who wants the full story gets it here.
export default function HowItWorksPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MARKETING_BASE_STYLE }} />
      <BreadcrumbJsonLd items={[{ name: "Home", path: "/" }, { name: "How it works", path: route.path }]} />

      <div id="fm-root">
        <MarketingHeader currentPath={route.path} />

        <HowFinloraqWorks />

        <section className="final-cta">
          <div className="wrap">
            <h2>Try it on your own books.</h2>
            <p>Start free, or click through the live demo first. No registration needed for the demo.</p>
            <div className="cta-row">
              <Link className="btn btn-primary" href="/register">
                Start Free
              </Link>
              <Link className="btn btn-ghost on-navy" href="/#demo">
                Explore the Demo
              </Link>
            </div>
          </div>
        </section>

        <MarketingFooter />
      </div>
    </>
  );
}
