import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Eye,
  TrendingUp,
  MessageCircle,
  ArrowRight,
  Check,
  BarChart3,
  Search,
  FileText,
  Sparkles,
  Lightbulb,
} from "lucide-react";

/**
 * / — public homepage.
 *
 * Hosts the full landing page. The "Get early access" teaser was
 * collapsed into this route on launch (29 April 2026); this file
 * was previously src/app/preview/page.tsx, robots-noindexed.
 *
 * Indexable now — root layout's metadata supplies the title + OG +
 * indexable robots flags. Don't add a local metadata override here
 * unless you intend to shadow the root layout.
 *
 * If you need to ship a coming-soon page again (e.g. ahead of a major
 * relaunch), the previous teaser lives in git history at the commit
 * "feat: launching-soon teaser homepage with email capture"
 * (e840115). Cherry-pick it back if needed.
 */

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Navigation ── */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-8 py-4 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="text-xl md:text-2xl font-bold text-text-primary">
          <span className="md:hidden">CMO.ie</span>
          <span className="hidden md:inline">Chief Marketing Officer</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Features</a>
          <a href="#how-it-works" className="text-sm text-text-secondary hover:text-text-primary transition-colors">How It Works</a>
          <a href="#pricing" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Pricing</a>
          <a href="#faq" className="text-sm text-text-secondary hover:text-text-primary transition-colors">FAQ</a>
        </div>
        <div className="flex gap-2 md:gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="md:h-10 md:px-5 md:text-sm">
              Login
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="default" size="sm" className="md:h-10 md:px-5 md:text-sm">
              <span className="md:hidden">Try Free</span>
              <span className="hidden md:inline">Start Free Trial</span>
            </Button>
          </Link>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="hero-mesh flex items-center justify-center px-4 md:px-8 py-16 md:py-32 bg-background">
        <div className="max-w-4xl text-center space-y-8">
          {/* Quiet badge - slim border, no fill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border text-sm text-text-secondary">
            <Sparkles className="w-3.5 h-3.5" />
            AI Search Visibility for Irish Brands
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight text-text-primary">
            Know exactly how AI talks about your brand
          </h1>

          <p className="text-xl text-text-secondary leading-relaxed max-w-2xl mx-auto">
            CMO.ie monitors ChatGPT, Perplexity, Gemini, and Google AI Overviews
            daily - showing you when your brand gets mentioned, where you rank,
            and what to do about it.
          </p>

          {/* Monochrome tags - outlined, consistent */}
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-text-primary text-sm font-medium">
              <Eye className="w-4 h-4" />
              Visibility
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-text-primary text-sm font-medium">
              <TrendingUp className="w-4 h-4" />
              Position
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-text-primary text-sm font-medium">
              <MessageCircle className="w-4 h-4" />
              Sentiment
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/signup">
              <Button variant="default" size="lg" className="w-full sm:w-auto text-base px-8">
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-8">
                See How It Works
              </Button>
            </a>
          </div>

          <p className="text-sm text-text-muted">
            7-day free trial &middot; No credit card required &middot; Set up in 5 minutes
          </p>
        </div>
      </section>

      {/* ── Dashboard Preview ──
          Mirrors the real editorial dashboard: kicker + hero metric +
          attention block + a couple of project rows. Browser chrome kept
          to ground it as "the app". Shadow softened from 2xl to lg - less
          SaaS-hype drop shadow, more subtle elevation. */}
      <section className="px-4 md:px-8 pb-12 md:pb-20 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-xl border border-border bg-surface shadow-lg overflow-hidden">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-muted">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-border-strong" />
                <div className="w-2.5 h-2.5 rounded-full bg-border-strong" />
                <div className="w-2.5 h-2.5 rounded-full bg-border-strong" />
              </div>
              <div className="ml-2 flex-1 max-w-xs bg-background border border-border rounded px-3 py-1">
                <span className="text-xs text-text-muted font-mono">app.cmo.ie/dashboard</span>
              </div>
            </div>

            {/* Shell header */}
            <div className="border-b border-border bg-surface px-4 md:px-6 h-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold tracking-tight text-text-primary">
                  CMO.ie
                </span>
                <span className="text-xs text-text-secondary">
                  Acme Legal
                  <span className="ml-2 inline-flex items-center rounded-full border border-border px-1.5 py-0 text-[9px] font-medium text-text-secondary uppercase tracking-wider">
                    Pro
                  </span>
                </span>
              </div>
              <span className="hidden md:inline text-xs text-text-muted">
                you@acmelegal.ie
              </span>
            </div>

            {/* Main content - editorial dashboard */}
            <div className="p-6 md:p-10 bg-background space-y-8">
              {/* Page header */}
              <div className="grid grid-cols-12 gap-4 items-end pb-6 md:pb-8 border-b border-border">
                <div className="col-span-8 md:col-span-9">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-dark font-semibold">
                    Dashboard · Friday, 17 April
                  </p>
                  <p className="mt-2 text-xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                    Welcome back, odhran.
                  </p>
                </div>
                <div className="col-span-4 md:col-span-3 flex justify-end">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-text-primary text-text-inverse text-[11px] font-medium">
                    + New project
                  </div>
                </div>
              </div>

              {/* Hero metric + attention */}
              <div className="grid grid-cols-12 gap-4 md:gap-8 pb-6 md:pb-8 border-b border-border">
                <p className="col-span-12 md:col-span-3 text-[10px] uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-3 flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block w-3 h-[2px] bg-emerald-dark" />
                  Portfolio visibility
                </p>
                <div className="col-span-12 md:col-span-6">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono tabular-nums text-5xl md:text-6xl font-medium text-text-primary leading-none">
                      54
                    </span>
                    <span className="font-mono tabular-nums text-xl md:text-2xl text-text-muted leading-none">
                      %
                    </span>
                  </div>
                  <p className="mt-3 text-xs md:text-sm text-text-secondary leading-relaxed">
                    Up 3 points since Monday across your 2 projects.
                  </p>
                </div>
                <div className="col-span-12 md:col-span-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-dark font-semibold">
                    Needs attention
                  </p>
                  <div>
                    <p className="text-xs font-semibold text-text-primary flex items-center gap-2">
                      <span aria-hidden="true" className="inline-block w-1 h-1 rounded-full bg-danger" />
                      Beta Ltd
                    </p>
                    <p className="text-[10px] text-danger ml-[10px]">
                      Down 14% since last week
                    </p>
                  </div>
                </div>
              </div>

              {/* Project rows */}
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-dark font-semibold mb-1">
                  Projects · 2
                </p>
                <ul>
                  {[
                    {
                      name: "Acme Legal",
                      meta: "acmelegal.ie · ChatGPT, Perplexity · 2h ago",
                      score: 67,
                      delta: 5,
                      action: "Review wins",
                      kind: "up",
                    },
                    {
                      name: "Beta Ltd",
                      meta: "beta.ie · ChatGPT, Gemini · 3h ago",
                      score: 41,
                      delta: -14,
                      action: "Review gaps",
                      kind: "down",
                    },
                  ].map((p) => (
                    <li key={p.name}>
                      <div className="grid grid-cols-12 gap-4 py-4 border-t border-border items-center">
                        <div className="col-span-5 min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-text-secondary mt-0.5 truncate">
                            {p.meta}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="font-mono tabular-nums text-xl font-medium text-text-primary leading-none">
                            {p.score}
                            <span className="text-xs text-text-muted">%</span>
                          </p>
                          <p className="text-[9px] uppercase tracking-[0.15em] text-text-muted mt-1 font-semibold">
                            Visibility
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p
                            className={`font-mono tabular-nums text-sm font-medium ${p.kind === "up" ? "text-emerald-dark" : "text-danger"}`}
                          >
                            {p.delta > 0 ? "+" : ""}
                            {p.delta}
                            <span className="text-[10px] text-text-muted">%</span>
                          </p>
                          <p className="text-[9px] uppercase tracking-[0.15em] text-text-muted mt-1 font-semibold">
                            7-day
                          </p>
                        </div>
                        <div className="col-span-3 text-right">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${p.kind === "up" ? "text-emerald-dark" : "text-danger"}`}
                          >
                            {p.action}
                            <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="px-4 md:px-8 py-12 border-y border-border bg-surface">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs text-emerald-dark mb-8 uppercase tracking-[0.2em] font-semibold">
            Built for Irish brands, agencies, and marketing teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 opacity-40">
            {["Brand Co", "Dublin Agency", "Irish Retail", "Tech Ireland", "Health.ie", "Finance.ie"].map((name) => (
              <span key={name} className="text-lg font-semibold text-text-secondary">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Core Metrics Deep Dive ──
          Three numbered editorial pairs. Visuals sit flat on the surface
          with a single hairline rule separating them from the body copy;
          no card wrappers, no drop shadows, no pill-shaped kicker tags. */}
      <section id="features" className="px-4 md:px-8 py-20 md:py-28 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-12 gap-6 md:gap-12 mb-16 md:mb-20">
            <p className="md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2 flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
              AI Search Metrics
            </p>
            <div className="md:col-span-9 max-w-3xl">
              <h2 className="text-3xl md:text-5xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                Understand how AI sees your brand.
              </h2>
              <p className="text-lg text-text-secondary mt-6 leading-relaxed max-w-2xl">
                Three core dimensions, tracked across every AI model every day -
                a complete picture of your brand&apos;s AI presence.
              </p>
            </div>
          </div>

          {/* ── 01 · Visibility ── */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-20 items-center py-12 md:py-20 border-t border-border">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mb-4 font-mono tabular-nums">
                01 · Visibility
              </p>
              <h3 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.15] mb-5">
                Are you showing up when customers ask AI?
              </h3>
              <p className="text-base text-text-secondary leading-relaxed mb-6 max-w-lg">
                How often your brand appears in AI-generated responses. When
                someone asks ChatGPT for &ldquo;best Irish accountants&rdquo; or
                Perplexity for &ldquo;top Dublin restaurants&rdquo; - are you in
                the answer?
              </p>
              <ul className="space-y-2.5 text-sm text-text-secondary">
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Track mention rates across ChatGPT, Perplexity, Gemini, and AI Overviews
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Compare against competitors over time
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Spot drops early - before they impact your pipeline
                </li>
              </ul>
            </div>
            {/* Visual - flat, no card chrome */}
            <div className="space-y-4">
              <div className="flex items-baseline justify-between pb-3 border-b border-border">
                <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold">
                  Visibility over time
                </p>
                <p className="text-xs text-text-muted">Last 30 days</p>
              </div>
              <div className="space-y-4">
                {[
                  { name: "Your brand", pct: 47, isYou: true },
                  { name: "Competitor A", pct: 62, isYou: false },
                  { name: "Competitor B", pct: 35, isYou: false },
                  { name: "Competitor C", pct: 21, isYou: false },
                ].map((item) => (
                  <div key={item.name}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span
                        className={
                          item.isYou
                            ? "text-text-primary font-semibold"
                            : "text-text-secondary"
                        }
                      >
                        {item.name}
                      </span>
                      <span className="font-mono tabular-nums text-text-primary">
                        {item.pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-hover">
                      <div
                        className={`h-1.5 rounded-full ${item.isYou ? "bg-emerald-dark" : "bg-border-strong"}`}
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 02 · Position ── */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-20 items-center py-12 md:py-20 border-t border-border">
            {/* Visual first on mobile, second on desktop */}
            <div className="order-2 md:order-1 space-y-4">
              <div className="flex items-baseline justify-between pb-3 border-b border-border">
                <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold">
                  Position rankings
                </p>
                <p className="text-xs text-text-muted">Across 50 prompts</p>
              </div>
              <ul className="divide-y divide-border">
                {[
                  { prompt: "Best CRM for small businesses", pos: 1 },
                  { prompt: "Top project management tools", pos: 3 },
                  { prompt: "Affordable accounting software Ireland", pos: 2 },
                  { prompt: "Enterprise HR solutions", pos: 5 },
                  { prompt: "Best Irish SaaS companies", pos: 1 },
                ].map((item) => (
                  <li
                    key={item.prompt}
                    className="flex items-center justify-between py-3"
                  >
                    <span className="text-sm text-text-secondary truncate mr-4">
                      {item.prompt}
                    </span>
                    <span
                      className={`font-mono tabular-nums text-base font-semibold shrink-0 ${item.pos <= 2 ? "text-emerald-dark" : item.pos <= 4 ? "text-text-primary" : "text-text-muted"}`}
                    >
                      #{item.pos}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="order-1 md:order-2">
              <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mb-4 font-mono tabular-nums">
                02 · Position
              </p>
              <h3 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.15] mb-5">
                Where do you rank when AI recommends?
              </h3>
              <p className="text-base text-text-secondary leading-relaxed mb-6 max-w-lg">
                Being mentioned is one thing - but are you first, third, or
                buried? Position tracking shows exactly where you sit in AI
                recommendation lists. First gets the click. Fifth gets ignored.
              </p>
              <ul className="space-y-2.5 text-sm text-text-secondary">
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Your exact rank, every tracked prompt
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Track position changes daily - climbing or slipping
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Benchmark against competitors per prompt
                </li>
              </ul>
            </div>
          </div>

          {/* ── 03 · Sentiment ── */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-20 items-center py-12 md:py-20 border-y border-border">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mb-4 font-mono tabular-nums">
                03 · Sentiment
              </p>
              <h3 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.15] mb-5">
                What is AI actually saying about you?
              </h3>
              <p className="text-base text-text-secondary leading-relaxed mb-6 max-w-lg">
                AI doesn&apos;t just mention brands - it describes them. Is
                ChatGPT calling you &ldquo;innovative&rdquo; or
                &ldquo;outdated&rdquo;? Is Perplexity recommending you
                enthusiastically or with caveats?
              </p>
              <ul className="space-y-2.5 text-sm text-text-secondary">
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Positive, neutral, negative scoring per mention
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Track shifts over time - catch reputation issues early
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Read the actual AI responses that mention your brand
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <div className="flex items-baseline justify-between pb-3 border-b border-border">
                <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold">
                  Sentiment breakdown
                </p>
                <p className="text-xs text-text-muted">This month</p>
              </div>
              <div className="flex items-baseline gap-6 pb-2">
                <span className="font-mono tabular-nums text-5xl md:text-6xl font-medium text-emerald-dark leading-none">
                  72
                </span>
                <span className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold">
                  Overall score
                </span>
              </div>
              <div className="space-y-3 pt-2">
                {[
                  { label: "Positive", pct: 68, colour: "bg-emerald-dark" },
                  { label: "Neutral", pct: 24, colour: "bg-border-strong" },
                  { label: "Negative", pct: 8, colour: "bg-danger" },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-text-secondary">{row.label}</span>
                      <span className="font-mono tabular-nums text-text-primary">
                        {row.pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-hover">
                      <div
                        className={`h-1.5 rounded-full ${row.colour}`}
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ──
          Four editorial steps. Numbered circles replaced with tabular
          numerals; paired mockups flattened from cards into hairline-ruled
          form summaries / lists that still show "what you'll see". */}
      <section id="how-it-works" className="px-4 md:px-8 py-20 md:py-28 bg-surface border-y border-border">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-12 gap-6 md:gap-12 mb-16 md:mb-20">
            <p className="md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2 flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
              Getting started
            </p>
            <div className="md:col-span-9 max-w-3xl">
              <h2 className="text-3xl md:text-5xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                From setup to insights in under five minutes.
              </h2>
              <p className="text-lg text-text-secondary mt-6 leading-relaxed max-w-2xl">
                No complex integrations, no developer needed. Tell us about
                your brand and we handle the rest.
              </p>
            </div>
          </div>

          {/* ── Step 01 · Add brand and competitors ── */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-20 items-start py-12 md:py-16 border-t border-border">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mb-4 font-mono tabular-nums">
                Step 01
              </p>
              <h3 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.15] mb-5">
                Add your brand and competitors.
              </h3>
              <p className="text-base text-text-secondary leading-relaxed mb-6 max-w-lg">
                Your brand name, website, and a brief description. Then the
                competitors you want to benchmark against.
              </p>
              <ul className="space-y-2.5 text-sm text-text-secondary">
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Brand profile with website and description
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Up to 10 competitors per project
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Auto-detected industry categories
                </li>
              </ul>
            </div>
            {/* Visual - form summary as a definition list, hairline rules */}
            <dl className="divide-y divide-border border-y border-border">
              {[
                ["Brand", "Your Brand Ltd"],
                ["Website", "yourbrand.ie"],
                ["Competitors", "Competitor A · Competitor B · Competitor C"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-[100px_1fr] md:grid-cols-[120px_1fr] gap-6 py-4"
                >
                  <dt className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold pt-0.5">
                    {k}
                  </dt>
                  <dd className="text-sm text-text-primary font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* ── Step 02 · Set up prompts ── */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-20 items-start py-12 md:py-16 border-t border-border">
            <ul className="order-2 md:order-1 divide-y divide-border border-y border-border">
              {[
                "Best accounting software for Irish SMEs",
                "Top Dublin marketing agencies 2026",
                "What CRM should I use for a small business?",
                "Recommended Irish health insurance providers",
              ].map((prompt) => (
                <li key={prompt} className="flex items-center gap-3 py-3.5">
                  <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <span className="text-sm text-text-primary">{prompt}</span>
                </li>
              ))}
            </ul>
            <div className="order-1 md:order-2">
              <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mb-4 font-mono tabular-nums">
                Step 02
              </p>
              <h3 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.15] mb-5">
                Define the prompts that define your brand.
              </h3>
              <p className="text-base text-text-secondary leading-relaxed mb-6 max-w-lg">
                The questions your customers are asking AI. These are the
                prompts we scan daily. Not sure where to start? We suggest
                prompts based on your industry and competitors.
              </p>
              <ul className="space-y-2.5 text-sm text-text-secondary">
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  AI-powered prompt suggestions
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Organise with tags and categories
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Track across Ireland, UK, or globally
                </li>
              </ul>
            </div>
          </div>

          {/* ── Step 03 · Choose AI models ── */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-20 items-start py-12 md:py-16 border-t border-border">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mb-4 font-mono tabular-nums">
                Step 03
              </p>
              <h3 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.15] mb-5">
                Choose the AI models that matter.
              </h3>
              <p className="text-base text-text-secondary leading-relaxed mb-6 max-w-lg">
                Select which AI platforms to monitor. We support the major
                models your customers are actually using - and we add new ones
                as they launch.
              </p>
              <ul className="space-y-2.5 text-sm text-text-secondary">
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  ChatGPT (GPT-4o, GPT-4.1)
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Google Gemini and AI Overviews
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Perplexity AI
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  More models added regularly
                </li>
              </ul>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {[
                { name: "ChatGPT", note: "GPT-4o · GPT-4.1" },
                { name: "Google Gemini", note: "Gemini 2.0 Flash" },
                { name: "Google AI Overviews", note: "Search-native" },
                { name: "Perplexity", note: "Sonar Pro" },
              ].map((model) => (
                <li
                  key={model.name}
                  className="flex items-center justify-between py-3.5"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {model.name}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {model.note}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-emerald-dark font-semibold">
                    <span
                      aria-hidden="true"
                      className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-dark"
                    />
                    Active
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Step 04 · Get insights & take action ── */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-20 items-start py-12 md:py-16 border-y border-border">
            <dl className="order-2 md:order-1 divide-y divide-border border-y border-border">
              {[
                {
                  title: "Gap analysis",
                  body: "Found 12 prompts where competitors appear but you don't.",
                  icon: BarChart3,
                },
                {
                  title: "Strategy",
                  body: "3 content recommendations to improve visibility by 20%+.",
                  icon: Lightbulb,
                },
                {
                  title: "Content brief",
                  body: "Ready-to-publish brief targeting \"best Irish CRM\" prompts.",
                  icon: FileText,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="grid grid-cols-[100px_1fr] md:grid-cols-[120px_1fr] gap-6 py-5"
                >
                  <dt className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-text-muted font-semibold">
                    <item.icon className="w-3.5 h-3.5" />
                    {item.title}
                  </dt>
                  <dd className="text-sm text-text-primary leading-relaxed">
                    {item.body}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="order-1 md:order-2">
              <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mb-4 font-mono tabular-nums">
                Step 04
              </p>
              <h3 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.15] mb-5">
                Get insights, then take action.
              </h3>
              <p className="text-base text-text-secondary leading-relaxed mb-6 max-w-lg">
                This is where CMO.ie goes beyond monitoring. The AI teams
                analyse your results, identify gaps, build strategy, and write
                content briefs - so you know exactly what to do next.
              </p>
              <ul className="space-y-2.5 text-sm text-text-secondary">
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  AI-powered gap analysis
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Strategic recommendations
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-dark flex-shrink-0 mt-0.5" />
                  Ready-to-use content briefs
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Three AI Teams ──
          Editorial numbered list (left-aligned, asymmetric grid, no cards).
          Breaks the "three-identical-cards-with-icons-above-headings" pattern
          Impeccable flags as an AI-slop fingerprint. Each row is a thin hairline
          of type + numeral, separated by generous vertical rhythm and a 1px rule. */}
      <section className="px-4 md:px-8 py-20 md:py-32 bg-background">
        <div className="max-w-6xl mx-auto">
          {/* Section intro - left-aligned, no centering */}
          <div className="grid md:grid-cols-12 gap-6 md:gap-12 mb-20 md:mb-28">
            <p className="md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold pt-2 flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
              AI Marketing Team
            </p>
            <div className="md:col-span-9 max-w-3xl">
              <h2 className="text-3xl md:text-5xl lg:text-6xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                Don&apos;t just monitor - act.
              </h2>
              <p className="text-lg md:text-xl text-text-secondary mt-6 leading-relaxed max-w-2xl">
                Most AI visibility tools stop at data. CMO.ie gives you three specialists
                who analyse the results and tell you exactly what to do next.
              </p>
            </div>
          </div>

          {/* Numbered editorial sequence */}
          <ol className="relative">
            {[
              {
                n: "01",
                role: "Analyst",
                name: "Gap Analyst",
                body: "Scans every prompt result to find where competitors appear but you don't. Identifies the exact content gaps costing you visibility.",
                caps: ["Competitor coverage mapping", "Missing topic identification", "Priority-ranked opportunities"],
              },
              {
                n: "02",
                role: "Strategist",
                name: "Strategist",
                body: "Takes the gap analysis and builds a concrete action plan. Specific content topics, SEO tactics, and citation strategies tailored to your market.",
                caps: ["Content topic recommendations", "Citation source strategy", "Effort vs. impact scoring"],
              },
              {
                n: "03",
                role: "Writer",
                name: "Brief Writer",
                body: "Generates publication-ready content briefs based on the strategy. Hand them to your content team or agency and start improving immediately.",
                caps: ["Blog post briefs", "FAQ page outlines", "Schema markup suggestions"],
              },
            ].map((item, i) => (
              <li
                key={item.n}
                className={`grid md:grid-cols-12 gap-4 md:gap-12 py-10 md:py-14 ${
                  i !== 0 ? "border-t border-border" : ""
                }`}
              >
                {/* Numeral + role kicker */}
                <div className="md:col-span-3 flex md:flex-col gap-4 md:gap-2 items-baseline md:items-start">
                  <span className="font-mono text-4xl md:text-5xl font-medium text-text-muted tabular-nums">
                    {item.n}
                  </span>
                  <span className="text-xs uppercase tracking-[0.15em] text-text-muted md:mt-4">
                    {item.role}
                  </span>
                </div>

                {/* Content */}
                <div className="md:col-span-9 max-w-2xl">
                  <h3 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight">
                    {item.name}
                  </h3>
                  <p className="mt-4 text-base md:text-lg text-text-secondary leading-relaxed">
                    {item.body}
                  </p>
                  <p className="mt-6 text-sm text-text-secondary/90">
                    {item.caps.join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* CTA - left-aligned, keeps the editorial rhythm */}
          <div className="grid md:grid-cols-12 gap-4 md:gap-12 pt-12 border-t border-border">
            <div className="md:col-start-4 md:col-span-9">
              <Link href="/signup">
                <Button variant="default" size="lg" className="text-base px-8">
                  Start Improving Your AI Visibility
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Prompt Tracking Section ── */}
      <section className="px-4 md:px-8 py-16 md:py-24 bg-surface border-y border-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-bold text-center mb-4 text-text-primary leading-tight">
            AI platforms are becoming the new search engines.<span className="hidden md:inline"><br /></span>
            <span className="text-text-secondary">Track the prompts that define your brand.</span>
          </h2>
          <p className="text-center text-text-secondary mb-16 text-lg max-w-2xl mx-auto">
            Your customers aren&apos;t just Googling anymore - they&apos;re asking AI. Define the questions that matter to your business and track how AI responds.
          </p>

          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              "What's the best digital marketing agency in Dublin?",
              "Which Irish banks have the best business accounts?",
              "Top-rated accounting software for Irish companies",
              "Best restaurants in Cork for business dinners",
              "Recommended solicitors in Galway for startups",
              "Which Irish health insurance is best value?",
              "Top coworking spaces in Dublin city centre",
              "Best Irish web hosting providers 2026",
            ].map((prompt) => (
              <div key={prompt} className="flex items-center gap-3 p-4 rounded-lg border border-border bg-background hover:border-border-strong transition-colors">
                <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
                <span className="text-sm text-text-primary">{prompt}</span>
                <span className="ml-auto text-xs text-text-muted whitespace-nowrap">Track Prompt</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Irish Brands ──
          Editorial 2×2 grid with internal hairline rules. No cards, no icons.
          Numerals carry the hierarchy; the asymmetric header aligns with the
          product surfaces. */}
      <section className="px-4 md:px-8 py-20 md:py-28 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-12 gap-6 md:gap-12 mb-16 md:mb-20">
            <p className="md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2 flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
              Built for Ireland
            </p>
            <div className="md:col-span-9 max-w-3xl">
              <h2 className="text-3xl md:text-5xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                Why Irish brands need AI search visibility.
              </h2>
              <p className="text-lg text-text-secondary mt-6 leading-relaxed max-w-2xl">
                The way Irish consumers find businesses is changing. AI-powered
                search is growing fast, and Irish brands that don&apos;t track their
                presence will fall behind.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 border-t border-border">
            {[
              {
                n: "01",
                title: "Local context",
                body: "AI models handle Irish queries differently. We track Ireland-specific prompts and results.",
              },
              {
                n: "02",
                title: "Brand safety",
                body: "Know immediately if AI starts saying something negative about your brand to Irish consumers.",
              },
              {
                n: "03",
                title: "Competitor intelligence",
                body: "See which Irish competitors are winning in AI search - and exactly how they're doing it.",
              },
              {
                n: "04",
                title: "Early mover advantage",
                body: "Most Irish brands aren't tracking AI visibility yet. Get ahead while the market is still forming.",
              },
            ].map((item, i) => (
              <div
                key={item.n}
                className={`py-10 md:py-14 md:px-10 ${
                  i % 2 === 1 ? "md:border-l md:border-border" : ""
                } ${
                  i >= 2 ? "border-t border-border" : ""
                } ${
                  i === 1 ? "border-t border-border md:border-t-0" : ""
                }`}
              >
                <div className="flex items-baseline gap-4 mb-4">
                  <span className="font-mono text-2xl text-text-muted tabular-nums">
                    {item.n}
                  </span>
                  <h3 className="text-xl md:text-2xl font-semibold text-text-primary tracking-tight">
                    {item.title}
                  </h3>
                </div>
                <p className="text-base text-text-secondary leading-relaxed max-w-lg">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ──
          Editorial pull-quote treatment: one large hero quote at the left-hand
          aligned kicker, two supporting quotes below with hairline rules.
          No cards, no Quote icon. */}
      <section className="px-4 md:px-8 py-20 md:py-28 bg-surface border-y border-border">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-12 gap-6 md:gap-12 mb-16 md:mb-20">
            <p className="md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2 flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
              What users say
            </p>
            <div className="md:col-span-9 max-w-3xl">
              <h2 className="text-3xl md:text-5xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                Trusted by Irish marketing teams.
              </h2>
            </div>
          </div>

          {/* Hero quote - one large statement, not three card grid */}
          <figure className="grid md:grid-cols-12 gap-6 md:gap-12 pb-14 md:pb-20 border-b border-border">
            <div className="md:col-span-3">
              <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold">
                Featured
              </p>
            </div>
            <div className="md:col-span-9 max-w-3xl">
              <blockquote className="text-2xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.2]">
                &ldquo;CMO.ie showed us we were invisible to ChatGPT for our core
                service prompts. Within two weeks of following their
                recommendations, we went from not mentioned to position&nbsp;2.&rdquo;
              </blockquote>
              <figcaption className="mt-8 text-sm text-text-secondary">
                <span className="text-text-primary font-semibold">Sarah M.</span>
                <span className="mx-2 text-text-muted">·</span>
                Marketing Director, Dublin SaaS Company
              </figcaption>
            </div>
          </figure>

          {/* Supporting quotes - editorial 2-col, no cards */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 pt-14 md:pt-20">
            {[
              {
                quote:
                  "The gap analysis alone was worth the subscription. We had no idea our competitors were dominating AI search results for the prompts our customers actually use.",
                name: "James O.",
                meta: "Head of Digital, Irish Retail Brand",
              },
              {
                quote:
                  "We used to manually check ChatGPT and Perplexity every week. CMO.ie automated all of that and gave us the strategy to actually improve. Game changer for our agency clients.",
                name: "Aoife K.",
                meta: "Agency Founder, Digital Agency Cork",
              },
            ].map((t) => (
              <figure key={t.name}>
                <blockquote className="text-lg md:text-xl text-text-primary leading-relaxed">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-5 text-sm text-text-secondary">
                  <span className="text-text-primary font-semibold">{t.name}</span>
                  <span className="mx-2 text-text-muted">·</span>
                  {t.meta}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──
          Editorial stack with hairline rules between plans. Each plan is a
          12-col row: name + price left, feature list + CTA right. The "Most
          Popular" plan is distinguished by a left forest-green rule, not by
          a scaled card. Reads like a pricing page in a product brochure. */}
      <section id="pricing" className="px-4 md:px-8 py-20 md:py-28 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-12 gap-6 md:gap-12 mb-16 md:mb-20">
            <p className="md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2 flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
              Pricing
            </p>
            <div className="md:col-span-9 max-w-3xl">
              <h2 className="text-3xl md:text-5xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                Simple, transparent pricing.
              </h2>
              <p className="text-lg text-text-secondary mt-6 leading-relaxed max-w-2xl">
                Every plan includes a 7-day free trial. Month-to-month, cancel
                any time.
              </p>
            </div>
          </div>

          <div className="border-t border-border">
            {[
              {
                id: "starter",
                name: "Starter",
                tagline: "One brand, tracked seriously",
                price: "€249",
                features: [
                  "1 project",
                  "25 prompts tracked",
                  "2 AI models",
                  "Weekly runs (4 / month)",
                  "Gap insights",
                  "5 brief credits / month",
                  "Email support",
                ],
                ctaVariant: "outline" as const,
                featured: false,
              },
              {
                id: "pro",
                name: "Pro",
                tagline: "Daily tracking, full action plans",
                price: "€499",
                features: [
                  "3 projects",
                  "50 prompts tracked",
                  "4 AI models",
                  "Daily runs (30 / month)",
                  "Strategy + briefs",
                  "20 brief credits / month",
                  "Priority support",
                ],
                ctaVariant: "default" as const,
                featured: true,
              },
              {
                id: "advanced",
                name: "Advanced",
                tagline: "Unlimited everything",
                price: "€999",
                features: [
                  "Unlimited projects",
                  "Unlimited prompts",
                  "All 5 AI models",
                  "Unlimited runs",
                  "Full action plans + drafts",
                  "50 brief credits / month",
                  "REST API + MCP access",
                  "Dedicated account manager",
                ],
                ctaVariant: "outline" as const,
                featured: false,
              },
            ].map((plan) => (
              <div
                key={plan.id}
                className={`grid md:grid-cols-12 gap-6 md:gap-12 py-12 md:py-16 border-b border-border ${
                  plan.featured ? "relative" : ""
                }`}
              >
                {/* Left: plan name + price + badge + tagline */}
                <div className="md:col-span-4 space-y-3">
                  {plan.featured && (
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block w-4 h-[2px] bg-emerald-dark"
                      />
                      Most popular
                    </p>
                  )}
                  <h3 className="text-3xl md:text-4xl font-semibold text-text-primary tracking-tight">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-text-secondary">{plan.tagline}</p>
                  <div className="pt-2 flex items-baseline gap-2">
                    <span className="font-mono tabular-nums text-5xl md:text-6xl font-medium text-text-primary leading-none">
                      {plan.price}
                    </span>
                    <span className="text-text-muted text-sm">/ month</span>
                  </div>
                </div>

                {/* Right: feature list + CTA */}
                <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 md:gap-12 items-start">
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 max-w-xl">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-3 text-sm text-text-secondary"
                      >
                        <Check className="w-4 h-4 text-emerald-dark shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup" className="shrink-0 self-start">
                    <Button variant={plan.ctaVariant} size="lg">
                      Start free trial
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <p className="text-sm text-text-muted mt-10 max-w-2xl">
            Need something larger, or a custom setup for multiple brands?{" "}
            <a
              href="mailto:hello@cmo.ie"
              className="text-text-primary underline underline-offset-4 hover:text-emerald-dark transition-colors"
            >
              Get in touch
            </a>
            .
          </p>
        </div>
      </section>

      {/* ── FAQ ──
          Flat editorial list using native <details> for accessibility.
          Hairline rules between items, no cards, no decorative icons -
          just a minus/plus toggle rendered via the summary marker. */}
      <section id="faq" className="px-4 md:px-8 py-20 md:py-28 bg-surface border-y border-border">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-12 gap-6 md:gap-12 mb-12 md:mb-16">
            <p className="md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2 flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
              FAQ
            </p>
            <div className="md:col-span-9 max-w-3xl">
              <h2 className="text-3xl md:text-5xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                Common questions.
              </h2>
            </div>
          </div>

          <div className="grid md:grid-cols-12 gap-6 md:gap-12">
            <div className="md:col-span-3" aria-hidden="true" />
            <div className="md:col-span-9 max-w-3xl border-t border-border">
              {[
                {
                  q: "What is AI search visibility?",
                  a: "AI search visibility measures how often and how positively your brand appears in responses from AI platforms like ChatGPT, Google Gemini, Perplexity, and Google AI Overviews. As more consumers use AI to find products and services, your visibility in these responses directly impacts your business.",
                },
                {
                  q: "How is this different from traditional SEO tracking?",
                  a: "Traditional SEO tracks your position in Google's organic search results. AI search visibility tracks how AI models talk about your brand when users ask questions. These are completely different systems - you can rank #1 on Google and be invisible to ChatGPT. CMO.ie tracks what traditional SEO tools can't.",
                },
                {
                  q: "Which AI models do you monitor?",
                  a: "ChatGPT (GPT-4o and GPT-4.1), Google Gemini, Google AI Overviews, and Perplexity AI. We add new models as they gain market share.",
                },
                {
                  q: "How often are results updated?",
                  a: "We scan all your prompts across all selected AI models daily. Your dashboard updates automatically with new visibility, position, and sentiment data every morning.",
                },
                {
                  q: "What makes CMO.ie different from other AI monitoring tools?",
                  a: "Most AI monitoring tools show you data. CMO.ie goes further with three AI teams that analyse your results, identify gaps, build strategy, and write content briefs. We don't just tell you the problem - we tell you exactly how to fix it.",
                },
                {
                  q: "Is CMO.ie only for Irish companies?",
                  a: "CMO.ie is built with the Irish market in mind, but you can track prompts and brands in any market. Our Irish focus means we understand local search patterns, industries, and competitive dynamics better than generic international tools.",
                },
                {
                  q: "Can I cancel anytime?",
                  a: "Yes. All plans are month-to-month with no long-term commitment. You can cancel anytime from your account settings. Your data remains accessible until the end of your billing period.",
                },
              ].map((item) => (
                <details
                  key={item.q}
                  className="group border-b border-border [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex items-start justify-between gap-6 py-6 cursor-pointer list-none">
                    <h3 className="text-lg md:text-xl font-semibold text-text-primary tracking-tight">
                      {item.q}
                    </h3>
                    <span
                      aria-hidden="true"
                      className="relative shrink-0 w-4 h-4 mt-2 text-text-muted group-open:text-emerald-dark transition-colors"
                    >
                      <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-current" />
                      <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-current transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-90 group-open:scale-0" />
                    </span>
                  </summary>
                  <p className="text-base text-text-secondary leading-relaxed pb-6 max-w-2xl pr-8">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="hero-mesh px-4 md:px-8 py-16 md:py-28 bg-background">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h2 className="text-2xl md:text-5xl font-bold text-text-primary tracking-tight">
            Start understanding your AI visibility today
          </h2>
          <p className="text-lg text-text-secondary">
            Set up in 5 minutes. See your first results within 24 hours. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup">
              <Button variant="default" size="lg" className="text-base px-8">
                Start Your Free Trial
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <p className="text-sm text-text-muted">
            7-day free trial &middot; Cancel anytime &middot; No credit card required
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-4 md:px-8 py-16 border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-12">
            <div>
              <p className="text-lg font-bold text-text-primary mb-4">CMO.ie</p>
              <p className="text-sm text-text-secondary leading-relaxed">
                AI Search Visibility for Irish Brands. Monitor, analyse, and improve how AI talks about your business.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary mb-4">Product</p>
              <ul className="space-y-2">
                <li><a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Features</a></li>
                <li><a href="#pricing" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Pricing</a></li>
                <li><a href="#how-it-works" className="text-sm text-text-secondary hover:text-text-primary transition-colors">How It Works</a></li>
                <li><a href="#faq" className="text-sm text-text-secondary hover:text-text-primary transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary mb-4">Company</p>
              <ul className="space-y-2">
                <li><a href="https://howl.ie" className="text-sm text-text-secondary hover:text-text-primary transition-colors">About Howl.ie</a></li>
                <li><a href="#" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Blog</a></li>
                <li><a href="#" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Careers</a></li>
                <li><a href="#" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary mb-4">Legal</p>
              <ul className="space-y-2">
                <li><Link href="/privacy" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Terms of Service</Link></li>
                <li><Link href="/privacy#what-we-collect" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Cookie Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center">
            <p className="text-sm text-text-muted">
              © 2026 CMO.ie - A Howl.ie product. Built in Dublin.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
