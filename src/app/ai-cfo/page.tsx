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

const route = getMarketingRoute("/ai-cfo")!;

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
    question: "What does an \"AI CFO\" actually do?",
    answer:
      "In Finloraq, the CFO agent is one of six specialized agents (alongside AP, AR, Cash, Close and Tax) that watch your books and surface business-level financial intelligence — margin drift, runway, concentration risk, the story behind a swing in profit. It doesn't set strategy for you; it gives you the numbers and the reasoning a CFO would bring to a conversation, on demand instead of once a quarter.",
  },
  {
    question: "Can an AI CFO replace hiring a real CFO?",
    answer:
      "For most small and growing businesses, the honest answer is: it replaces the reason many of them were putting off hiring one — not having consistent, explained financial visibility. It won't negotiate a term sheet, sit in a board meeting, or take legal responsibility for a filing. What it does replace is the gap between \"no financial oversight\" and \"a $150k+ hire,\" which is where most small businesses actually sit.",
  },
  {
    question: "How is this different from a financial dashboard?",
    answer:
      "A dashboard shows you numbers and expects you to interpret them. The CFO agent is built to answer the follow-up question — why did margin drop, what's driving the cash pressure, what happens if you delay a hire — because it's reasoning over the same ledger the numbers came from, not a static export.",
  },
  {
    question: "Does the AI CFO make decisions or just report on them?",
    answer:
      "It reports, recommends and models — the What-If Simulator lets you test a scenario (a sales dip, a new hire, a slower-paying customer) and see the projected cash, profit and runway impact before you commit to anything. Every actual decision, and every posted entry, still requires a person's approval.",
  },
];

export default function AiCfoPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MARKETING_BASE_STYLE }} />
      <SoftwareApplicationJsonLd
        name="Finloraq AI CFO Agent"
        description={route.description}
        url={route.path}
        category="FinanceApplication"
      />
      <BreadcrumbJsonLd items={[{ name: "Home", path: "/" }, { name: "AI CFO", path: route.path }]} />
      <FaqJsonLd items={FAQ_ITEMS} />

      <div id="fm-root">
        <MarketingHeader currentPath={route.path} />

        <section className="hero">
          <div className="wrap">
            <div className="breadcrumb">
              <Link href="/">Home</Link> / AI CFO
            </div>
            <div className="eyebrow on-navy">AI CFO Software</div>
            <h1 style={{ marginTop: 14 }}>
              Financial intelligence, <span>without the hire.</span>
            </h1>
            <p className="lead">
              Most small and growing businesses can&apos;t justify a full-time CFO — but they still need
              someone asking why margin moved, whether cash covers the next quarter, and what a
              decision actually costs. Finloraq&apos;s CFO agent is built to answer exactly that, on top
              of your real books.
            </p>
            <div className="cta-row">
              <Link className="btn btn-primary" href="/register">
                Start Free
              </Link>
              <Link className="btn btn-ghost on-navy" href="/#agents">
                See the Agents in Action
              </Link>
            </div>
          </div>
        </section>

        <section className="canvas">
          <div className="wrap">
            <div className="sec-head center">
              <div className="eyebrow">Why &quot;CFO-level&quot; visibility is usually missing</div>
              <h2 style={{ marginTop: 12 }}>Most businesses only get financial analysis in arrears.</h2>
              <p>
                By the time a quarterly review or an annual audit surfaces a margin problem, the
                decisions that caused it were made months earlier. CFO-level thinking is valuable
                precisely because it&apos;s continuous — which is the part that&apos;s hardest to afford as a
                dedicated hire.
              </p>
            </div>
            <div className="feature-grid">
              <div className="feature-card">
                <div className="glyph">01</div>
                <h3>Margin and cost drivers, explained</h3>
                <p>
                  When a cost line moves, the agent identifies what actually drove it — a supplier
                  price change, volume, or a one-off — instead of leaving you to dig through
                  transactions.
                </p>
              </div>
              <div className="feature-card">
                <div className="glyph">02</div>
                <h3>Runway and cash pressure, ahead of time</h3>
                <p>
                  Cash flow forecasting surfaces pressure before it hits, not after the bank balance
                  already tells you.{" "}
                  <Link href="/cash-flow-forecasting" style={{ color: "var(--brand)", fontWeight: 600 }}>
                    See how forecasting works →
                  </Link>
                </p>
              </div>
              <div className="feature-card">
                <div className="glyph">03</div>
                <h3>What-if scenario modeling</h3>
                <p>
                  Model a sales dip, a new hire or slower customer payments and see the projected
                  cash, profit and runway impact — without touching a real accounting record.
                </p>
              </div>
              <div className="feature-card">
                <div className="glyph">04</div>
                <h3>A daily action list, not a quarterly deck</h3>
                <p>
                  Business Pulse turns agent findings into a short list of what actually needs your
                  attention today, ranked by impact.
                </p>
              </div>
              <div className="feature-card">
                <div className="glyph">05</div>
                <h3>Works alongside your accountant</h3>
                <p>
                  The CFO agent doesn&apos;t replace your accountant&apos;s judgment or your tax advisor&apos;s
                  sign-off — it gives both of them a clearer starting point.
                </p>
              </div>
              <div className="feature-card">
                <div className="glyph">06</div>
                <h3>Grounded in the same ledger, always</h3>
                <p>
                  Every figure the agent surfaces traces back to real, posted, double-entry
                  accounting data — not a separate analytics layer that can drift from the books.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="canvas-2">
          <div className="wrap">
            <div className="sec-head">
              <div className="eyebrow">Where an AI CFO agent fits</div>
              <h2 style={{ marginTop: 12 }}>A realistic comparison, not a sales pitch.</h2>
            </div>
            <div className="compare-wrap">
              <table className="compare">
                <thead>
                  <tr>
                    <th></th>
                    <th>No financial oversight</th>
                    <th>Finloraq CFO agent</th>
                    <th>Fractional CFO</th>
                    <th>Full-time CFO</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Continuous monitoring</td>
                    <td className="no">No</td>
                    <td className="yes">Yes, daily</td>
                    <td className="no">Usually periodic</td>
                    <td className="yes">Yes</td>
                  </tr>
                  <tr>
                    <td>Scenario modeling</td>
                    <td className="no">No</td>
                    <td className="yes">Yes, self-serve</td>
                    <td className="yes">On request</td>
                    <td className="yes">Yes</td>
                  </tr>
                  <tr>
                    <td>Strategic negotiation &amp; board presence</td>
                    <td className="no">No</td>
                    <td className="no">No</td>
                    <td className="yes">Sometimes</td>
                    <td className="yes">Yes</td>
                  </tr>
                  <tr>
                    <td>Typical cost profile</td>
                    <td className="no">—</td>
                    <td className="yes">Included in your plan</td>
                    <td className="no">Ongoing retainer</td>
                    <td className="no">Full-time salary</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="inline-links">
              <Link href="/ai-accounting">How AI accounting works →</Link>
              <Link href="/cash-flow-forecasting">Cash flow forecasting →</Link>
              <Link href="/guides">Browse all guides →</Link>
            </div>
          </div>
        </section>

        <section className="canvas">
          <div className="wrap">
            <div className="sec-head" style={{ marginBottom: 8 }}>
              <div className="eyebrow">FAQ</div>
              <h2 style={{ marginTop: 12 }}>Questions about the AI CFO agent, answered plainly.</h2>
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
            <h2>Ask your own books the questions a CFO would ask.</h2>
            <p>Try the What-If Simulator and Business Pulse — no registration required.</p>
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
