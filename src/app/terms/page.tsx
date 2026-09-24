import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/MarketingChrome";
import { MARKETING_BASE_STYLE } from "@/components/marketing/marketing-base-style";
import { LEGAL_PAGE_STYLE } from "@/components/marketing/legal-style";
import { BreadcrumbJsonLd } from "@/components/marketing/StructuredData";
import { getMarketingRoute, buildMarketingMetadata } from "@/components/marketing/marketing-routes";

const route = getMarketingRoute("/terms")!;

export const metadata: Metadata = buildMarketingMetadata(route, {
  description:
    "The terms that govern your use of Finloraq — accounts, subscriptions and billing, your data, AI features, and everyone's responsibilities.",
});

const EFFECTIVE_DATE = "September 24, 2026";

const SECTIONS = [
  { id: "acceptance", title: "Acceptance of these terms" },
  { id: "the-service", title: "The service" },
  { id: "accounts", title: "Accounts and eligibility" },
  { id: "subscriptions", title: "Subscriptions and billing" },
  { id: "your-data", title: "Your data" },
  { id: "ai-features", title: "AI features — what they are and aren't" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "third-party", title: "Third-party services" },
  { id: "ip", title: "Intellectual property" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "liability", title: "Limitation of liability" },
  { id: "termination", title: "Termination" },
  { id: "governing-law", title: "Governing law" },
  { id: "changes", title: "Changes to these terms" },
  { id: "contact", title: "Contact us" },
];

export default function TermsOfServicePage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MARKETING_BASE_STYLE + LEGAL_PAGE_STYLE }} />
      <BreadcrumbJsonLd items={[{ name: "Home", path: "/" }, { name: "Terms of Service", path: route.path }]} />

      <div id="fm-root">
        <MarketingHeader currentPath={route.path} />

        <section className="legal-shell canvas">
          <div className="wrap">
            <div className="breadcrumb">
              <Link href="/">Home</Link> / Terms of Service
            </div>
            <h1 style={{ marginTop: 14, fontSize: "clamp(28px,4vw,40px)" }}>Terms of Service</h1>
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
              <section id="acceptance">
                <h2>
                  <span className="num">1.</span> Acceptance of these terms
                </h2>
                <p>
                  These Terms of Service (&quot;Terms&quot;) are an agreement between you (and, if
                  you&apos;re signing up on behalf of a company, that company) and{" "}
                  <strong>PAPPLE WORLD FZE LLC</strong>, operating as Finloraq (&quot;Finloraq&quot;,
                  &quot;we&quot;, &quot;us&quot;). By creating an account or using Finloraq, you
                  agree to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If you
                  don&apos;t agree, don&apos;t use the service.
                </p>
                <p>
                  If you&apos;re accepting these Terms for a company, you confirm you have authority
                  to bind that company, and &quot;you&quot; in these Terms means that company.
                </p>
              </section>

              <section id="the-service">
                <h2>
                  <span className="num">2.</span> The service
                </h2>
                <p>
                  Finloraq is a finance and accounting platform: a double-entry accounting ledger,
                  invoicing, expenses, banking records, cash flow forecasting, reporting, and an AI
                  copilot that helps draft, extract and explain financial entries. Every AI-proposed
                  action requires your explicit confirmation before it&apos;s posted to your books —
                  see Section 6.
                </p>
                <p>
                  We may add, change or remove features over time. We&apos;ll try to give notice of
                  changes that materially reduce functionality you rely on, but this isn&apos;t a
                  guarantee that any specific feature will always exist in its current form.
                </p>
              </section>

              <section id="accounts">
                <h2>
                  <span className="num">3.</span> Accounts and eligibility
                </h2>
                <ul>
                  <li>You must be at least 18 years old and able to form a binding contract to use Finloraq.</li>
                  <li>You must provide accurate registration information and keep it up to date.</li>
                  <li>
                    You&apos;re responsible for safeguarding your password and any two-factor
                    authentication device, and for all activity under your account. Tell us
                    immediately at support@finloraq.com if you suspect unauthorized access.
                  </li>
                  <li>
                    Within a company workspace, the company&apos;s administrators control who has
                    access and what role/permissions they hold. We act on the instructions of
                    whoever holds administrative access to a workspace.
                  </li>
                </ul>
              </section>

              <section id="subscriptions">
                <h2>
                  <span className="num">4.</span> Subscriptions and billing
                </h2>
                <p>
                  Finloraq offers a Free plan and paid subscription plans, billed through Stripe.
                  By subscribing to a paid plan, you authorize us (via Stripe) to charge your
                  payment method on a recurring basis for that plan until you cancel.
                </p>
                <ul>
                  <li>Prices are shown in the currency you select at checkout and may vary by plan and, where applicable, by billing region.</li>
                  <li>You can change plans or cancel your subscription at any time through the billing portal in your account settings, which is provided by Stripe.</li>
                  <li>Except where required by law, fees already paid are non-refundable; if you cancel, your paid plan remains active until the end of the current billing period.</li>
                  <li>
                    If a payment fails, we may suspend paid features until it&apos;s resolved.
                    We&apos;ll make reasonable efforts to notify you first.
                  </li>
                  <li>
                    We may change our pricing going forward; we&apos;ll give notice before a price
                    change applies to your existing subscription.
                  </li>
                </ul>
              </section>

              <section id="your-data">
                <h2>
                  <span className="num">5.</span> Your data
                </h2>
                <p>
                  You (or your company) own the financial data, documents and content you put into
                  Finloraq. We don&apos;t claim ownership of it. You grant us a limited license to
                  host, process and display that data solely to provide and improve the service to
                  you — see our <Link href="/privacy">Privacy Policy</Link> for what we collect and
                  how it&apos;s used, including how AI features process it.
                </p>
                <p>
                  You&apos;re responsible for the accuracy and legality of the data you enter, for
                  having the rights to upload any documents you submit, and for complying with any
                  accounting, tax or record-keeping laws that apply to your business — Finloraq is a
                  tool to help you keep books, not a substitute for your own compliance obligations.
                </p>
                <p>
                  You can export or request deletion of your data — contact support@finloraq.com. We
                  may retain data as required by law or as described in our Privacy Policy after an
                  account closes.
                </p>
              </section>

              <section id="ai-features">
                <h2>
                  <span className="num">6.</span> AI features — what they are and aren&apos;t
                </h2>
                <p>
                  Finloraq&apos;s AI features (document extraction, drafted journal entries, the AI
                  CFO copilot, voice commands) are decision-support tools. They can make mistakes:
                  misread a document, propose an incorrect entry, or misunderstand a request.
                  That&apos;s why every AI-proposed action is shown to you before anything is posted
                  and requires your explicit confirmation — nothing an AI feature proposes is applied
                  to your books automatically.
                </p>
                <p>
                  <strong>
                    AI output from Finloraq is not accounting, tax, financial or legal advice.
                  </strong>{" "}
                  You (or your company&apos;s qualified professionals) remain responsible for
                  reviewing and approving every entry and for the accuracy of your books and filings.
                  For decisions with real financial, tax or legal consequences, consult a qualified
                  accountant, tax advisor or lawyer.
                </p>
              </section>

              <section id="acceptable-use">
                <h2>
                  <span className="num">7.</span> Acceptable use
                </h2>
                <p>You agree not to:</p>
                <ul>
                  <li>Use Finloraq for any unlawful purpose, including fraud, money laundering or misrepresenting financial records.</li>
                  <li>
                    Attempt to gain unauthorized access to another user&apos;s or company&apos;s
                    data, or to any part of the system you&apos;re not permitted to access.
                  </li>
                  <li>Interfere with or disrupt the service — including attempting to bypass rate limits, probing for vulnerabilities without authorization, or overloading the infrastructure.</li>
                  <li>Reverse-engineer, decompile or attempt to extract the source code of the service, except where applicable law gives you that right despite this restriction.</li>
                  <li>Resell or provide the service to third parties as your own product without our written agreement.</li>
                </ul>
                <p>We may suspend or terminate accounts that violate this section.</p>
              </section>

              <section id="third-party">
                <h2>
                  <span className="num">8.</span> Third-party services
                </h2>
                <p>
                  Finloraq relies on and integrates with third-party services — including Stripe for
                  payments, Anthropic and/or OpenAI for AI processing, and, if you enable them,
                  WhatsApp Business messaging and email-based document capture. Your use of those
                  integrations may also be subject to that provider&apos;s own terms. We&apos;re not
                  responsible for outages or changes in a third-party service that affect
                  Finloraq&apos;s functionality, though we&apos;ll do our best to keep the service
                  working around them.
                </p>
              </section>

              <section id="ip">
                <h2>
                  <span className="num">9.</span> Intellectual property
                </h2>
                <p>
                  Finloraq — including its software, design, trademarks and branding — is owned by
                  PAPPLE WORLD FZE LLC or its licensors. Subject to these Terms, we grant you a
                  limited, non-exclusive, non-transferable right to access and use Finloraq for your
                  own business purposes. Nothing in these Terms transfers any of our intellectual
                  property rights to you.
                </p>
              </section>

              <section id="disclaimers">
                <h2>
                  <span className="num">10.</span> Disclaimers
                </h2>
                <p>
                  Finloraq is provided &quot;as is&quot; and &quot;as available.&quot; To the
                  maximum extent permitted by law, we disclaim all warranties, express or implied,
                  including implied warranties of merchantability, fitness for a particular purpose,
                  and non-infringement. We don&apos;t warrant that the service will be uninterrupted,
                  error-free, or that AI-generated output will always be accurate — see Section 6.
                </p>
              </section>

              <section id="liability">
                <h2>
                  <span className="num">11.</span> Limitation of liability
                </h2>
                <p>
                  To the maximum extent permitted by law, PAPPLE WORLD FZE LLC will not be liable
                  for any indirect, incidental, special, consequential or punitive damages, or any
                  loss of profits, revenue, data or business opportunity, arising from your use of
                  Finloraq — including from an AI-proposed entry you approved, or from data loss —
                  even if we&apos;ve been advised of the possibility of such damages. Our total
                  liability for any claim relating to the service will not exceed the amount you paid
                  us in the twelve months before the claim arose (or, for the Free plan, one hundred
                  dollars). Some jurisdictions don&apos;t allow these limitations, in which case only
                  the limits that jurisdiction allows will apply.
                </p>
              </section>

              <section id="termination">
                <h2>
                  <span className="num">12.</span> Termination
                </h2>
                <p>
                  You may stop using Finloraq and close your account at any time. We may suspend or
                  terminate your access if you materially breach these Terms (including Section 7),
                  if required by law, or if we discontinue the service (with reasonable notice where
                  practical). Sections that by their nature should survive termination — including
                  Your Data, Disclaimers, Limitation of Liability and Governing Law — will survive.
                </p>
              </section>

              <section id="governing-law">
                <h2>
                  <span className="num">13.</span> Governing law
                </h2>
                <p>
                  These Terms are governed by the laws of the United Arab Emirates, without regard
                  to conflict-of-laws principles. Any dispute arising from these Terms or your use
                  of Finloraq will be subject to the exclusive jurisdiction of the competent courts
                  of Ras Al Khaimah, UAE, unless applicable law in your jurisdiction requires
                  otherwise.
                </p>
              </section>

              <section id="changes">
                <h2>
                  <span className="num">14.</span> Changes to these terms
                </h2>
                <p>
                  We may update these Terms as Finloraq evolves. If we make material changes,
                  we&apos;ll update the effective date above and, where appropriate, notify you
                  directly. Continuing to use Finloraq after a change takes effect means you accept
                  the updated Terms.
                </p>
              </section>

              <section id="contact">
                <h2>
                  <span className="num">15.</span> Contact us
                </h2>
                <p>
                  Questions about these Terms can be sent to{" "}
                  <a href="mailto:hello@finloraq.com">hello@finloraq.com</a> or{" "}
                  <a href="mailto:support@finloraq.com">support@finloraq.com</a>.
                </p>
                <p>PAPPLE WORLD FZE LLC — Ras Al Khaimah (RAK), United Arab Emirates.</p>
                <div className="legal-callout">
                  See also our <Link href="/privacy">Privacy Policy</Link>, which is incorporated
                  into these Terms by reference.
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
