import Link from "next/link";
import { COMPANY_LINE } from "./home/home-content";

// Shared header + footer for every marketing page, including the homepage,
// so navigation and the company line only exist in one place. Real <Link>
// navigation with aria-current="page" on the active item.

const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/guides", label: "Guides" },
];

// The mobile menu also lists the product landing pages, which don't fit the
// desktop bar.
const MOBILE_NAV = [
  { href: "/", label: "Home" },
  ...NAV.slice(0, 3),
  { href: "/ai-accounting", label: "AI Accounting" },
  { href: "/ai-cfo", label: "AI CFO" },
  { href: "/cash-flow-forecasting", label: "Cash Flow Forecasting" },
  NAV[3]!,
];

const FOOTER_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/ai-accounting", label: "AI Accounting" },
  { href: "/ai-cfo", label: "AI CFO" },
  { href: "/cash-flow-forecasting", label: "Cash Flow" },
  { href: "/guides", label: "Guides" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

// Webfonts shared by every marketing page (already allowed by the CSP).
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@600;700;800&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap";

export function MarketingHeader({ currentPath }: { currentPath: string }) {
  const current = (href: string) => (currentPath === href ? ("page" as const) : undefined);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={FONTS_HREF} />
      <header className="nav">
        <div className="wrap nav-row">
          <Link href="/" className="brand-mark" aria-label="Finloraq home">
            <span className="dot" />
            FINLORAQ
          </Link>
          <nav className="links" aria-label="Main">
            {NAV.map((l) => (
              <Link key={l.href} href={l.href} aria-current={current(l.href)}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="nav-right">
            <Link className="btn btn-ghost btn-sm" href="/login">
              Sign In
            </Link>
            <Link className="btn btn-primary btn-sm" href="/register">
              Start Free
            </Link>
            {/* Mobile menu. Plain <a> (full page loads) so the <details> is
                always closed on the next page without any client JS. */}
            <details className="mnav">
              <summary aria-label="Menu">
                <span />
                <span />
                <span />
              </summary>
              <nav className="mnav-panel" aria-label="Main menu">
                {MOBILE_NAV.map((l) => (
                  // eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load closes the <details> menu, see above
                  <a key={l.href} href={l.href} aria-current={current(l.href)}>
                    {l.label}
                  </a>
                ))}
                <div className="mnav-cta">
                  <a className="btn btn-ghost" href="/login">
                    Sign In
                  </a>
                  <a className="btn btn-primary" href="/register">
                    Start Free
                  </a>
                </div>
              </nav>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}

export function MarketingFooter() {
  const [company, place, email] = COMPANY_LINE.split(" | ");
  return (
    <footer>
      <div className="wrap foot-slim">
        <Link href="/" className="brand-mark" aria-label="Finloraq home">
          <span className="dot" />
          FINLORAQ
        </Link>
        <nav className="foot-links" aria-label="Footer">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="wrap foot-bottom">
        <span>
          © {new Date().getFullYear()} {company} | {place} | <a href={`mailto:${email}`}>{email}</a>
        </span>
        <span>Demo content is illustrative and does not represent a real customer.</span>
      </div>
    </footer>
  );
}
