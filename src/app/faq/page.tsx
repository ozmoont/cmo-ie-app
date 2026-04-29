/**
 * /faq — public FAQ.
 *
 * Static content kept in the FAQ_SECTIONS const so edits are obvious
 * + version-controlled. No DB, no CMS — at our cadence, a markdown
 * deploy is faster than building an editing UI.
 *
 * Indexed by Google (no robots:noindex), so it doubles as SEO content
 * for the "AI search visibility" / "GEO" terms we want to rank on.
 *
 * Style + nav match /pricing + /privacy so the public site reads as
 * one coherent surface.
 */

import Link from "next/link";

export const metadata = {
  title: "FAQ — CMO.ie",
  description:
    "Common questions about tracking AI search visibility with CMO.ie — how prompts, runs, gaps, audits, monthly playbooks, and pricing work.",
};

interface FaqEntry {
  q: string;
  a: string;
}

interface FaqSection {
  title: string;
  intro?: string;
  entries: FaqEntry[];
}

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: "What CMO.ie does",
    intro:
      "The 30-second version. If you only read one section, read this one.",
    entries: [
      {
        q: "What problem does CMO.ie solve?",
        a: "Customers increasingly ask AI tools (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews) for recommendations instead of typing a Google query. CMO.ie tracks whether your brand is mentioned in those answers, where competitors are mentioned and you aren't, and what to publish or change to start showing up.",
      },
      {
        q: "Is this just SEO?",
        a: "No. Traditional SEO optimises for Google's blue-link results. AI search engines synthesise answers from a different mix of sources, weight Irish publishers differently, and don't index a page just because Googlebot can read it. We track the AI side specifically, with a separate methodology — it complements, not replaces, your existing SEO work.",
      },
      {
        q: "Who's it for?",
        a: "Irish brands with a digital footprint who care about being recommended by AI. Most useful if you have at least a basic website + some product/service pages, and you compete in a category customers research before buying. Agencies use it to manage multiple client brands from one workspace.",
      },
      {
        q: "What's the shortest path to value?",
        a: "Sign up, create a project for your brand, fill in (or auto-extract) the brand profile, click Generate suggestions to get ~10 customer-style prompts, click Generate full set if you want 30-50. Once prompts are saved, the daily run picks them up and we check each prompt against the AI engines on your plan. Within 24-48 hours you have a real visibility baseline.",
      },
    ],
  },
  {
    title: "Getting started",
    entries: [
      {
        q: "How do I sign up?",
        a: "Visit /signup, give us your name, company, email and password. We provision a trial organisation for you with one project, one prompt, and three AI models — enough to see the product working before you pick a paid plan.",
      },
      {
        q: "What happens during onboarding?",
        a: "After signup we walk you to /onboarding which guides you through: (1) confirming your brand name + website, (2) auto-extracting a brand profile from your homepage, (3) seeing 10 suggested prompts, (4) picking competitors, (5) running your first daily check. Total time: ~5 minutes.",
      },
      {
        q: "Do I need an API key from Anthropic / OpenAI / Google?",
        a: "Trial accounts: yes (BYOK). Paid plans: no — we use our managed keys by default. Power users on paid plans can switch to their own keys via Settings → API Keys if they want full control over spend or want to run more checks than their plan covers.",
      },
      {
        q: "Can I add more than one brand?",
        a: "Starter is one project. Pro is three. Advanced is unlimited. Agency tier is built around multi-client management with a credit pool that can be allocated across client projects.",
      },
    ],
  },
  {
    title: "Prompts",
    intro:
      "Prompts are the questions your customers might ask AI when researching your category. They're the unit of measurement — every check runs each prompt against each model.",
    entries: [
      {
        q: "What's a good prompt?",
        a: "A natural question a real customer would type — not a keyword string. \"Best digital agencies in Dublin for a B2B SaaS launch?\" is good. \"digital agency dublin\" is not. We auto-suggest 10 prompts based on your brand profile so you don't have to write them from scratch.",
      },
      {
        q: "How is the suggested-prompts list built?",
        a: "Claude reads your structured brand profile (segment, audience, products) — never the raw HTML — and generates 10 conversational prompts split across awareness (~3), consideration (~4), and decision (~3) intents. We hard-lock to your stated industry so you don't get prompts about adjacent businesses.",
      },
      {
        q: "What's the difference between Generate suggestions and Generate full set?",
        a: "Generate suggestions returns ~10 prompts, fast. Generate full set returns 30-50 covering the broader funnel + scores each one's importance (1-5) + maps each to its closest plain-English Google query so you can see the keyword volume behind it. Use Generate suggestions for a quick start; use Generate full set when you want comprehensive coverage.",
      },
      {
        q: "Can I write my own prompts?",
        a: "Yes — the Add your own input lives directly under the suggestion list. We'd recommend starting with the suggester even if you intend to override it; the AI tends to phrase prompts in customer language better than we do.",
      },
      {
        q: "How many prompts can I track?",
        a: "Trial: 1. Starter: 25. Pro: 50. Advanced: unlimited. Agency: unlimited. The cap is on active prompts; archived prompts don't count.",
      },
    ],
  },
  {
    title: "Daily runs + visibility",
    entries: [
      {
        q: "How often do you check my prompts?",
        a: "Trial: 2 runs per month. Starter: 4. Pro: 30. Advanced + Agency: unlimited. A run fires every active prompt against every selected model, captures the response, parses citations, and computes share-of-voice across your brand + competitors.",
      },
      {
        q: "Which AI models are checked?",
        a: "ChatGPT (OpenAI), Claude (Anthropic), Perplexity, Gemini (Google), and Google AI Overviews. Trial includes 3 of those; Starter 2; Pro 4; Advanced + Agency 5.",
      },
      {
        q: "What's share-of-voice?",
        a: "Across all the prompt × model checks in a run, what share of mentions belonged to your brand vs each tracked competitor. It's the headline number that tells you whether you're improving against the field over time.",
      },
      {
        q: "Why does the result for the same prompt change?",
        a: "AI models are stochastic — they don't return identical answers every time. We run each prompt multiple times where the plan allows it and aggregate. Over a month, the noise smooths out and the real trend emerges.",
      },
    ],
  },
  {
    title: "Brand profile",
    entries: [
      {
        q: "Why does the brand profile matter so much?",
        a: "Every downstream feature — prompts, action plans, briefs, monthly playbooks — uses the brand profile as ground truth for what your business actually is. If the profile says you're a digital agency, suggestions will be agency-customer questions. If it's wrong, everything downstream is wrong. The profile is the most important thing you tell us.",
      },
      {
        q: "How is the brand profile created?",
        a: "On project creation, we fetch your homepage, parse the visible text, and ask Claude to fill out five fields: short description, market segment, brand identity, target audience, products/services. You see it before it's saved and can edit any field.",
      },
      {
        q: "What if the auto-extract gets it wrong?",
        a: "Two paths. (1) Click Re-extract — most failures are transient (rate limit, JS-only homepage, redirect). (2) Edit the fields manually — you know your business better than the model, and the manual version is what every downstream feature uses.",
      },
      {
        q: "Why isn't extraction working?",
        a: "Most often: your site is behind Cloudflare bot protection, or the homepage is JS-rendered with no server HTML, or it's a redirect to a country-specific domain. The error message usually tells you which. Editing the profile manually unblocks you regardless.",
      },
    ],
  },
  {
    title: "Gaps + actions",
    entries: [
      {
        q: "What's a gap?",
        a: "A specific domain or URL the AI models keep referencing when answering your prompts where competitors are mentioned and you aren't. The Gap Analysis page ranks them by opportunity — high-traffic sources where you're absent are where you have the most to gain by appearing.",
      },
      {
        q: "What's an action plan?",
        a: "Click Generate plan on the Actions tab and we run a three-Claude pipeline (Gap Analyst → Strategist → Brief Writer) that turns your top gaps into a prioritised list of moves. Each action has effort + impact ratings, root-cause analysis, and concrete steps.",
      },
      {
        q: "What's a brief?",
        a: "A click-to-generate content brief targeting a specific gap. Tells you who the audience is, what to write, what to include, and what voice to use — so you (or your writer) can publish a piece of content that has a real chance of earning the citation you're missing.",
      },
      {
        q: "What's the action tier on each plan?",
        a: "Trial + Starter: 'gaps' (gap identification only). Pro: 'strategy' (gaps + prioritised plan). Advanced + Agency: 'full' (gaps + plan + briefs + draft + polish requests).",
      },
    ],
  },
  {
    title: "SEO audits",
    entries: [
      {
        q: "What's the SEO audit?",
        a: "A 9-phase deep audit of your site — keyword landscape, on-page review, content gaps, technical SEO, AI search resilience, competitor benchmarking, backlinks, local SEO, prioritised action plan. Calibrated for the Irish market. Delivered as a markdown report you can share with your team.",
      },
      {
        q: "How long does it take?",
        a: "60-120 seconds end-to-end. The page shows a stage-by-stage progress indicator (crawling → reading meta tags → checking Core Web Vitals → mapping keywords → writing the report). Safe to close the tab — the audit keeps running and shows up in your list when done.",
      },
      {
        q: "How much does it cost?",
        a: "Pro: 1 free audit per month. Advanced: 3 free per month. Trial / Starter / Agency overflow: €49 per audit. Agency tier includes 1 per active client project per month.",
      },
      {
        q: "Why did my audit fail?",
        a: "Most common: your site blocked our crawler (Cloudflare, Webflow, or a 403). The audit row shows status 'unavailable' with the specific reason. Some sites also fail mid-audit when PageSpeed Insights returns transient errors — a re-run usually works.",
      },
    ],
  },
  {
    title: "Monthly playbooks",
    entries: [
      {
        q: "What's a monthly playbook?",
        a: "On the 1st of each month we generate a one-pager for every active project — the three highest-leverage moves to make this month based on the previous 30 days of data. Delivered to every team member's email + viewable inline at /admin/playbooks.",
      },
      {
        q: "How are the three moves chosen?",
        a: "Top gaps + visibility deltas + share-of-voice changes get fed to Claude with the brand profile. Claude returns the moves in CMO.ie house voice (practical, Dublin-inflected, no corporate filler). Each move has a specific 'do this by Friday' task — not generic 'consider improving content' advice.",
      },
      {
        q: "Can I regenerate a playbook?",
        a: "Yes — admins can force-regenerate from /admin/playbooks. Useful if Claude misread the data or the prompt template changed. Doesn't trigger a fresh email send by default.",
      },
    ],
  },
  {
    title: "Crawlability tool",
    entries: [
      {
        q: "What's the crawlability tool?",
        a: "Free, login-free check at /crawlability. Tests whether 40+ AI bots (GPTBot, ClaudeBot, PerplexityBot, GoogleBot, etc.) are allowed by your robots.txt + can fetch a sample URL. Tells you which AI engines can actually read your site — a precondition for ever showing up in their answers.",
      },
      {
        q: "Why is crawlability free?",
        a: "We use it as a marketing top-of-funnel — give value before asking for an email. If your site is bot-blocked, no amount of CMO.ie tracking will help; better you find out for free.",
      },
    ],
  },
  {
    title: "Plans + billing",
    intro:
      "Pricing is on /pricing — this section answers the questions the pricing table can't.",
    entries: [
      {
        q: "What's a check?",
        a: "One prompt run against one AI model = one check. If you have 25 prompts × 2 models × 4 runs/month, that's 200 checks/month. Each plan has a soft total-checks cap (most plans are unlimited; Trial is capped at 10).",
      },
      {
        q: "Do failed checks count against my limits?",
        a: "No. Only successful checks count. If a model API errors out, we retry with backoff and eventually skip — that doesn't burn your runsPerMonth allowance.",
      },
      {
        q: "How does cancellation work?",
        a: "Cancel anytime from Settings → Billing. Access stays live until the end of your current billing period. We don't pro-rate refunds, but data is preserved for 30 days after cancellation in case you change your mind.",
      },
      {
        q: "Do I get a discount for paying yearly?",
        a: "Email hello@howl.ie — annual deals are case-by-case at the moment, especially for agency tier. No public discount code.",
      },
      {
        q: "What if I exceed my plan's prompt limit?",
        a: "You can't add the next prompt — the form blocks it. Either upgrade your plan or archive prompts you no longer need. Archived prompts preserve their history but don't count towards the cap.",
      },
    ],
  },
  {
    title: "Agency tier",
    entries: [
      {
        q: "What's different about Agency?",
        a: "Multi-client management. One workspace, many client projects, with a credit pool that can be allocated across clients (instead of a per-project plan). BYOK by default — your Anthropic / OpenAI / Gemini keys, your spend, your control. Includes the MCP server + REST API on Scale tier and above.",
      },
      {
        q: "What's the credit pool?",
        a: "1 prompt × 1 model × 1 day = 1 credit. Pre-allocate credits across client projects monthly so a high-priority client gets more frequent checks than a maintenance one. See /agency for the full model.",
      },
      {
        q: "Can my clients log in to see their own data?",
        a: "Not yet on the customer side — the agency tier is built around the agency operator running it. White-labelled client logins are on the roadmap but not v1.",
      },
    ],
  },
  {
    title: "Data + privacy",
    entries: [
      {
        q: "Where's my data stored?",
        a: "Supabase (Postgres) in the EU region (Frankfurt) for all customer data. Vercel hosts the app — also EU regions. We don't store your AI provider's responses any longer than needed for trend analysis (90 days by default; longer on Advanced + Agency).",
      },
      {
        q: "What's sent to the AI providers?",
        a: "Just the prompt text + the basic context the run engine needs (brand name + market). We never send your customer data, your team's emails, or anything outside what's needed to run the visibility check.",
      },
      {
        q: "Is CMO.ie GDPR-compliant?",
        a: "Yes. Howl.ie (Ireland) is the data controller; we publish our processing basis at /privacy. Subject access requests and right-to-erasure requests are answered within 30 days; email privacy@howl.ie.",
      },
      {
        q: "Do you sell or share my data?",
        a: "No. We don't sell to third parties, don't share data across customer accounts, and don't run ads inside the product. Subprocessors (Anthropic, OpenAI, Google, Vercel, Supabase, Stripe) are listed in /privacy.",
      },
    ],
  },
  {
    title: "Account",
    entries: [
      {
        q: "How do I add a teammate?",
        a: "Settings → Team → Invite. They get an email with a sign-up link tied to your organisation. New teammates default to 'member' role; only owners can grant admin.",
      },
      {
        q: "How do I change my password?",
        a: "Settings → Account → Reset password. Or use the 'Forgot password' link on /login if you can't sign in.",
      },
      {
        q: "How do I delete my account?",
        a: "Settings → Account → Delete account. This permanently removes your organisation, projects, prompts, history, and team. We don't keep a soft-delete copy.",
      },
      {
        q: "Where do I report a bug?",
        a: "Email hello@howl.ie or use the chat icon in the bottom-right of the dashboard if it's enabled. We aim to respond within one business day; bugs go straight to the engineering backlog.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      {/* ── Top nav (matches /pricing + /privacy) ── */}
      <header className="px-6 md:px-10 py-5 border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight hover:text-emerald-dark transition-colors"
          >
            CMO.ie
          </Link>
          <nav className="flex items-center gap-6 text-sm text-text-secondary">
            <Link href="/pricing" className="hover:text-text-primary">
              Pricing
            </Link>
            <Link href="/agency" className="hover:text-text-primary">
              Agencies
            </Link>
            <Link href="/crawlability" className="hover:text-text-primary">
              Crawlability
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
          FAQ
        </p>
        <h1 className="mt-4 text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
          Common questions, plainly answered.
        </h1>
        <p className="mt-5 text-lg md:text-xl text-text-secondary leading-relaxed max-w-2xl">
          What CMO.ie does, how it works, what it costs, and how your
          data is handled. If your question isn&apos;t here, email{" "}
          <a
            href="mailto:hello@howl.ie"
            className="text-emerald-dark underline-offset-4 hover:underline"
          >
            hello@howl.ie
          </a>{" "}
          and we&apos;ll add it.
        </p>
      </section>

      {/* ── Section index — quick jump links ── */}
      <section className="max-w-4xl mx-auto px-6 md:px-10 pb-12">
        <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mb-4">
          Jump to a section
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {FAQ_SECTIONS.map((section) => (
            <li key={section.title}>
              <a
                href={`#${slugify(section.title)}`}
                className="text-sm text-text-primary hover:text-emerald-dark transition-colors"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* ── FAQ body ── */}
      <main className="max-w-4xl mx-auto px-6 md:px-10 pb-20">
        {FAQ_SECTIONS.map((section) => (
          <section
            key={section.title}
            id={slugify(section.title)}
            className="py-10 md:py-12 border-t border-border first:border-t-0 grid grid-cols-12 gap-6 md:gap-10"
          >
            <div className="col-span-12 md:col-span-4 space-y-2">
              <h2 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight">
                {section.title}
              </h2>
              {section.intro && (
                <p className="text-sm text-text-secondary leading-relaxed">
                  {section.intro}
                </p>
              )}
            </div>
            <div className="col-span-12 md:col-span-8 max-w-3xl">
              <dl className="divide-y divide-border border-y border-border">
                {section.entries.map((entry, i) => (
                  <div key={i} className="py-5">
                    <dt className="text-base font-medium text-text-primary">
                      {entry.q}
                    </dt>
                    <dd className="mt-2 text-sm text-text-secondary leading-relaxed">
                      {entry.a}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        ))}
      </main>

      {/* ── Closer ── */}
      <section className="border-t border-border">
        <div className="max-w-4xl mx-auto px-6 md:px-10 py-12 text-center">
          <p className="text-sm text-text-secondary">
            Still stuck? Email{" "}
            <a
              href="mailto:hello@howl.ie"
              className="text-emerald-dark underline-offset-4 hover:underline"
            >
              hello@howl.ie
            </a>{" "}
            — we&apos;ll usually reply same day.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border px-6 md:px-10 py-8 text-xs text-text-muted">
        <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <p>© {new Date().getFullYear()} Howl.ie. Built in Dublin.</p>
          <nav className="flex items-center gap-6">
            <Link href="/pricing" className="hover:text-text-primary">
              Pricing
            </Link>
            <Link href="/privacy" className="hover:text-text-primary">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-text-primary">
              Terms
            </Link>
            <a
              href="mailto:hello@howl.ie"
              className="hover:text-text-primary"
            >
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/**
 * Pure helper — slugify a section title for the in-page anchor. Used
 * by both the section list (links) and the section heading (id).
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
