import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/MarketingChrome";
import { MARKETING_BASE_STYLE } from "@/components/marketing/marketing-base-style";
import { BreadcrumbJsonLd, FaqJsonLd, type FaqItem } from "@/components/marketing/StructuredData";
import { getMarketingRoute, buildMarketingMetadata } from "@/components/marketing/marketing-routes";
import { PricingPlans } from "@/components/marketing/pricing/PricingPlans";

const route = getMarketingRoute("/pricing")!;

export const metadata: Metadata = buildMarketingMetadata(route);

// Pricing and FAQ used to sit on the homepage; they live here so the homepage
// can stay short. Old /#pricing and /#faq links are forwarded here by the
// homepage (see DashboardPreview).
const FAQ: FaqItem[] = [
  {
    question: "What is Finloraq?",
    answer:
      "AI-powered accounting and finance software: full double-entry accounting (ledger, P&L, balance sheet, receivables, payables, tax) with AI on top that explains what happened, why, and what to do next.",
  },
  {
    question: "Can AI change my accounting records?",
    answer: "No. AI recommends and drafts; a person approves before anything posts. Posted records stay immutable, and corrections are new, reversing entries.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Data is encrypted, isolated per company, and every change is captured in an audit trail. Admins and CFOs are asked to turn on multi-factor sign-in. We only publish compliance certifications once they're actually verified.",
  },
  {
    question: "Does Finloraq support UAE VAT?",
    answer: "Yes. The UAE VAT pack, including tax codes and readiness checks, is available today.",
  },
];

const PRICING_STYLE = `
  #fm-root .cur-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:28px 0}
  #fm-root .cur-pick{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:var(--ink-muted)}
  #fm-root .cur-pick select{font:inherit;font-size:14px;font-weight:700;color:var(--ink);background:var(--canvas);border:1px solid var(--line-strong);border-radius:var(--r-md);padding:9px 12px;min-height:44px;cursor:pointer}
  #fm-root .cur-note{margin:0;font-size:12.5px;color:var(--ink-muted)}
  #fm-root .cur-note a{text-decoration:underline}
  @media (max-width:560px){ #fm-root .cur-pick{width:100%;justify-content:space-between} #fm-root .cur-pick select{flex:1 1 0;min-width:0;max-width:260px} }
  #fm-root .swipe-hint{display:none;margin:0 0 10px;font-size:12.5px;font-weight:600;color:var(--ink-muted)}
  #fm-root .price-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
  @media (max-width:1100px){ #fm-root .price-grid{grid-template-columns:repeat(3,minmax(0,1fr))} }
  @media (max-width:700px){
    #fm-root .swipe-hint{display:block}
    #fm-root .price-grid{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;margin-inline:-16px;padding:4px 16px 14px;scroll-padding-inline:16px}
    #fm-root .price-grid > .plan{flex:0 0 min(80%,300px);scroll-snap-align:start}
  }
  #fm-root .plan{border:1px solid var(--line);border-radius:var(--r-lg);padding:20px;display:flex;flex-direction:column;gap:14px;background:var(--canvas)}
  #fm-root .plan.feat{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand)}
  #fm-root .plan .pname{font-weight:800;font-size:15px}
  #fm-root .plan .pprice{font-size:24px;font-weight:700;white-space:nowrap}
  #fm-root .plan .pprice small{font-family:var(--font-body);font-size:12px;font-weight:600;color:var(--ink-muted)}
  #fm-root .plan .pusd{font-size:12px;color:var(--ink-muted);margin-top:2px}
  #fm-root .plan ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--ink-muted);flex:1}
  #fm-root .sec-head p a{color:var(--brand);text-decoration:underline}
  #fm-root .faq{margin-top:28px;border-top:1px solid var(--line);max-width:820px}
  #fm-root .faq-item{border-bottom:1px solid var(--line)}
  #fm-root .faq-q{list-style:none;cursor:pointer;padding:18px 0;font-weight:700;font-size:15.5px;display:flex;justify-content:space-between;gap:16px}
  #fm-root .faq-q::-webkit-details-marker{display:none}
  #fm-root .faq-q::after{content:"+";color:var(--ink-subtle);font-weight:600}
  #fm-root .faq-item[open] .faq-q::after{content:"–"}
  #fm-root .faq-a{padding-bottom:18px;font-size:14.5px;color:var(--ink-muted);line-height:1.65;max-width:70ch}
`;

export default function PricingPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MARKETING_BASE_STYLE + PRICING_STYLE }} />
      <BreadcrumbJsonLd items={[{ name: "Home", path: "/" }, { name: "Pricing", path: route.path }]} />
      <FaqJsonLd items={FAQ} />

      <div id="fm-root">
        <MarketingHeader currentPath={route.path} />

        <main>
          <section className="canvas">
            <div className="wrap">
              <div className="sec-head">
                <div className="eyebrow">Pricing</div>
                <h1 style={{ marginTop: 10, fontSize: "clamp(30px,4.4vw,44px)", fontWeight: 800, letterSpacing: "-.02em" }}>
                  Simple plans that grow with you.
                </h1>
                <p>
                  Start free. Upgrade when you need more people, more AI or more automation. Billed monthly, cancel
                  anytime. Prices include VAT where it applies.
                </p>
              </div>
              <PricingPlans />
            </div>
          </section>

          <section className="canvas-2" id="faq">
            <div className="wrap">
              <div className="sec-head">
                <h2>Questions, answered plainly.</h2>
                <p>
                  More in our <Link href="/guides">guides</Link>, or email{" "}
                  <a href="mailto:support@finloraq.com">support@finloraq.com</a>.
                </p>
              </div>
              <div className="faq">
                {FAQ.map((f, i) => (
                  <details className="faq-item" key={f.question} open={i === 0}>
                    <summary className="faq-q">{f.question}</summary>
                    <div className="faq-a">{f.answer}</div>
                  </details>
                ))}
              </div>
            </div>
          </section>

          <section className="final-cta">
            <div className="wrap">
              <h2>Run your business with clarity.</h2>
              <div className="cta-row">
                <Link className="btn btn-primary" href="/register">
                  Start Free
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
