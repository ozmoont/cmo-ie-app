/**
 * /agency — public marketing page for the Agency tier.
 *
 * Editorial layout matching the rest of the marketing site — tight
 * type, minimal chrome, black/emerald palette. No signup is initiated
 * from here directly; the CTAs route to a Calendly-compatible
 * `mailto:` fallback until we wire a real booking widget.
 */

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Users2,
  KeyRound,
  Sparkles,
  BarChart3,
  Globe,
} from "lucide-react";

export const metadata = {
  title: "CMO.ie for agencies",
  description:
    "Run AI-visibility tracking for every client in one place. Pooled credits, per-client caps, roll-up dashboards, API + MCP access.",
};

const DEMO_EMAIL = "hello@howl.ie";
const DEMO_SUBJECT = "CMO.ie agency demo";
const DEMO_BODY =
  "Hi — I'd like a 30-minute walkthrough of the CMO.ie agency tier for a mid-sized agency managing 5-15 client brands. Happy with any slot next week.";
const demoHref = `mailto:${DEMO_EMAIL}?subject=${encodeURIComponent(DEMO_SUBJECT)}&body=${encodeURIComponent(DEMO_BODY)}`;

export default function AgencyLandingPage() {
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      {/* ── Top nav ── */}
      <header className="px-6 md:px-10 py-5 border-b border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight hover:text-emerald-dark transition-colors"
          >
            CMO.ie
          </Link>
          <nav className="flex items-center gap-6 text-sm text-text-secondary">
            <Link href="/docs/api" className="hover:text-text-primary">
              API
            </Link>
            <Link href="/docs/mcp" className="hover:text-text-primary">
              MCP
            </Link>
            <Link href="/login" className="hover:text-text-primary">
              Log in
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-12">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          For agencies
        </p>
        <h1 className="mt-4 text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
          Run AI-visibility tracking for every client — on one plan.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-text-secondary leading-relaxed max-w-2xl">
          A shared credit pool across every client. Per-client caps so one
          account can&apos;t blow the budget. A single roll-up view of who
          needs attention this week. Plus the REST API + MCP server, so you
          can pipe visibility into your own stack or ask Claude about
          client performance in-chat.
        </p>
        <div className="mt-10 flex items-center gap-4 flex-wrap">
          <a
            href={demoHref}
            className="inline-flex items-center gap-2 rounded-md bg-text-primary text-text-inverse text-sm font-medium px-5 py-3 hover:opacity-90 transition-opacity"
          >
            Book a 30-min demo
            <ArrowRight className="h-4 w-4" />
          </a>
          <Link
            href="/signup"
            className="text-sm text-text-secondary hover:text-text-primary underline underline-offset-4"
          >
            Or start with a trial
          </Link>
        </div>
      </section>

      {/* ── Why agencies ── */}
      <section className="max-w-5xl mx-auto px-6 md:px-10 py-16 border-t border-border">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3 mb-4">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          What you get
        </p>
        <div className="grid md:grid-cols-2 gap-10">
          <Feature
            icon={Users2}
            title="One credit pool for every client"
            body="Bulk-buy briefs at a better rate. Spend them anywhere you need this month, not per-project quotas that don't match how agencies work."
          />
          <Feature
            icon={BarChart3}
            title="Roll-up dashboard"
            body="Every client in one view — visibility score, open gaps, last-run date, trend sparkline. Click through to the full project when you want detail."
          />
          <Feature
            icon={Sparkles}
            title="Gap-aware brief generator"
            body="Every client gap gets a tailored brief — editorial pitch, community reply, directory submission. Hand it to your content team or the CMO.ie polish queue."
          />
          <Feature
            icon={KeyRound}
            title="REST API + MCP server"
            body="Pipe visibility into Looker, Sheets, or Claude itself. Scoped tokens per client, rate-limited, documented."
          />
          <Feature
            icon={Globe}
            title="Per-client caps"
            body="Ring-fence each client's credit usage so a demanding account can't drain the pool mid-month. Adjustable any time."
          />
          <Feature
            icon={Check}
            title="Built in Ireland"
            body="Howl.ie ships and maintains this product. Local support, Irish-market prompt defaults, no transatlantic Slack handoffs for a bug fix."
          />
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="max-w-5xl mx-auto px-6 md:px-10 py-16 border-t border-border">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3 mb-4">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Pricing
        </p>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1] mb-4">
          Agency plans start at €500/mo.
        </h2>
        <p className="text-base text-text-secondary leading-relaxed max-w-2xl mb-10">
          Pricing scales with the credit pool. Unlimited projects, prompts,
          and competitors across every plan — credits are the only thing
          that varies. All plans include the REST API, MCP server, and
          per-client caps.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          <PricingTier
            name="Starter"
            price="€500"
            credits="100 briefs / month"
            blurb="For small agencies managing 3-5 client brands."
            features={[
              "100 pooled brief credits",
              "Unlimited projects",
              "Roll-up dashboard",
              "REST API + MCP",
              "Email support",
            ]}
          />
          <PricingTier
            name="Growth"
            price="€1,000"
            credits="250 briefs / month"
            featured
            blurb="For agencies running AI-search tracking as a live product line."
            features={[
              "250 pooled brief credits",
              "Everything in Starter",
              "Per-client caps",
              "Slack-based support",
              "Quarterly roadmap call",
            ]}
          />
          <PricingTier
            name="Scale"
            price="€2,000"
            credits="600 briefs / month"
            blurb="For agencies running 15+ client brands and resale."
            features={[
              "600 pooled brief credits",
              "Everything in Growth",
              "Priority support",
              "Custom source classifiers",
              "Dedicated Howl.ie contact",
            ]}
          />
        </div>
        <p className="mt-6 text-xs text-text-muted">
          Annual commitment unlocks a 15% discount on all tiers. Custom
          pricing for &gt;1,000 briefs / month — talk to us.
        </p>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-4xl mx-auto px-6 md:px-10 py-16 border-t border-border">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3 mb-6">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          How it works
        </p>
        <ol className="space-y-6 text-base text-text-secondary leading-relaxed">
          <Step
            n={1}
            title="Spin up a project per client."
            body="Each project carries its own brand profile, prompt library, competitor set, and country defaults. Share the exact same URL with client stakeholders — they see only what you want them to see."
          />
          <Step
            n={2}
            title="Track the AI queries that matter to each client."
            body="AI-generated suggestions by sector and country (Ireland, UK, US, DE, FR). CSV bulk upload when you already have a prompt library from a parent strategy doc."
          />
          <Step
            n={3}
            title="The roll-up dashboard tells you where to look."
            body="Every Monday morning, one page tells you which clients dropped, which have fresh gaps to act on, and which are due for a new brief."
          />
          <Step
            n={4}
            title="Act in one click — or export the data and run it through your stack."
            body="Click &quot;Act on this&quot; on any gap and get a tailored brief in 30s. Or use the REST API to feed visibility into Looker, Data Studio, or a Slack digest."
          />
        </ol>
      </section>

      {/* ── Closing CTA ── */}
      <section className="max-w-4xl mx-auto px-6 md:px-10 py-20 border-t border-border">
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
          See it with your clients&apos; prompts, not ours.
        </h2>
        <p className="mt-5 text-base text-text-secondary leading-relaxed max-w-2xl">
          Book a 30-minute walkthrough. We&apos;ll spin up a live project
          with three of your actual clients (or fake ones if you prefer),
          run the visibility check, and show you the roll-up + a real gap
          brief before the call ends.
        </p>
        <div className="mt-8">
          <a
            href={demoHref}
            className="inline-flex items-center gap-2 rounded-md bg-text-primary text-text-inverse text-sm font-medium px-5 py-3 hover:opacity-90 transition-opacity"
          >
            Book a demo
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <footer className="max-w-5xl mx-auto px-6 md:px-10 py-10 border-t border-border text-xs text-text-muted flex items-center justify-between flex-wrap gap-4">
        <p>© {new Date().getFullYear()} Howl.ie. Built in Dublin.</p>
        <nav className="flex items-center gap-6">
          <Link href="/docs/api" className="hover:text-text-primary">
            API docs
          </Link>
          <Link href="/docs/mcp" className="hover:text-text-primary">
            MCP
          </Link>
          <Link href="/login" className="hover:text-text-primary">
            Log in
          </Link>
        </nav>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <Icon className="h-5 w-5 text-emerald-dark shrink-0 mt-1" />
      <div>
        <p className="text-base font-semibold text-text-primary">{title}</p>
        <p className="mt-1 text-sm text-text-secondary leading-relaxed">
          {body}
        </p>
      </div>
    </div>
  );
}

function PricingTier({
  name,
  price,
  credits,
  blurb,
  features,
  featured,
}: {
  name: string;
  price: string;
  credits: string;
  blurb: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <div
      className={`border rounded-lg p-6 flex flex-col ${
        featured
          ? "border-emerald-dark bg-emerald-dark/5"
          : "border-border bg-surface"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.15em] font-semibold text-text-muted">
        {name}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">
        {price}
        <span className="text-sm text-text-muted font-normal"> / month</span>
      </p>
      <p className="mt-1 font-mono tabular-nums text-xs text-text-muted">
        {credits}
      </p>
      <p className="mt-4 text-sm text-text-secondary leading-relaxed">{blurb}</p>
      <ul className="mt-5 space-y-2 text-sm text-text-primary flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-emerald-dark mt-0.5 shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="grid grid-cols-[40px_1fr] gap-4">
      <span className="font-mono tabular-nums text-sm font-semibold text-emerald-dark pt-1">
        {String(n).padStart(2, "0")}
      </span>
      <div>
        <p className="text-lg font-semibold text-text-primary leading-snug">
          {title}
        </p>
        <p className="mt-1 text-base text-text-secondary leading-relaxed">
          {body}
        </p>
      </div>
    </li>
  );
}
