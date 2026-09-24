import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/MarketingChrome";
import { MARKETING_BASE_STYLE } from "@/components/marketing/marketing-base-style";
import { BreadcrumbJsonLd } from "@/components/marketing/StructuredData";
import { getMarketingRoute, buildMarketingMetadata } from "@/components/marketing/marketing-routes";

const route = getMarketingRoute("/guides")!;

export const metadata: Metadata = buildMarketingMetadata(route);

const LIVE_GUIDES = [
  {
    href: "/ai-accounting",
    title: "AI Accounting Software",
    description:
      "What actually separates AI accounting from a chat window bolted onto a dashboard, and why the difference matters.",
  },
  {
    href: "/ai-cfo",
    title: "AI CFO Software",
    description:
      "What an AI CFO agent can and can't replace, and where it actually fits next to a fractional or full-time hire.",
  },
  {
    href: "/cash-flow-forecasting",
    title: "Cash Flow Forecasting",
    description: "Why most forecasts go stale within weeks, and what keeps one actually useful.",
  },
];

// Real, named topics on the roadmap — shown honestly as "coming soon,"
// not as live pages with placeholder content. Publishing thin or empty
// pages for these instead (just to have more indexable URLs) is exactly
// the kind of thin-content pattern this project's own instructions rule
// out, so they stay off the sitemap and off search until there's a real
// guide behind each one.
const PLANNED_GUIDES = [
  "AI Finance for growing companies",
  "Accounting automation: what to automate first",
  "Invoicing that gets paid faster",
  "Managing business expenses without spreadsheets",
  "UAE VAT: a practical readiness guide",
  "Running finance for an SMB without a finance team",
];

export default function GuidesPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MARKETING_BASE_STYLE }} />
      <BreadcrumbJsonLd items={[{ name: "Home", path: "/" }, { name: "Guides", path: route.path }]} />

      <div id="fm-root">
        <MarketingHeader currentPath={route.path} />

        <section className="hero" style={{ paddingBlock: "56px 48px" }}>
          <div className="wrap">
            <div className="breadcrumb">
              <Link href="/">Home</Link> / Guides
            </div>
            <div className="eyebrow on-navy">Guides</div>
            <h1 style={{ marginTop: 14, fontSize: "clamp(30px,4.6vw,46px)" }}>
              Practical guides on AI, accounting and running finance.
            </h1>
            <p className="lead">
              No fluff, no vendor-speak — just how these things actually work and where Finloraq&apos;s
              approach fits in.
            </p>
          </div>
        </section>

        <section className="canvas">
          <div className="wrap">
            <div className="feature-grid">
              {LIVE_GUIDES.map((g) => (
                <Link key={g.href} href={g.href} className="feature-card" style={{ display: "block" }}>
                  <h3>{g.title}</h3>
                  <p>{g.description}</p>
                  <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: "var(--brand)" }}>
                    Read the guide →
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="canvas-2">
          <div className="wrap">
            <div className="sec-head">
              <div className="eyebrow">Coming soon</div>
              <h2 style={{ marginTop: 12 }}>More guides in progress.</h2>
              <p>These are on the roadmap — check back, or start with what&apos;s live above.</p>
            </div>
            <ul
              style={{
                marginTop: 28,
                listStyle: "none",
                padding: 0,
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "12px 24px",
              }}
            >
              {PLANNED_GUIDES.map((title) => (
                <li
                  key={title}
                  style={{
                    fontSize: 14.5,
                    color: "var(--ink-muted)",
                    padding: "14px 0",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  {title}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="final-cta">
          <div className="wrap">
            <h2>Skip the reading — try it on your own numbers.</h2>
            <p>No registration required to explore the live demo.</p>
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
