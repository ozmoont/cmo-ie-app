/**
 * /privacy — Privacy Policy.
 *
 * Drafted from common Irish SaaS / GDPR-aligned starting points so we
 * have something legally usable from day one. Swap in the exact
 * Howl.ie wording when ready by replacing the body sections below;
 * the page structure (headings, IDs for deep-linking, last-updated
 * line) should stay so changelog tracking still works.
 *
 * Required fields per GDPR / DPC guidance:
 *   - Identity of the data controller (Howl.ie)
 *   - Categories of data collected
 *   - Lawful basis for processing
 *   - Data subjects' rights (access, rectification, erasure, etc.)
 *   - Contact for DPO / privacy queries
 *   - International transfers (Anthropic / OpenAI / Vercel are US-based)
 */

import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — CMO.ie",
  description:
    "How CMO.ie collects, uses, and protects your data. GDPR-aligned, Irish-jurisdiction.",
};

const LAST_UPDATED = "25 April 2026";
const CONTACT_EMAIL = "privacy@howl.ie";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      {/* ── Top bar ── */}
      <header className="px-6 md:px-10 py-5 border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight hover:text-emerald-dark transition-colors"
          >
            CMO.ie
          </Link>
          <nav className="flex items-center gap-6 text-sm text-text-secondary">
            <Link href="/terms" className="hover:text-text-primary">
              Terms
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
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm text-text-muted">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-10 text-text-secondary leading-relaxed">
          <Section id="who-we-are" title="1. Who we are">
            <p>
              CMO.ie is a product of Howl Ltd. (trading as Howl.ie), a
              company registered in Ireland. For privacy purposes, Howl
              Ltd. is the data controller for any personal data processed
              through CMO.ie.
            </p>
            <p>
              You can contact us about anything in this policy at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-text-primary underline underline-offset-4"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section id="what-we-collect" title="2. What data we collect">
            <p>
              We collect three categories of data when you use CMO.ie:
            </p>
            <ul className="list-disc ml-6 space-y-2 mt-3">
              <li>
                <strong>Account data:</strong> name, email, company name,
                hashed password (or OAuth identifier).
              </li>
              <li>
                <strong>Project data:</strong> brand names, website URLs,
                tracked prompts, competitor names, brand profiles you
                enter, and the AI responses we record on your behalf.
              </li>
              <li>
                <strong>Billing data:</strong> when you subscribe to a
                paid plan, Stripe processes your card details. We never
                see or store your card number — only Stripe&apos;s customer
                ID and the resulting subscription state (plan, status,
                period).
              </li>
            </ul>
            <p className="mt-3">
              We don&apos;t use cookies for advertising or third-party
              tracking. The only cookies we set are essential session
              cookies for keeping you logged in.
            </p>
          </Section>

          <Section id="how-we-use" title="3. How we use your data">
            <p>
              We use account and project data to operate CMO.ie — running
              visibility checks against AI models, generating action
              plans and content briefs, and showing you the results in
              your dashboard. We use billing data only for billing.
            </p>
            <p>
              We do not sell, rent, or share your data with third parties
              for marketing. We do not use your project data to train AI
              models.
            </p>
          </Section>

          <Section id="lawful-basis" title="4. Lawful basis (GDPR Art. 6)">
            <p>
              Processing of account and project data happens under{" "}
              <strong>contract</strong> (Art. 6(1)(b)) — the data is
              necessary to provide the service you signed up for.
              Marketing emails (if you opt in) happen under{" "}
              <strong>consent</strong> (Art. 6(1)(a)). Fraud prevention
              and security logging happens under{" "}
              <strong>legitimate interest</strong> (Art. 6(1)(f)).
            </p>
          </Section>

          <Section id="ai-providers" title="5. AI providers and international transfers">
            <p>
              When you run a visibility check or generate an action plan,
              we send your prompts (and limited brand context) to AI
              providers — currently Anthropic, OpenAI, Google, Perplexity
              and xAI. These providers are based in the United States.
              Transfers happen under EU Standard Contractual Clauses
              (SCCs) and the EU-US Data Privacy Framework where the
              provider is certified.
            </p>
            <p>
              We never send personal customer data to AI providers — the
              prompts are about your brand and category, not about
              identifiable individuals.
            </p>
          </Section>

          <Section id="retention" title="6. How long we keep your data">
            <p>
              While your subscription is active, we keep project data so
              you can see historical visibility trends. After you cancel
              and don&apos;t reactivate within 90 days, we delete project
              data permanently. Account records are kept for 7 years
              after closure for tax and legal purposes (Irish Revenue
              requirement).
            </p>
          </Section>

          <Section id="your-rights" title="7. Your rights">
            <p>
              Under GDPR you have the right to access, rectify, erase,
              restrict processing of, and port your personal data. You
              also have the right to object to processing and to lodge a
              complaint with the Irish Data Protection Commission (
              <a
                href="https://www.dataprotection.ie"
                className="text-text-primary underline underline-offset-4"
                target="_blank"
                rel="noopener noreferrer"
              >
                dataprotection.ie
              </a>
              ).
            </p>
            <p>
              To exercise any right, email us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-text-primary underline underline-offset-4"
              >
                {CONTACT_EMAIL}
              </a>
              . We respond within 30 days.
            </p>
          </Section>

          <Section id="security" title="8. Security">
            <p>
              We host on Vercel (EU edge for serving, US for compute) and
              Supabase (EU region for our database). Passwords are hashed
              with bcrypt; in transit, all traffic is TLS 1.2+; at rest,
              database storage and backups are encrypted with AES-256.
              Access to production data is limited to named Howl Ltd.
              staff with audit logging.
            </p>
          </Section>

          <Section id="changes" title="9. Changes to this policy">
            <p>
              When we change this policy materially, we&apos;ll email
              account holders at least 30 days before the change takes
              effect. The &quot;last updated&quot; date at the top of
              this page tracks the most recent revision.
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
