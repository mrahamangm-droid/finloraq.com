import { SITE_URL } from "@/lib/site";

// Renders one or more JSON-LD <script> tags. Every fact in here is either a
// structural claim about the site itself (it has this name, this URL, this
// FAQ) or copied verbatim from copy that's already live on the page — no
// invented ratings, review counts, prices-as-facts, or "founded in" dates
// that aren't real. AggregateRating/Review schema is deliberately not used
// anywhere in this app: Finloraq has no public review corpus to summarize,
// and fabricating one is exactly the kind of thing Google's spam policies
// (and this project's own "no fake reviews" instruction) rule out.
export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Finloraq",
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    description:
      "Finloraq is an AI Finance Operating System combining real double-entry accounting with AI agents that explain what happened, why, and what to do next.",
    sameAs: [],
  };
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function WebSiteJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Finloraq",
    url: SITE_URL,
  };
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function SoftwareApplicationJsonLd({
  name = "Finloraq",
  description,
  url = SITE_URL,
  category = "FinanceApplication",
}: {
  name?: string;
  description: string;
  url?: string;
  category?: string;
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    applicationCategory: category,
    operatingSystem: "Web",
    description,
    url,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      // Pulled from the real pricing table in MarketingHomePage.tsx
      // (Starter $29/mo through AI CFO $299/mo; Enterprise is quote-based
      // and excluded since it has no fixed price to report). If that
      // pricing table changes, update these to match — this schema is
      // read by search engines and must stay accurate, not aspirational.
      lowPrice: "29",
      highPrice: "299",
      offerCount: "4",
    },
  };
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export type FaqItem = { question: string; answer: string };

/**
 * Builds FAQPage JSON-LD from the exact Q&A pairs rendered on the page.
 * Pass the same copy that appears in the visible FAQ accordion — schema.org
 * and Google's guidelines require the structured data to match what a
 * visitor actually sees, and diverging from it is treated as spam.
 */
export function FaqJsonLd({ items }: { items: FaqItem[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function BreadcrumbJsonLd({ items }: { items: { name: string; path: string }[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
