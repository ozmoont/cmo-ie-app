/**
 * /pricing — public pricing page.
 *
 * Four paid tiers + trial. The numbers are driven by PLAN_LIMITS in
 * lib/types.ts so if anyone bumps a prompt or model cap there, this
 * page follows automatically. The only hand-maintained piece is the
 * price itself; those get Stripe price IDs wired per env in Phase 5.
 */

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PLAN_LIMITS } from "@/lib/types";

export const metadata = {
  title: "Pricing — CMO.ie",
  description:
    "Track your AI visibility across ChatGPT, Claude, Perplexity, Gemini. Starter €249, Pro €499, Advanced €999.",
};

const DEMO_MAILTO = `mailto:hello@howl.ie?subject=${encodeURIComponent(
  "CMO.ie demo"
)}&body=${encodeURIComponent(
  "Hi — I'd like a 30-minute walkthrough of CMO.ie for our brand. Any slot next week works."
)}`;

export default function PricingPage() {
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
            <Link href="/agency" className="hover:text-text-primary">
              Agencies
            </Link>
            <Link href="/crawlability" className="hover:text-text-primary">
              Crawlability
            </Link>
            <Link href="/docs/api" className="hover:text-text-primary">
              API
            </Link>
            <Link href="/login" className="hover:text-text-primary">
              Log in
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-6 md:px-10 pt-16 md:pt-20 pb-12">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Pricing
        </p>
        <h1 className="mt-4 text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
          Pick a plan that matches your tracking intensity.
        </h1>
        <p className="mt-5 text-lg md:text-xl text-text-secondary leading-relaxed max-w-2xl">
          The difference between plans is how many prompts you track,
          how many AI models you check against, and how often you run.
          Actions, briefs, and the agency tier are layered on top.
        </p>
      </section>

      {/* ── Tier cards ── */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 pb-16 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        <TierCard
          name="Trial"
          price="Free"
          period="7 days"
          blurb="Kick the tyres — one project, one prompt, three models. Limited runs."
          limits={PLAN_LIMITS.trial}
          cta={{ label: "Start free", href: "/signup" }}
        />
        <TierCard
          name="Starter"
          price="€249"
          period="/ month"
          blurb="For a single brand you want to track seriously. 25 prompts, weekly runs."
          limits={PLAN_LIMITS.starter}
          cta={{ label: "Start Starter", href: "/signup?plan=starter" }}
        />
        <TierCard
          name="Pro"
          price="€499"
          period="/ month"
          blurb="Daily tracking across 4 AI models. Action plans + 20 briefs / month."
          limits={PLAN_LIMITS.pro}
          cta={{ label: "Start Pro", href: "/signup?plan=pro" }}
          featured
        />
        <TierCard
          name="Advanced"
          price="€999"
          period="/ month"
          blurb="Unlimited prompts, projects, and runs. Full Actions tier. All 5 models."
          limits={PLAN_LIMITS.advanced}
          cta={{ label: "Start Advanced", href: "/signup?plan=advanced" }}
        />
      </section>

      {/* ── Agency strip ── */}
      <section className="max-w-4xl mx-auto px-6 md:px-10 pb-20 border-t border-border pt-12">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          For agencies
        </p>
        <h2 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1]">
          Running 5+ client brands? Agency tier starts at €999/mo.
        </h2>
        <p className="mt-4 text-base text-text-secondary leading-relaxed max-w-2xl">
          Shared brief credit pool across every client, per-client caps,
          agency roll-up dashboard, REST API + MCP connector. Bring your
          own Anthropic / OpenAI / Perplexity keys (we bill zero markup
          on AI usage) or opt for managed-usage flat billing.
        </p>
        <div className="mt-6 flex items-center gap-4 flex-wrap">
          <Link
            href="/agency"
            className="inline-flex items-center gap-2 rounded-md bg-text-primary text-text-inverse text-sm font-medium px-5 py-3 hover:opacity-90 transition-opacity"
          >
            See agency pricing
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={DEMO_MAILTO}
            className="text-sm text-text-secondary hover:text-text-primary underline underline-offset-4"
          >
            Or book a demo
          </a>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-6 md:px-10 pb-20 border-t border-border pt-12 space-y-8">
        <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
        <Faq
          q="What counts as a run?"
          a="A run checks every active prompt × every selected model once. With 25 prompts and 2 models, one run = 50 AI queries. Starter allows 4 runs / month; Pro allows 30 (roughly one per day)."
        />
        <Faq
          q="What's a brief credit?"
          a="One brief = one action-plan-to-deliverable flow. A tailored content brief + draft output. Credits refill monthly. Starter: 5 / mo, Pro: 20 / mo, Advanced: 50 / mo."
        />
        <Faq
          q="Can I bring my own Anthropic / OpenAI keys?"
          a="Yes on every paid plan. Upload keys in Settings — your AI spend lands on your own card. Agency tier ships with BYOK as the expected default."
        />
        <Faq
          q="Which AI models are supported?"
          a="ChatGPT (GPT-4.1), Claude (Sonnet/Haiku), Perplexity (Sonar), Gemini (2.5). Microsoft Copilot and Grok are available on Advanced and Agency tiers. Google AI Overviews coverage ships when we sign off on the scraping contract."
        />
        <Faq
          q="How does data residency work for the Irish market?"
          a="We're a Dublin-based operator. Supabase EU region, Vercel's Dublin edge, all AI calls logged to our Irish Anthropic account. GDPR compliance is table-stakes."
        />
        <Faq
          q="Can I cancel any time?"
          a="Month-to-month. Cancel in Settings → Billing, takes effect at the end of the current cycle. No claw-back on credits consumed."
        />
      </section>

      <footer className="max-w-5xl mx-auto px-6 md:px-10 py-10 border-t border-border text-xs text-text-muted flex items-center justify-between flex-wrap gap-4">
        <p>© {new Date().getFullYear()} Howl.ie. Built in Dublin.</p>
        <nav className="flex items-center gap-6">
          <Link href="/agency" className="hover:text-text-primary">
            Agencies
          </Link>
          <Link href="/crawlability" className="hover:text-text-primary">
            Crawlability
          </Link>
          <Link href="/docs/api" className="hover:text-text-primary">
            API docs
          </Link>
        </nav>
      </footer>
    </div>
  );
}

function TierCard({
  name,
  price,
  period,
  blurb,
  limits,
  cta,
  featured,
}: {
  name: string;
  price: string;
  period: string;
  blurb: string;
  limits: (typeof PLAN_LIMITS)[keyof typeof PLAN_LIMITS];
  cta: { label: string; href: string };
  featured?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border p-6 ${
        featured
          ? "border-emerald-dark bg-emerald-dark/5"
          : "border-border bg-surface"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.15em] font-semibold text-text-muted">
        {name}
      </p>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tracking-tight">{price}</span>
        <span className="text-sm text-text-muted">{period}</span>
      </p>
      <p className="mt-3 text-sm text-text-secondary leading-relaxed">
        {blurb}
      </p>
      <ul className="mt-5 space-y-2 text-sm text-text-primary flex-1">
        <LimitRow label="Projects" value={formatLimit(limits.projects)} />
        <LimitRow label="Prompts per project" value={formatLimit(limits.prompts)} />
        <LimitRow label="AI models" value={formatLimit(limits.models)} />
        <LimitRow
          label="Runs / month"
          value={
            limits.runsPerMonth === Infinity
              ? "Unlimited"
              : `${limits.runsPerMonth}`
          }
        />
        <LimitRow label="Competitors tracked" value={formatLimit(limits.competitors)} />
        <LimitRow
          label="Brief credits"
          value={
            limits.briefCredits === Infinity
              ? "Unlimited"
              : `${limits.briefCredits} / month`
          }
        />
        <LimitRow
          label="Action plan depth"
          value={actionTierLabel(limits.actionTier)}
        />
      </ul>
      <Link
        href={cta.href}
        className={`mt-6 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium px-4 py-2.5 transition-opacity ${
          featured
            ? "bg-text-primary text-text-inverse hover:opacity-90"
            : "border border-border hover:border-text-primary text-text-primary"
        }`}
      >
        {cta.label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="h-4 w-4 text-emerald-dark mt-0.5 shrink-0" />
      <span className="flex-1">
        <span className="text-text-secondary">{label}:</span>{" "}
        <span className="font-medium">{value}</span>
      </span>
    </li>
  );
}

function formatLimit(n: number): string {
  return n === Infinity ? "Unlimited" : String(n);
}

function actionTierLabel(
  tier: "gaps" | "strategy" | "full"
): string {
  if (tier === "gaps") return "Gap insights";
  if (tier === "strategy") return "Strategy + briefs";
  return "Full (briefs + drafts)";
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <p className="text-base font-semibold text-text-primary">{q}</p>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed">{a}</p>
    </div>
  );
}
