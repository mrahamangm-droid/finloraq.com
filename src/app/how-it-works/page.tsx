import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/MarketingChrome";
import { MARKETING_BASE_STYLE } from "@/components/marketing/marketing-base-style";
import { BreadcrumbJsonLd } from "@/components/marketing/StructuredData";
import { getMarketingRoute, buildMarketingMetadata } from "@/components/marketing/marketing-routes";
import { HowItWorksFlow } from "@/components/marketing/home/HowItWorksFlow";
import { HOME_STYLE } from "@/components/marketing/home/home-style";

const route = getMarketingRoute("/how-it-works")!;

export const metadata: Metadata = buildMarketingMetadata(route);

const STEPS = [
  {
    title: "Upload anything",
    body: "Photos, PDFs, invoices, receipts, spreadsheets and CSV exports. No templates and no sorting first.",
  },
  {
    title: "Finloraq AI reads it",
    body: "It reads the document, works out what it is, checks the numbers add up, and picks the right accounts and tax codes.",
  },
  {
    title: "It becomes a proper record",
    body: "The draft lands in the right place: a sale, a purchase, an expense or a bank line. Once you approve it, it posts as balanced double-entry and can't be edited afterwards, only reversed.",
  },
  {
    title: "Intelligence updates",
    body: "Every posted record feeds Business Pulse and the 30/60/90-day cash forecast, so what you see is always your real books.",
  },
  {
    title: "You act on it",
    body: "Finloraq points out what needs attention, like an overdue invoice, a cost that jumped or a cash dip ahead, and drafts the next step for you to approve.",
  },
];

// A plain walkthrough of the pipeline, built on the same 2D flow as the
// homepage. The old WebGL scene that lived here was removed for speed.
export default function HowItWorksPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MARKETING_BASE_STYLE + HOME_STYLE }} />
      <BreadcrumbJsonLd items={[{ name: "Home", path: "/" }, { name: "How it works", path: route.path }]} />

      <div id="fm-root">
        <MarketingHeader currentPath={route.path} />

        <main>
          <section className="canvas-2">
            <div className="wrap">
              <div className="sec-head center">
                <div className="eyebrow">How it works</div>
                <h1 style={{ marginTop: 10, fontSize: "clamp(30px,4.6vw,46px)", fontWeight: 800, letterSpacing: "-.02em" }}>
                  From any document to a decision.
                </h1>
                <p>
                  Finloraq reads what you upload, records it as real double-entry accounting once you approve it, and
                  turns your books into answers.
                </p>
              </div>
              <HowItWorksFlow />
            </div>
          </section>

          <section className="canvas">
            <div className="wrap" style={{ maxWidth: 820 }}>
              <div className="sec-head">
                <h2>Step by step</h2>
                <p>A person stays in control: AI drafts, you approve, and only then does anything post.</p>
              </div>
              <div className="step-list">
                {STEPS.map((s, i) => (
                  <div className="step" key={s.title}>
                    <div className="n">{i + 1}</div>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="final-cta">
            <div className="wrap">
              <h2>Try it on your own books.</h2>
              <p>Start free, or click through the live demo first. No registration needed for the demo.</p>
              <div className="cta-row">
                <Link className="btn btn-primary" href="/register">
                  Start Free
                </Link>
                <Link className="btn btn-ghost on-navy" href="/#demo">
                  Explore Demo
                </Link>
              </div>
            </div>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
