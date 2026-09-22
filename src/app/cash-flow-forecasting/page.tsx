import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/MarketingChrome";
import { MARKETING_BASE_STYLE } from "@/components/marketing/marketing-base-style";
import {
  SoftwareApplicationJsonLd,
  FaqJsonLd,
  BreadcrumbJsonLd,
  type FaqItem,
} from "@/components/marketing/StructuredData";
import { getMarketingRoute } from "@/components/marketing/marketing-routes";

const route = getMarketingRoute("/cash-flow-forecasting")!;

export const metadata: Metadata = {
  title: route.title,
  description: route.description,
  robots: { index: true, follow: true },
  alternates: { canonical: route.path },
  openGraph: {
    title: route.title,
    description: route.description,
    url: route.path,
    type: "website",
  },
  twitter: { title: route.title, description: route.description },
};

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Why do most cash flow forecasts turn out wrong?",
    answer:
      "Usually because they're built once, off a spreadsheet, from assumptions that go stale the moment a customer pays late or a cost changes. A forecast that isn't reconnected to your actual ledger as new transactions post is a snapshot of the day it was made — not a living picture of where cash is headed.",
  },
  {
    question: "What does Finloraq's cash flow forecasting actually use as inputs?",
    answer:
      "The same real, posted accounting data as the rest of the platform — invoices, bills, payment timing patterns and account balances — not a separate spreadsheet you have to keep updating by hand. Because it's connected to the ledger, the forecast moves when your books do.",
  },
  {
    question: "What's the difference between forecasting and the What-If Simulator?",
    answer:
      "Forecasting projects where cash is likely headed based on what's already in your books. The What-If Simulator lets you test a hypothetical on top of that — a sales change, a new hire, slower customer payments — and see the projected cash, profit and runway impact before it happens, without changing any actual record.",
  },
  {
    question: "Can cash flow forecasting predict a real crisis before it happens?",
    answer:
      "It can surface pressure earlier than a bank balance alone would — a pattern of slowing receivables, a concentration of payables due the same week, a cost trend outpacing revenue. No forecast eliminates uncertainty, but seeing pressure building weeks out is what turns a crisis into a decision you had time to make.",
  },
];

export default function CashFlowForecastingPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MARKETING_BASE_STYLE }} />
      <SoftwareApplicationJsonLd
        name="Finloraq Cash Flow Forecasting"
        description={route.description}
        url={route.path}
        category="FinanceApplication"
      />
      <BreadcrumbJsonLd
        items={[{ name: "Home", path: "/" }, { name: "Cash Flow Forecasting", path: route.path }]}
      />
      <FaqJsonLd items={FAQ_ITEMS} />

      <div id="fm-root">
        <MarketingHeader currentPath={route.path} />

        <section className="hero">
          <div className="wrap">
            <div className="breadcrumb">
              <Link href="/">Home</Link> / Cash Flow Forecasting
            </div>
            <div className="eyebrow on-navy">Cash Flow Forecasting Software</div>
            <h1 style={{ marginTop: 14 }}>
              See cash pressure <span>before it hits.</span>
            </h1>
            <p className="lead">
              A forecast built once and left in a spreadsheet is out of date the day a customer
              pays late. Finloraq&apos;s forecasting stays connected to your real ledger, so it moves
              when your books do — and the What-If Simulator lets you test a scenario before you
              commit to it.
            </p>
            <div className="cta-row">
              <Link className="btn btn-primary" href="/register">
                Start Free
              </Link>
              <Link className="btn btn-ghost on-navy" href="/#whatif-full">
                Try the What-If Simulator
              </Link>
            </div>
          </div>
        </section>

        <section className="canvas">
          <div className="wrap">
            <div className="sec-head center">
              <div className="eyebrow">Why forecasts go stale</div>
              <h2 style={{ marginTop: 12 }}>A spreadsheet forecast is a photograph. Cash flow is a video.</h2>
              <p>
                The moment a forecast is disconnected from the ledger that produced it, every new
                invoice, late payment or unexpected bill makes it slightly more wrong. Reconnecting
                the forecast to live, posted data is what keeps it useful past week one.
              </p>
            </div>
            <div className="feature-grid">
              <div className="feature-card">
                <div className="glyph">01</div>
                <h3>Built from real transactions</h3>
                <p>
                  Invoices, bills and payment timing patterns feed the forecast directly — not a
                  manually maintained spreadsheet that drifts from reality.
                </p>
              </div>
              <div className="feature-card">
                <div className="glyph">02</div>
                <h3>Updates as your books do</h3>
                <p>
                  New transactions move the projection automatically, so the forecast reflects this
                  week&apos;s reality, not the assumptions from when it was first built.
                </p>
              </div>
              <div className="feature-card">
                <div className="glyph">03</div>
                <h3>Flags pressure early</h3>
                <p>
                  A pattern of slowing receivables or a cluster of payables due the same week
                  surfaces as a flag — before it becomes a bank-balance surprise.
                </p>
              </div>
              <div className="feature-card">
                <div className="glyph">04</div>
                <h3>Scenario modeling built in</h3>
                <p>
                  The What-If Simulator projects the cash, profit and runway impact of a sales
                  change, a new hire or a slower-paying customer — before you decide.
                </p>
              </div>
              <div className="feature-card">
                <div className="glyph">05</div>
                <h3>Explained, not just charted</h3>
                <p>
                  When the projection shifts, the Cash agent can tell you what&apos;s driving it — not
                  just show you a line moving on a graph.
                </p>
              </div>
              <div className="feature-card">
                <div className="glyph">06</div>
                <h3>Doesn&apos;t touch real records</h3>
                <p>
                  Modeling a scenario never changes an actual posted entry — you can explore freely
                  without any risk to your real books.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="canvas-2">
          <div className="wrap">
            <div className="sec-head">
              <div className="eyebrow">How a scenario runs</div>
              <h2 style={{ marginTop: 12 }}>From a question to a projected impact.</h2>
            </div>
            <div className="step-list">
              <div className="step">
                <div className="n">1</div>
                <div>
                  <h3>Set the variables</h3>
                  <p>
                    Adjust sales growth, customer payment timing, hiring plans or a cost change —
                    the same levers a CFO would model by hand.
                  </p>
                </div>
              </div>
              <div className="step">
                <div className="n">2</div>
                <div>
                  <h3>See the projected impact</h3>
                  <p>
                    Cash, profit and runway update live against your actual current position, not a
                    generic template.
                  </p>
                </div>
              </div>
              <div className="step">
                <div className="n">3</div>
                <div>
                  <h3>Compare against the baseline forecast</h3>
                  <p>
                    Understand exactly how much a decision moves you from where you were already
                    headed.
                  </p>
                </div>
              </div>
              <div className="step">
                <div className="n">4</div>
                <div>
                  <h3>Decide — nothing posts automatically</h3>
                  <p>
                    The scenario stays a model until you act on it in the real world; your books are
                    never touched by the simulation itself.
                  </p>
                </div>
              </div>
            </div>
            <div className="inline-links">
              <Link href="/ai-cfo">How the AI CFO agent uses this →</Link>
              <Link href="/ai-accounting">How AI accounting works →</Link>
              <Link href="/guides">Browse all guides →</Link>
            </div>
          </div>
        </section>

        <section className="canvas">
          <div className="wrap">
            <div className="sec-head" style={{ marginBottom: 8 }}>
              <div className="eyebrow">FAQ</div>
              <h2 style={{ marginTop: 12 }}>Questions about cash flow forecasting, answered plainly.</h2>
            </div>
            <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 22 }}>
              {FAQ_ITEMS.map((item) => (
                <div key={item.question}>
                  <h3 style={{ fontSize: 16, fontWeight: 800 }}>{item.question}</h3>
                  <p style={{ marginTop: 8, fontSize: 14, color: "var(--ink-muted)", lineHeight: 1.65, maxWidth: "70ch" }}>
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div className="wrap">
            <h2>Know where your cash is headed — not just where it is.</h2>
            <p>Run a real scenario against your own numbers, no registration required.</p>
            <div className="cta-row">
              <Link className="btn btn-primary" href="/register">
                Start Free
              </Link>
              <Link className="btn btn-ghost on-navy" href="/#whatif-full">
                Try the What-If Simulator
              </Link>
            </div>
          </div>
        </section>

        <MarketingFooter />
      </div>
    </>
  );
}
