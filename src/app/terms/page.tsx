/**
 * /terms — Terms of Service.
 *
 * Drafted from common Irish SaaS / consumer-rights starting points.
 * Swap in the exact Howl.ie wording when ready by replacing the body
 * sections — section headings + IDs should stay so deep links and
 * changelog tracking remain stable.
 *
 * Key things this needs to cover for an Irish SaaS:
 *   - Who the contract is between
 *   - The service we're providing (visibility tracking)
 *   - Payment + cancellation
 *   - Acceptable use (no scraping our service for resale, etc.)
 *   - Liability cap
 *   - Governing law (Ireland)
 *   - Consumer rights (Distance Selling Regs / EU 2019/770)
 */

import Link from "next/link";

export const metadata = {
  title: "Terms of Service — CMO.ie",
  description:
    "The agreement between CMO.ie and you when you use the service. Plain language, Irish-jurisdiction.",
};

const LAST_UPDATED = "25 April 2026";
const CONTACT_EMAIL = "hello@howl.ie";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="px-6 md:px-10 py-5 border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight hover:text-emerald-dark transition-colors"
          >
            CMO.ie
          </Link>
          <nav className="flex items-center gap-6 text-sm text-text-secondary">
            <Link href="/privacy" className="hover:text-text-primary">
              Privacy
            </Link>
            <Link href="/pricing" className="hover:text-text-primary">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-text-primary">
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 md:px-10 py-12 md:py-20">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Legal
        </p>
        <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Terms of Service
        </h1>
        <p className="mt-4 text-sm text-text-muted">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-10 text-text-secondary leading-relaxed">
          <Section id="agreement" title="1. The agreement">
            <p>
              These terms form a contract between you (or the company you
              represent) and Howl Ltd., trading as Howl.ie, registered in
              Ireland (collectively &quot;we&quot;, &quot;us&quot;,
              &quot;our&quot;). By creating an account on CMO.ie or using
              the service, you agree to these terms.
            </p>
            <p>
              If you&apos;re entering this agreement on behalf of a
              company, you confirm you&apos;re authorised to bind that
              company.
            </p>
          </Section>

          <Section id="service" title="2. What we provide">
            <p>
              CMO.ie is an AI search visibility tracking service. We run
              prompts you provide against AI models (currently ChatGPT,
              Claude, Perplexity, Gemini, Copilot, Grok), record the
              responses, identify whether your brand and competitors
              appear, and produce action plans, content briefs and
              drafts based on the results.
            </p>
            <p>
              The service is provided &quot;as is&quot;. AI model output
              is inherently variable — we don&apos;t guarantee specific
              visibility outcomes, and AI providers can change their
              models or pricing at any time, which can affect your
              results.
            </p>
          </Section>

          <Section id="account" title="3. Your account">
            <p>
              You&apos;re responsible for keeping your account credentials
              secure. Tell us immediately at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-text-primary underline underline-offset-4"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              if you suspect unauthorised access.
            </p>
            <p>
              You must be at least 16 years old to use CMO.ie. The
              service is intended for businesses, not consumers buying
              for personal use.
            </p>
          </Section>

          <Section id="payment" title="4. Payment, billing, cancellation">
            <p>
              Paid plans are billed monthly in advance. The price shown
              at checkout is what you pay; VAT is added where applicable
              based on your billing country. Stripe handles all
              card processing — we never see your card details.
            </p>
            <p>
              You can cancel anytime from your account settings. Cancel
              now and you keep access until the end of the current
              billing period; we don&apos;t pro-rate refunds for partial
              months. If you&apos;re an Irish or EU consumer, you have a
              14-day cancellation right under EU Distance Selling
              regulations — email us within 14 days of first signup for a
              full refund.
            </p>
            <p>
              We may change prices. If we do, we&apos;ll email account
              holders at least 30 days before the change applies. You
              can cancel before the change takes effect.
            </p>
          </Section>

          <Section id="plan-limits" title="5. Plan limits">
            <p>
              Each plan has caps — number of projects, tracked prompts,
              AI models, monthly runs, and brief credits. Hitting a cap
              means the relevant feature pauses until next month or
              until you upgrade. Caps are documented on the{" "}
              <Link
                href="/pricing"
                className="text-text-primary underline underline-offset-4"
              >
                pricing page
              </Link>{" "}
              and enforced in-app.
            </p>
          </Section>

          <Section id="acceptable-use" title="6. Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc ml-6 space-y-2 mt-3">
              <li>
                Resell, white-label, or sub-licence CMO.ie&apos;s output
                without an Agency tier subscription that explicitly
                permits it
              </li>
              <li>
                Run prompts that violate the AI providers&apos; terms
                (illegal content, attempts to extract training data,
                etc.)
              </li>
              <li>
                Use the service to track or expose personal information
                about identifiable individuals
              </li>
              <li>
                Reverse-engineer the service, scrape our pages, or
                replicate the dashboard
              </li>
              <li>
                Share your account credentials with users outside your
                organisation
              </li>
            </ul>
            <p className="mt-3">
              Breaches can result in immediate suspension. We&apos;ll
              tell you why and give 7 days to remedy where the breach is
              fixable.
            </p>
          </Section>

          <Section id="ip" title="7. Intellectual property">
            <p>
              You retain all rights to the brand names, prompts,
              competitor lists, and content briefs you produce on
              CMO.ie. We claim no ownership over your project data.
            </p>
            <p>
              The CMO.ie product itself — software, design, copy,
              database schemas, templates — is owned by Howl Ltd. You
              get a non-exclusive licence to use it while your
              subscription is active.
            </p>
          </Section>

          <Section id="liability" title="8. Liability">
            <p>
              Nothing in these terms limits liability for fraud, gross
              negligence, or anything that can&apos;t legally be limited
              under Irish law (e.g. death or personal injury caused by
              negligence).
            </p>
            <p>
              Subject to that, our total aggregate liability to you in
              any 12-month period is capped at the fees you paid us in
              that period. We&apos;re not liable for indirect or
              consequential losses (lost profits, lost data,
              reputational harm).
            </p>
          </Section>

          <Section id="termination" title="9. Termination">
            <p>
              You can close your account at any time. We can close your
              account if you breach these terms, fail to pay, or use the
              service in a way that exposes us to legal risk — with
              reasonable notice unless the breach is severe.
            </p>
            <p>
              On termination, we delete project data after a 90-day grace
              period (so you can reactivate if you change your mind).
              See the{" "}
              <Link
                href="/privacy#retention"
                className="text-text-primary underline underline-offset-4"
              >
                Privacy Policy
              </Link>{" "}
              for details.
            </p>
          </Section>

          <Section id="changes" title="10. Changes to these terms">
            <p>
              We may update these terms. For material changes (price,
              liability, scope of service) we&apos;ll email account
              holders 30 days before the change applies. Continued use
              after the change means you accept the new terms.
            </p>
          </Section>

          <Section id="law" title="11. Governing law">
            <p>
              These terms are governed by Irish law. Disputes go to the
              Irish courts. If you&apos;re a consumer in another EU
              member state, you may also have rights to bring proceedings
              in your home jurisdiction.
            </p>
          </Section>

          <Section id="contact" title="12. Contact">
            <p>
              Questions? Email{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-text-primary underline underline-offset-4"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-6 md:px-10 py-10 border-t border-border text-xs text-text-muted flex items-center justify-between flex-wrap gap-4">
        <p>© {new Date().getFullYear()} Howl.ie. Built in Dublin.</p>
        <nav className="flex items-center gap-6">
          <Link href="/terms" className="hover:text-text-primary">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-text-primary">
            Privacy
          </Link>
          <Link href="/pricing" className="hover:text-text-primary">
            Pricing
          </Link>
        </nav>
      </footer>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-text-primary">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm md:text-base">{children}</div>
    </section>
  );
}
