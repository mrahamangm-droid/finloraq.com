import Link from "next/link";
import { MARKETING_ROUTES } from "./marketing-routes";

// Shared header + footer for every marketing/SEO landing page. Pulled out
// of MarketingHomePage.tsx (which keeps its own copy inline, since it's
// already shipped as one self-contained block and re-plumbing a live,
// tested page into this carries more regression risk than the ~40 lines
// it'd save) so new landing pages get identical, real <Link> navigation —
// including aria-current="page" on the active nav item — without
// hand-copying markup per page.
const PRODUCT_LINKS = [
  { href: "/#demo", label: "Products" },
  { href: "/ai-accounting", label: "AI Accounting" },
  { href: "/cash-flow-forecasting", label: "Cash Flow" },
];

const SOLUTIONS_LINKS = [
  { href: "/ai-cfo", label: "AI CFO" },
  { href: "/#audience", label: "Who it's for" },
];

const RESOURCES_LINKS = [
  { href: "/guides", label: "Guides" },
  { href: "/#faq", label: "FAQ" },
];

export function MarketingHeader({ currentPath }: { currentPath: string }) {
  return (
    <header className="nav">
      <div className="wrap nav-row">
        <Link href="/" className="brand-mark">
          <span className="dot" />
          FINLORAQ
        </Link>
        <nav className="links">
          <Link href="/ai-accounting" aria-current={currentPath === "/ai-accounting" ? "page" : undefined}>
            AI Accounting
          </Link>
          <Link href="/ai-cfo" aria-current={currentPath === "/ai-cfo" ? "page" : undefined}>
            AI CFO
          </Link>
          <Link
            href="/cash-flow-forecasting"
            aria-current={currentPath === "/cash-flow-forecasting" ? "page" : undefined}
          >
            Cash Flow
          </Link>
          <Link href="/guides" aria-current={currentPath === "/guides" ? "page" : undefined}>
            Guides
          </Link>
          <Link href="/#pricing">Pricing</Link>
        </nav>
        <div className="nav-right">
          <Link className="btn btn-ghost btn-sm" href="/login">
            Sign In
          </Link>
          <Link className="btn btn-primary btn-sm" href="/register">
            Start Free
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  const productRoutes = MARKETING_ROUTES.filter((r) => r.footerGroup === "product");
  const solutionsRoutes = MARKETING_ROUTES.filter((r) => r.footerGroup === "solutions");
  const resourceRoutes = MARKETING_ROUTES.filter((r) => r.footerGroup === "resources");

  return (
    <footer>
      <div className="wrap foot-grid">
        <div>
          <div className="brand-mark" style={{ color: "#fff" }}>
            <span className="dot" />
            FINLORAQ
          </div>
          <p style={{ marginTop: 14, fontSize: 13, maxWidth: "32ch", lineHeight: 1.6 }}>
            AI Finance Operating System — accounting foundation, AI intelligence,
            human-controlled automation.
          </p>
        </div>
        <div>
          <h6>Product</h6>
          <ul>
            <li>
              <Link href="/#foundation">Accounting</Link>
            </li>
            <li>
              <Link href="/#pulse">Business Pulse</Link>
            </li>
            {productRoutes.map((r) => (
              <li key={r.path}>
                <Link href={r.path}>{r.navLabel}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h6>Solutions</h6>
          <ul>
            <li>
              <Link href="/#audience">Business Owners</Link>
            </li>
            <li>
              <Link href="/#audience">Finance Teams</Link>
            </li>
            {solutionsRoutes.map((r) => (
              <li key={r.path}>
                <Link href={r.path}>{r.navLabel}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h6>Resources</h6>
          <ul>
            {resourceRoutes.map((r) => (
              <li key={r.path}>
                <Link href={r.path}>{r.navLabel}</Link>
              </li>
            ))}
            <li>
              <a href="mailto:hello@finloraq.com">Contact</a>
            </li>
          </ul>
        </div>
        <div>
          <h6>Company</h6>
          <ul>
            <li>
              <a href="mailto:hello@finloraq.com">About</a>
            </li>
            <li>
              <a href="mailto:hello@finloraq.com">Contact</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="wrap foot-bottom">
        <span>© {new Date().getFullYear()} Finloraq</span>
        <span>Demo content shown throughout is illustrative and does not represent a real customer.</span>
      </div>
    </footer>
  );
}
