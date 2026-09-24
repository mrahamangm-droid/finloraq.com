import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/MarketingChrome";
import { MARKETING_BASE_STYLE } from "@/components/marketing/marketing-base-style";
import { LEGAL_PAGE_STYLE } from "@/components/marketing/legal-style";
import { BreadcrumbJsonLd } from "@/components/marketing/StructuredData";
import { getMarketingRoute, buildMarketingMetadata } from "@/components/marketing/marketing-routes";

const route = getMarketingRoute("/privacy")!;

export const metadata: Metadata = buildMarketingMetadata(route, {
  description:
    "How Finloraq collects, uses, shares and protects your data — including what happens when AI providers process your financial information.",
});

const EFFECTIVE_DATE = "September 24, 2026";

const SECTIONS = [
  { id: "who-we-are", title: "Who we are" },
  { id: "information-we-collect", title: "Information we collect" },
  { id: "how-we-use-it", title: "How we use your information" },
  { id: "ai-processing", title: "AI processing of your data" },
  { id: "how-we-share-it", title: "How we share information" },
  { id: "data-retention", title: "Data retention" },
  { id: "security", title: "Security" },
  { id: "your-rights", title: "Your rights and choices" },
  { id: "international-transfers", title: "International data transfers" },
  { id: "cookies", title: "Cookies" },
  { id: "children", title: "Children's privacy" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact us" },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MARKETING_BASE_STYLE + LEGAL_PAGE_STYLE }} />
      <BreadcrumbJsonLd items={[{ name: "Home", path: "/" }, { name: "Privacy Policy", path: route.path }]} />

      <div id="fm-root">
        <MarketingHeader currentPath={route.path} />

        <section className="legal-shell canvas">
          <div className="wrap">
            <div className="breadcrumb">
              <Link href="/">Home</Link> / Privacy Policy
            </div>
            <h1 style={{ marginTop: 14, fontSize: "clamp(28px,4vw,40px)" }}>Privacy Policy</h1>
            <p className="legal-meta">
              Effective {EFFECTIVE_DATE} · Applies to finloraq.com and the Finloraq application at
              app.finloraq.com
            </p>

            <div className="legal-toc">
              <h2>On this page</h2>
              <ol>
                {SECTIONS.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>

            <div className="legal-prose">
              <section id="who-we-are">
                <h2>
                  <span className="num">1.</span> Who we are
                </h2>
                <p>
                  Finloraq is an AI finance operating system — double-entry accounting, cash flow
                  forecasting and an AI copilot for finance teams and business owners — built and
                  operated by <strong>PAPPLE WORLD FZE LLC</strong>, a company registered in Ras Al
                  Khaimah (RAK), United Arab Emirates.
                </p>
                <p>
                  This policy explains what we collect when you visit our marketing site, sign up
                  for Finloraq, or use the product day to day, and what rights you have over that
                  information. It covers finloraq.com and the authenticated application at
                  app.finloraq.com.
                </p>
              </section>

              <section id="information-we-collect">
                <h2>
                  <span className="num">2.</span> Information we collect
                </h2>
                <h3>Account and company information</h3>
                <p>
                  When you register, we collect your name, email address and password (stored as a
                  salted hash — we never store or can recover your plaintext password). If you set
                  up two-factor authentication, we store the state needed to verify it, not your
                  raw authenticator secret in reversible form. When you create or join a company
                  workspace, we store the company&apos;s name, currency and the role each user holds
                  within it.
                </p>
                <h3>Financial data you enter or upload</h3>
                <p>
                  Finloraq is an accounting system, so the core of what we store is the financial
                  data you put into it: ledger entries, invoices, bills, expenses, purchases,
                  sales, customer and supplier records, projects, cost centres, tax records and
                  bank account records (account name, currency and balances you enter — Finloraq
                  does not connect to your bank via a live feed; you create these records and their
                  transactions directly). Documents you upload — receipts, invoices, bank
                  statements, contracts — are stored so they can be attached to the records they
                  support and, where you use AI extraction, processed to draft entries for your
                  review.
                </p>
                <h3>Communications and integrations</h3>
                <p>
                  If you connect optional integrations, we process what they send us: inbound
                  emails to your dedicated Finloraq address (for document capture) and WhatsApp
                  Business messages, each verified against a signed webhook so we only accept
                  genuine messages from that channel.
                </p>
                <h3>Payment information</h3>
                <p>
                  Subscription payments are handled by Stripe. We do not store your card number or
                  other full payment credentials — Stripe passes us the subscription status, plan
                  and billing metadata needed to run your account, not your raw card data.
                </p>
                <h3>Usage and audit data</h3>
                <p>
                  We keep an audit trail of security- and account-relevant actions (sign-ins,
                  registrations, permission and record changes) tied to the user and company they
                  belong to, so that activity in a shared workspace is traceable. We also process
                  standard technical data — IP address, request headers, timestamps — for the
                  limited purposes of rate-limiting abuse (e.g. repeated failed logins) and keeping
                  the service running.
                </p>
              </section>

              <section id="how-we-use-it">
                <h2>
                  <span className="num">3.</span> How we use your information
                </h2>
                <ul>
                  <li>To provide the accounting, forecasting and AI copilot functionality you sign up for.</li>
                  <li>To authenticate you, enforce your company&apos;s permissions, and keep one company&apos;s data separate from another&apos;s.</li>
                  <li>To process payments and manage your subscription through Stripe.</li>
                  <li>To detect and prevent abuse — for example, rate-limiting repeated login or registration attempts.</li>
                  <li>To maintain an audit trail your company&apos;s administrators can use to see who did what.</li>
                  <li>To respond to support requests sent to hello@finloraq.com or support@finloraq.com.</li>
                  <li>To meet legal, tax and accounting obligations that apply to us as a business.</li>
                </ul>
                <p>We do not sell your personal information, and we do not use your financial data to serve third-party advertising.</p>
              </section>

              <section id="ai-processing">
                <h2>
                  <span className="num">4.</span> AI processing of your data
                </h2>
                <p>
                  Features like AI-drafted journal entries, document extraction, the AI CFO copilot
                  and voice commands work by sending the relevant text — for example, the content of
                  a document you upload, or a transcript of a voice command — to a third-party AI
                  provider (currently Anthropic and/or OpenAI, depending on configuration) for
                  processing. That provider returns a proposed result, which is never applied to
                  your books automatically: every AI-proposed entry or action is shown to you for
                  review and requires your explicit confirmation before anything is posted.
                </p>
                <p>
                  We do not permit AI providers we use to train their general-purpose models on your
                  data under our commercial terms with them. If you have specific questions about
                  what a particular AI feature sends, ask us at hello@finloraq.com — we would rather
                  answer directly than have you guess.
                </p>
              </section>

              <section id="how-we-share-it">
                <h2>
                  <span className="num">5.</span> How we share information
                </h2>
                <p>
                  We share information only with the service providers (&quot;subprocessors&quot;) that help
                  us run Finloraq, each bound to only use it to provide their service to us:
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Vercel</td><td>Application hosting and infrastructure</td></tr>
                    <tr><td>Stripe</td><td>Subscription billing and payment processing</td></tr>
                    <tr><td>Anthropic / OpenAI</td><td>AI-assisted drafting, extraction and the copilot (see Section 4)</td></tr>
                    <tr><td>Object storage provider</td><td>Storage of uploaded documents (when configured)</td></tr>
                    <tr><td>Meta (WhatsApp Business Platform)</td><td>Delivering WhatsApp integration messages (if you enable it)</td></tr>
                    <tr><td>Email delivery provider</td><td>Inbound document-capture email and transactional email</td></tr>
                  </tbody>
                </table>
                <p>
                  We may also disclose information if required by law, to enforce our Terms of
                  Service, or to protect the rights, property or safety of Finloraq, our users or
                  others — and, in the event of a merger, acquisition or asset sale, information may
                  transfer as part of that transaction, subject to this policy&apos;s commitments
                  continuing to apply.
                </p>
              </section>

              <section id="data-retention">
                <h2>
                  <span className="num">6.</span> Data retention
                </h2>
                <p>
                  We keep your account and financial records for as long as your account is active,
                  plus a reasonable period afterward to meet accounting, tax and legal record-keeping
                  obligations that commonly apply to financial software (which can require retaining
                  financial records for several years). If you close your account, contact
                  support@finloraq.com to request deletion of your personal data beyond what we are
                  required to retain for those legal purposes.
                </p>
              </section>

              <section id="security">
                <h2>
                  <span className="num">7.</span> Security
                </h2>
                <p>We apply security practices appropriate to handling financial data, including:</p>
                <ul>
                  <li>Passwords stored as salted hashes, never in plaintext.</li>
                  <li>Optional two-factor authentication for your account.</li>
                  <li>Encryption in transit (HTTPS/TLS) for all traffic to Finloraq.</li>
                  <li>Per-company data isolation and role-based permissions enforced on every request, not just in the interface.</li>
                  <li>Rate limiting on login, registration and two-factor verification to slow automated attacks.</li>
                  <li>An audit log of security- and account-relevant activity.</li>
                </ul>
                <p>
                  No system is perfectly secure, and we cannot guarantee absolute security. If we
                  become aware of a breach affecting your data, we will notify affected users and
                  relevant authorities as required by applicable law.
                </p>
              </section>

              <section id="your-rights">
                <h2>
                  <span className="num">8.</span> Your rights and choices
                </h2>
                <p>
                  Depending on where you live, you may have rights to access, correct, export or
                  delete your personal data, or to object to or restrict certain processing — for
                  example under the UAE&apos;s Personal Data Protection Law, the EU/UK GDPR, or U.S. state
                  privacy laws such as the CCPA/CPRA. To exercise any of these, email
                  hello@finloraq.com; we will respond within the time required by the law that
                  applies to you.
                </p>
                <p>
                  Within a company workspace, note that your company&apos;s administrators also control
                  access to records within that workspace as part of its own accounting
                  requirements — some requests may need to go through your company admin rather than
                  us directly, if the data belongs to their business records rather than to you
                  personally.
                </p>
              </section>

              <section id="international-transfers">
                <h2>
                  <span className="num">9.</span> International data transfers
                </h2>
                <p>
                  We are based in the UAE and use infrastructure and service providers located in
                  other countries, so your information may be processed outside the country where
                  you live. Where required, we rely on appropriate safeguards (such as standard
                  contractual clauses) for these transfers.
                </p>
              </section>

              <section id="cookies">
                <h2>
                  <span className="num">10.</span> Cookies
                </h2>
                <p>
                  We use a small number of strictly necessary and functional cookies — for example,
                  to keep you signed in, and to remember a display-currency preference on the
                  marketing site. We do not use third-party advertising or cross-site tracking
                  cookies. Because these cookies are necessary for the site to function, we don&apos;t
                  show a cookie-consent banner for them, consistent with how &quot;strictly necessary&quot;
                  cookies are treated under most cookie laws.
                </p>
              </section>

              <section id="children">
                <h2>
                  <span className="num">11.</span> Children&apos;s privacy
                </h2>
                <p>
                  Finloraq is a business tool and is not directed at, or intended for use by,
                  children. We do not knowingly collect personal information from anyone under 18.
                  If you believe a child has provided us with personal information, contact us and
                  we will delete it.
                </p>
              </section>

              <section id="changes">
                <h2>
                  <span className="num">12.</span> Changes to this policy
                </h2>
                <p>
                  We may update this policy as Finloraq changes. If we make material changes, we
                  will update the effective date above and, where appropriate, notify you directly
                  (for example, by email or an in-app notice).
                </p>
              </section>

              <section id="contact">
                <h2>
                  <span className="num">13.</span> Contact us
                </h2>
                <p>
                  Questions about this policy or your data can be sent to{" "}
                  <a href="mailto:hello@finloraq.com">hello@finloraq.com</a> or{" "}
                  <a href="mailto:support@finloraq.com">support@finloraq.com</a>.
                </p>
                <p>PAPPLE WORLD FZE LLC — Ras Al Khaimah (RAK), United Arab Emirates.</p>
                <div className="legal-callout">
                  See also our <Link href="/terms">Terms of Service</Link>, which governs your use
                  of Finloraq alongside this policy.
                </div>
              </section>
            </div>
          </div>
        </section>

        <MarketingFooter />
      </div>
    </>
  );
}
