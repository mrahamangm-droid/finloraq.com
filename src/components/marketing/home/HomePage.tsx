import Link from "next/link";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/MarketingChrome";
import { MARKETING_BASE_STYLE } from "@/components/marketing/marketing-base-style";
import { DashboardPreview } from "./DashboardPreview";
import { HowItWorksFlow } from "./HowItWorksFlow";
import { FEATURES, TRUST_ITEMS } from "./home-content";
import { HOME_STYLE } from "./home-style";

// The marketing homepage ("/"): hero with a live product preview, how it
// works, six feature cards, a trust bar and one call to action. Rendered on
// the server; the only client JavaScript is the dashboard preview.
export function HomePage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MARKETING_BASE_STYLE + HOME_STYLE }} />
      <div id="fm-root">
        <MarketingHeader currentPath="/" />

        <main>
          <section className="hero home" aria-labelledby="home-title">
            <div className="wrap">
              <h1 id="home-title">
                Your business. <span>Understood.</span>
              </h1>
              <p className="lead">AI-powered accounting and finance to record, understand, predict and act.</p>
              <div className="cta-row">
                <Link className="btn btn-primary" href="/register">
                  Start Free
                </Link>
                <a className="btn btn-ghost on-navy" href="#demo">
                  Explore Demo
                </a>
              </div>
              <div className="hero-stage">
                <DashboardPreview />
              </div>
            </div>
          </section>

          <section className="canvas-2" id="how-it-works" aria-labelledby="how-title">
            <div className="wrap">
              <div className="sec-head center">
                <div className="eyebrow">How it works</div>
                <h2 id="how-title" style={{ marginTop: 10 }}>
                  From any document to a decision.
                </h2>
                <p>Upload what you already have. Finloraq reads it, records it correctly, and tells you what it means.</p>
              </div>
              <HowItWorksFlow />
            </div>
          </section>

          <section id="features" aria-labelledby="features-title">
            <div className="wrap">
              <div className="sec-head center">
                <div className="eyebrow">Features</div>
                <h2 id="features-title" style={{ marginTop: 10 }}>
                  Everything finance needs, in one place.
                </h2>
              </div>
              <div className="features">
                {FEATURES.map((f) => (
                  <article className="feature" key={f.id} id={f.id}>
                    <div className="glyph" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d={f.icon} />
                      </svg>
                    </div>
                    {f.status === "soon" && <span className="soon">Coming soon</span>}
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="trust" aria-label="Built on">
            <div className="wrap">
              <ul className="trust-row">
                {TRUST_ITEMS.map((t) => (
                  <li key={t.title}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M8.5 12l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div>
                      <b>{t.title}</b>
                      <span>{t.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="final-cta home" aria-labelledby="cta-title">
            <div className="wrap">
              <h2 id="cta-title">Run your business with clarity.</h2>
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
