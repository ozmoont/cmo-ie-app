# Data-collection audit — findings

_Audit date: 19 April 2026. Scope: every code path that produces the visibility / sentiment / position / citation numbers customers see in the dashboard._

## Headline

**The run engine does not query ChatGPT, Perplexity, Gemini, Google AI Overviews, or Copilot.**

Every metric currently displayed in CMO.ie is produced by two Claude Haiku calls:

1. **Call 1 — "simulate the model":** Claude Haiku is given a system prompt telling it to pretend to be ChatGPT / Perplexity / Gemini / Google AIO / Claude, and to respond "naturally" in that model's style. It generates a plausible-looking response including company names, URLs, and recommendations.
2. **Call 2 — "analyse the response":** Claude Haiku is given the _simulated_ response from call 1 plus the brand + competitor list, and asked to return JSON with `brand_mentioned`, `mention_position`, `sentiment`, and `citations`.

The citations customers see are Haiku's best guesses at what URLs a given AI model _might_ cite for that prompt, not URLs any real AI model actually returned. The visibility scores, sentiment, and position rankings are derived from the same synthetic data.

## Evidence

`src/lib/run-engine.ts`:

- **Line 13:** Only `@anthropic-ai/sdk` imported. No OpenAI / Google / Perplexity SDK.
- **Line 52–63 (QUERY_SYSTEM):** _"You are simulating how different AI search engines respond to user queries... Respond AS that model would."_
- **Line 90–96 (MODEL_STYLES):** Hard-coded style hints fed into the simulator for each model.
- **Line 248–262:** The "simulate" call — `anthropic.messages.create({ model: "claude-haiku-4-5-20251001", ... })` with system prompt `QUERY_SYSTEM` and user content `"Simulate a response from ${MODEL_STYLES[model]}"`.
- **Line 270–289:** The "analyse" call — a second Haiku call given the output of the simulate call.

`src/app/api/projects/[id]/runs/route.ts`:

- **Line 62–69:** The only runtime entry point. Calls `executeRun` from `run-engine.ts` directly. No branch, no feature flag, no alternate path.

Searching the whole `src/` tree for `openai|perplexity|gemini|googleapis`:
- `types.ts` — enum declarations only
- `mock/data.ts` — explicitly mock
- `onboarding/page.tsx`, `projects/new/form.tsx` — UI labels
- `api/settings/api-keys/route.ts` — reads `openai_api_key`, `google_api_key`, `perplexity_api_key` from the `organisations` table so users can _enter_ them, but **nothing in the run path ever reads those keys**.

Searching for `playwright|puppeteer|browserbase|apify|scrapfly`:
- Zero production dependencies. No headless browser, no scraping fleet.

## Per-model data source (current state)

| Model | Displayed as tracked | Actual source | Gap |
| --- | --- | --- | --- |
| ChatGPT | Yes | Claude Haiku roleplay | No real data |
| Perplexity | Yes | Claude Haiku roleplay | No real data |
| Gemini | Yes | Claude Haiku roleplay | No real data |
| Google AI Overviews | Yes | Claude Haiku roleplay | No real data |
| Claude | Yes | Claude Haiku roleplay as Claude (not the actual `messages.create` on a Sonnet/Opus production call) | Arguably closest, but still not real data |

The `organisations.anthropic_api_key / openai_api_key / google_api_key / perplexity_api_key` columns from migration `004_org_api_keys.sql` are present but not wired to the run engine. Users can save keys in settings that never get used.

## Implications

1. **Every paying customer sees synthetic data.** If any customer today is making decisions on the basis of these numbers, those decisions are built on Haiku's pattern-matching about what AI models tend to say — not on what they actually said.
2. **Every feature in the Peec-parity plan is blocked.** Share of Voice, Gap Analysis, Sources view, Actions v2 — none of these are meaningful on top of simulated data. The data problem isn't "augment what we have," it's "build what we haven't built."
3. **The contractor engagement is not optional, and it's larger than previously scoped.** Prior plan: 40–80 hours for Perplexity + ChatGPT. Revised reality: we need a full multi-model query pipeline — 120–200 hours of senior engineering.
4. **There is a disclosure question.** If customers are led to believe they're seeing real AI search data, that belief may not match what's under the hood. This needs a factual decision from the founder, possibly with legal review, before the next invoice cycle.
5. **The gap with Peec is wider than the earlier review implied.** Peec's UI-scraping pipeline isn't just a differentiator — it's the _only_ source of the data their platform claims to produce. We're currently competing without the underlying data.

## Options

### Option A — Pause customer-facing metrics, ship real data first
Disable the dashboard numeric surfaces until real model calls are wired up. Keep the product online for prompt management, competitor setup, onboarding flows. Communicate honestly to the ~N customers currently paying. Spend weeks 1–10 building the real data pipeline with contractor help. Resume metrics when they're real.

**Pros:** Ethically cleanest. Puts a floor under everything that comes next. Forces the hard engineering to the front.
**Cons:** Painful conversation with existing customers. Possible churn. Revenue hit for 2-3 months.

### Option B — Label current data "estimated" and ship real on top
Add clear "estimated / not yet live" banners to every visibility surface. Keep the simulation running as a stand-in. Ship real data channels one model at a time over 10-14 weeks. When a real channel ships, that model switches from "estimated" to "live" in the UI.

**Pros:** Maintains revenue. Continues customer research.
**Cons:** Still produces synthetic numbers customers _might_ rely on. Requires genuinely prominent labelling, which will test customer patience. Creates a hybrid state that's hard to reason about.

### Option C — Pause new customer signups, run existing on simulation, build replacement
Disable paid signups today. Existing customers keep using the current product (with or without disclosure). Build the real pipeline in parallel. When it's ready, migrate existing customers, re-open signups.

**Pros:** Stops the bleed without an immediate customer conversation.
**Cons:** Cuts revenue growth to zero. Only works if current customer count is small enough that conversations can wait.

### Option D — Rebuild the run engine itself as the first thing
Before any Peec-parity features. Weeks 1–12 become: wire Claude via API (real), Gemini via API (real), Perplexity via Sonar API, ChatGPT via scraping (contractor-led), Google AIO via scraping (contractor-led). Everything else deferred to weeks 13+.

**Pros:** Fixes the foundation before anything else gets built on top. Aligns to the finding.
**Cons:** 10-12 weeks of "no new features" from a customer perspective. Phase 2+ of the earlier plan slides to month 4+.

## Recommendation

**Option D + Option B's labelling as a safety net.** Specifically:

1. **Week 1 (this week):** Founder decides Option A / B / C / D and the customer communication plan. No build work until this decision is made.
2. **Week 1-2:** Add "estimated" labelling to every visibility surface as a hedge, regardless of which option is chosen.
3. **Week 2-3:** Contractor engagement starts immediately with expanded scope (full multi-model pipeline). Scope doc signed.
4. **Weeks 3-12:** Real data pipeline is the _only_ build focus. Shipped model-by-model:
   - Claude (direct, ~1 week)
   - Gemini (direct, ~1 week)
   - Perplexity Sonar (direct, ~1 week)
   - ChatGPT with search (contractor-led, 2-4 weeks)
   - Google AI Overviews (contractor-led, 2-3 weeks)
   - Copilot / Grok (opportunistic, post-phase)
5. **Week 12+:** The original Phase 1 (schema foundations, SoV, brand matching, brand profile) starts — on top of real data.

The 26-week plan previously outlined slides by roughly 10 weeks. End date moves from late October 2026 to early January 2027. That's the honest number.

## What doesn't change

- The overall priority order of Peec gaps (sources first, then tags/topics, then agency tier).
- The contractor model (still €8-14k, but front-loaded).
- The kill list.
- The Irish-market differentiation strategy.

## What does change

- Phase 1 becomes "real data collection" instead of "credibility foundations." Credibility foundations were the right label; we just didn't know how deep the credibility problem went.
- The contractor scope roughly doubles.
- Revenue signposts for the first 3-4 months need resetting — acquisition via feature parity is paused until the pipeline is real.
- There's a new Week 0: founder decision on customer communication.

## Open questions for the founder

1. **How many paying customers are on the platform today?** The answer determines the shape of Option A / B / C.
2. **Does the current messaging / marketing site claim "real" data from these AI models?** Check landing page copy, pricing page, onboarding, email sequences. If it does, that's the disclosure risk.
3. **Was the simulation approach always intended as scaffolding, or was it the deliberate v1 product?** This is a founder-only question but it matters for how this gets communicated.
4. **Is there a legal / regulatory advisor on retainer?** If so, involve them on the Option A/B/C/D decision.
5. **What's the customer feedback signal?** Have any customers noticed the data seems off, or flagged hallucinated citations? That's data about the gravity of the current state.

These aren't rhetorical — I can't make these calls for you. They shape which option is right.
