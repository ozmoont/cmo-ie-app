# CMO.ie marketing playbook

_Audience: Howl.ie marketing team. Source-of-truth for what CMO.ie is, what it does, who it's for, how to demo it, and how to talk about it._
_Last updated: 29 April 2026._

This is the doc you read once on day one and re-skim before every campaign, demo, or outreach push. If something here is wrong, fix it — it's source-of-truth, not a strategy document, and the product moves faster than slide decks.

---

## 1. Product in one paragraph

CMO.ie tracks how AI search engines — ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews — talk about Irish brands. We run customer-style prompts through every major AI engine, capture which brands get mentioned and which sources get cited, identify the gaps between you and your competitors, and tell you exactly what to publish or change to start showing up. Built for Irish brands; calibrated to the Irish market; sold to in-house marketers and agencies.

**One-liner for cold outreach:**
> "We tell Irish brands when ChatGPT and friends recommend their competitors instead of them — and what to publish to turn that around."

**Elevator pitch (60 seconds):**
> Most of our customers' future buyers are starting their research in ChatGPT or Perplexity, not Google. Right now you have no idea whether those AI tools mention you when someone asks for a recommendation in your category. CMO.ie tracks it daily across every major AI engine, shows you which sources the AI keeps citing for your competitors but not for you, and generates the briefs you need to close those gaps. It's like Search Console, but for the AI layer that traditional SEO tools don't touch.

---

## 2. Target customer

### ICP A — Irish in-house marketing director

- **Title:** Marketing Director, Head of Marketing, CMO at Irish SMB or scale-up.
- **Company size:** 20-300 employees, B2B SaaS / professional services / e-commerce / direct-to-consumer.
- **Pain:** They've watched organic Google traffic flatten over the last 18 months. They suspect AI is eating the search pie but they can't prove it, can't track it, and have no playbook for showing up in AI answers. Their CEO is starting to ask "are we showing up in ChatGPT?" — and they don't have an answer.
- **What gets them to demo:** A clear hook that AI search is measurable. They've never tracked it before because nobody offered them a way.
- **What gets them to buy:** A concrete moment in the demo where they see a competitor's brand getting mentioned for a query they should be winning. That's the gut-punch — they sign up by end of week.

### ICP B — Irish digital agency

- **Title:** Founder, Head of Strategy, Head of SEO at a 5-50 person agency.
- **Pain:** Their clients keep asking "what about AI search?" and the agency doesn't have a deliverable to sell. They need a tool that lets them manage 5-30 clients from one workspace, with credit pools they can allocate, and ideally white-labelled reports.
- **What gets them to demo:** "Stop telling clients you'll figure it out. Here's a deliverable you can sell tomorrow."
- **What gets them to buy:** Agency tier with credit pool + multi-client workspace. They need to see the unit economics work for a 10-client roster.

### Not the customer (yet)

- One-person consultants — too small, can use Trial for free.
- Pure e-commerce with no content strategy — we can identify gaps but they need content infra to act on it.
- Companies with no website — extraction fails, downstream features are degraded.
- Large enterprises with internal SEO teams + custom tooling — possible Advanced + Agency upsell, but not our day-1 ICP.

---

## 3. Feature catalog

Every customer-visible feature, what it does, who it's for, why it matters in messaging.

### 3.1 Brand profile

- **What:** A structured 5-field profile of the brand (description, segment, identity, audience, products). Auto-extracted from the homepage; manually editable.
- **Why it matters:** It's the foundation. Every downstream feature uses this as ground truth. Wrong profile = wrong prompts, wrong actions, wrong everything.
- **Demo cue:** During onboarding, show the auto-extracted profile, edit one field, hit Save. The "you can fix this whenever you want" beat lands every time.
- **Talking point:** "We never guess your industry from your brand name alone — we'd rather get it from your homepage and have you correct it than make stuff up."

### 3.2 Prompts (suggester + batch generator)

- **What:** Customer-style questions a real buyer would ask AI. Two flows: single-shot suggester (~10 prompts, fast) and the AdWords-style batch generator (30-50 prompts with importance scores + Google query mirrors).
- **Why it matters:** The unit of measurement. Every visibility check fires every active prompt against every model. Prompt quality determines whether the data is meaningful.
- **Demo cue:** Click Generate suggestions, watch ~10 prompts appear with category badges (awareness / consideration / decision). Then for the wow-moment, click Generate full set, see 40 prompts plus importance dots and Google keyword mirrors.
- **Talking point:** "We don't try to make you write keyword strings. Our prompts read like the questions your customers actually ask in plain English — which is what AI engines respond best to."

### 3.3 Competitors

- **What:** Manually-added or AI-suggested list of competing brands to track. Each has a tracked name, aliases, optional regex.
- **Why it matters:** Visibility in isolation is meaningless. The interesting question is "do AI engines reach for me or my competitors when answering this prompt?" Competitor tracking turns the metric from absolute to relative.
- **Demo cue:** Show suggested competitors auto-extracted from recent runs ("we noticed Acme + Globex came up 3+ times in your prompts last week"). Hits because it's the AI doing competitive research the customer didn't ask for.
- **Talking point:** "Most of our customers find at least one competitor they didn't know about within their first week."

### 3.4 Daily runs + visibility

- **What:** Each day (or per-plan frequency) we run every active prompt against every selected model, capture responses, parse citations, score share-of-voice.
- **Why it matters:** The product is a measurement product before it's an action product. The dashboard graph showing share-of-voice over time is the chart customers paste into their board decks.
- **Demo cue:** The dashboard top chart — a 30-day visibility line per AI engine. Then click into a specific prompt to see the actual response Claude gave + the citations.
- **Talking point:** "Every morning the data refreshes — same way your sales pipeline does. Tracking AI visibility is now a daily metric, not a quarterly project."

### 3.5 Sources + gap analysis

- **What:** Every URL the AI engines referenced when answering your prompts. Sortable by domain, with visit counts + citation rates. Gap Analysis ranks domains where competitors got cited and you didn't.
- **Why it matters:** This is where measurement becomes actionable. The customer can see "this Wikipedia article keeps getting cited for our category, our competitor's link is in there, we aren't" — and now they know exactly where to go.
- **Demo cue:** The Gaps tab — sort by opportunity score. Hover the top row, show a real domain (e.g. an industry directory) where you'd expect to be listed but aren't.
- **Talking point:** "Stop guessing where to publish. We tell you the exact domains AI is reaching for in your category."

### 3.6 Action plans

- **What:** AI-generated, prioritised action list. Each action targets a specific gap, has effort + impact ratings, root-cause analysis, and concrete steps.
- **Why it matters:** Closes the loop between data and action. Most customers can't afford an in-house GEO strategist; the action plan is the strategist's output without the strategist.
- **Demo cue:** Click Generate plan, watch the spinner, see the result — then walk through one action and read the steps aloud. They sound like a senior strategist briefing the marketing team.
- **Talking point:** "Three Claude models work in series — analyst, strategist, brief writer — to produce a plan that's tailored to your specific gaps, not generic SEO advice."

### 3.7 Briefs + drafts

- **What:** Click any action and generate a full content brief targeting that gap. Pro+ plans can also draft + polish content from the brief.
- **Why it matters:** The bridge from "we should publish this" to "here's what we're publishing." Saves the customer from staring at a blank doc.
- **Demo cue:** Generate a brief on a real gap. Show the audience, key points, voice notes. Then (Advanced+) hit Polish — Claude extends the brief into a draft.
- **Talking point:** "Brief credits are included on every paid plan — Starter gets 5/month, Pro gets 20, Advanced gets 50, Agency gets 100 with the credit pool."

### 3.8 SEO audits

- **What:** 9-phase deep audit covering keyword landscape, on-page, content gaps, technical SEO, AI search resilience, competitor benchmarks, backlinks, local SEO, prioritised actions. Calibrated for the Irish market.
- **Why it matters:** Enterprise-grade audit at SaaS prices. Most agencies charge €1,500-€5,000 for an audit of this depth. We deliver it for €49 (or free, included in plan) in 90 seconds.
- **Demo cue:** Click Run audit on a project's seo-audit tab. The progress bar shows 9 stages. Open a recent audit to show the markdown body — tables, action plans, prioritised fixes. Customers consistently say "this is what I'd pay an agency thousands for."
- **Talking point:** "Pro plan includes one free audit a month; Advanced gets three. Or pay €49 per audit on lower plans. Either way, you get a full audit in 90 seconds, not 90 hours."

### 3.9 Monthly playbooks

- **What:** Email delivered on the 1st of each month with the three highest-leverage moves for that project, based on the previous 30 days.
- **Why it matters:** Pulls the customer back into the product every month. Solves the "I forgot to log in" problem. Becomes a marketing artefact in itself — customers forward to their team / manager / CEO.
- **Demo cue:** Show last month's playbook for a real project. Three moves, each with a specific task. Read the closing line — it's CMO.ie house voice (Dublin-inflected, practical, no corporate filler).
- **Talking point:** "Every month, an email lands in your team's inbox saying 'these are the three things to do this month.' Most customers forward it to their CEO."

### 3.10 Crawlability tool

- **What:** Free, login-free check at `/crawlability`. Tests whether 40+ AI bots can read your site. Tells you which engines are blocked.
- **Why it matters:** Top-of-funnel marketing surface. Free + useful = shareable on LinkedIn / Twitter. Drives signups.
- **Demo cue:** Run it on the prospect's domain mid-call. If they're blocking GPTBot, you have a real-time hook ("look — ChatGPT can't even read your site, that's why you're invisible to it").
- **Talking point:** "Free crawlability check — no login. If your site's blocking AI bots, no amount of optimisation will help. Better you find out for free."

### 3.11 Insights (per-prompt detail)

- **What:** Per-prompt drill-down — every response across every model, citations, sentiment, position, share of mentions over time.
- **Why it matters:** Where power users live. The customer who's spent 2 weeks with the product spends most of their time on this page, refining individual prompts.
- **Demo cue:** Skip in a 15-minute demo. Bring up only in a 30-minute deep-dive with a power user.

### 3.12 Reports

- **What:** Click-to-export PDF report covering visibility trends, share-of-voice, gaps, recommended actions. Shareable with stakeholders.
- **Why it matters:** Gets the customer's boss bought in. The customer uses it to justify the subscription internally.

### 3.13 Agency tier features

- **Multi-client management:** One workspace, many client projects.
- **Credit pool:** 1 prompt × 1 model × 1 day = 1 credit. Pre-allocate across clients.
- **BYOK by default:** Anthropic / OpenAI / Gemini keys come from the agency, not from us.
- **MCP server + REST API:** Read-only OAuth integration on Scale tier and above.
- **White-label:** On the roadmap, not v1.

---

## 4. Pricing

| Tier | Price | Includes |
|---|---|---|
| Trial | Free, 7 days | 1 project, 1 prompt, 3 models, 2 runs/month, 'gaps' actions tier, blurred results past the first |
| Starter | €249/mo | 1 project, 25 prompts, 2 models, 4 runs/month, 'gaps' actions tier, 5 brief credits, no free SEO audits |
| Pro | €499/mo | 3 projects, 50 prompts, 4 models, 30 runs/month, 'strategy' actions tier, 20 brief credits, 1 free SEO audit/mo |
| Advanced | €999/mo | unlimited everything, 5 models, 'full' actions tier, 50 brief credits, 3 free SEO audits/mo |
| Agency | €999-€2499/mo | unlimited, BYOK, credit pool, multi-client, 100 brief credits, MCP + REST API |

### Pricing rationale (for ops + sales)

- **Starter sits at €249** because that's the threshold below which the Irish marketing director will charge it to a corporate card without finance review.
- **Pro at €499** because the action plan + free monthly audit pays for itself if the customer publishes one piece of content based on it. Pro is where most customers should land — Starter exists to capture the smallest accounts and qualify them up.
- **Advanced at €999** is positioned for the customer who's bought in and wants the team-level use. Three projects (one per brand + agency support + private label) is the realistic shape.
- **Agency tier €999-€2499** is BYOK because at agency scale, the customer cares about owning their own AI spend — they're going to mark it up to clients regardless.

### Annual discount

Email sales (`hello@howl.ie`). No public annual discount today; all annual deals are case-by-case so we don't anchor public pricing.

---

## 5. Demo flow

### 5.1 Fifteen-minute demo (default)

1. **Setup (60 seconds).** "I'll walk you through how a brand sees what AI is saying about them. We'll use [your brand] live."
2. **Crawlability quick-hit (2 minutes).** Run `/crawlability` on their domain. Either: (a) they're bot-blocked, you get the gut-punch; or (b) they're crawlable, "great, now let's see what AI is actually saying."
3. **Sign-up + onboarding (4 minutes).** Walk them through onboarding live. Brand profile, suggested prompts, competitors, first run.
4. **Read a real run (4 minutes).** Open the dashboard. Show the visibility chart, drill into one prompt where their competitor got cited, read the AI's response aloud. The "this is real" moment.
5. **Action + brief (3 minutes).** Click into Gaps, generate an action plan, show one of the briefs. "This is what your writer would publish on Friday."
6. **Pricing close (2 minutes).** "Pro is what almost everyone in your category picks. Free 7-day trial, no card needed, takes 30 seconds."

### 5.2 Thirty-minute demo (deep)

Add: brand profile editing in detail, full SEO audit (kick it off, walk through report), monthly playbook example, agency credit pool walkthrough (if relevant), Insights deep-dive on one prompt.

### 5.3 The hook moment

Every demo needs one specific moment where the prospect's gut tightens. Usually:

- A real prompt where their direct competitor is cited and they aren't.
- The crawlability check showing GPTBot is blocked on their site.
- The SEO audit showing a 50/100 health score with 30+ specific issues.

Identify which one fits before the call. Don't try to land all three.

---

## 6. Sales objections + responses

| Objection | Response |
|---|---|
| "We already do SEO." | "Great — this is the AI layer SEO doesn't touch. Citations in ChatGPT, Perplexity, Gemini follow different rules. Most of our customers run both." |
| "Isn't this just guessing what AI will say?" | "We literally call the APIs every day. Your dashboard reflects what ChatGPT actually said yesterday for your prompts. No guessing." |
| "Our team doesn't have time to act on this." | "Most don't, which is why we ship the action plan + briefs. Your writer publishes from the brief. Two hours a week of execution." |
| "Why Irish? We sell globally." | "Irish brands targeting global markets get served twice — Irish-publisher weighting on home markets + global prompts on the same plan. Pro plan covers both." |
| "What if we cancel and want to come back?" | "Data preserved 30 days post-cancel. You can re-activate without losing history." |
| "We're using [Peec / Otterly / similar]." | "Our differentiator: Irish market calibration, the action+brief pipeline (most competitors only track), the SEO audit included on Pro+, and price-point. Happy to do a side-by-side." |
| "Trial gives us almost nothing — 1 prompt?" | "Right — Trial is to verify the product runs. Real evaluation needs Starter at minimum. We'd rather show you a real signal than fake unlimited access." |

---

## 7. Brand voice + messaging

### 7.1 Voice (mirrors the in-product copy)

- **Practical, Dublin-inflected, no corporate filler.** Read like a senior marketer talking to another senior marketer.
- **Specific over fluffy.** "Three moves for November" not "strategic actions to consider."
- **Plain English.** Acronyms only when the audience uses them daily (SEO, GEO, AI). Spell out everything else.
- **Tone is confident, not arrogant.** "We've watched this work for X" is fine. "We're the leader in" isn't.

### 7.2 Words we use

- AI search visibility, AI search engines, GEO (Generative Engine Optimisation), share of voice, citations, sources, gaps.
- Irish market, Dublin, .ie, Irish publishers (when relevant; don't force).

### 7.3 Words we don't use

- "AI revolution", "synergy", "leverage" (verb), "best-in-class", "industry-leading", "comprehensive solution", "next-generation", "powerful", "robust", "seamless".
- "Transform your" anything.
- "Unlock", "supercharge", "skyrocket".

---

## 8. Channel strategy

### 8.1 LinkedIn

- **Owner:** Marketing team + Odhran (CEO).
- **Cadence:** 2-3 posts/week from the company account; 1-2/week from Odhran.
- **Best-performing format:** Real screenshots from the dashboard (anonymised competitor names) showing a specific gap or insight. Caption frames the lesson.
- **Worst-performing format:** Generic "What is GEO?" thought leadership.
- **CTA:** Free crawlability check or "DM for a demo." Never "click the link in bio."

### 8.2 Email outreach

- Target ICP A directly. ICP B (agencies) come inbound from LinkedIn + community.
- Hook in the subject line: a specific, name-mentioning observation. "Saw [competitor] cited 5x in ChatGPT for [their main keyword] — quick question" beats "Improve your AI visibility."
- Keep emails under 100 words. CTA is a 15-minute call, not a feature dump.

### 8.3 Inbound (organic search + AI)

- Indexed pages: `/`, `/preview`, `/pricing`, `/agency`, `/crawlability`, `/faq`, `/changelog`. Drive long-tail SEO (and now AI) traffic.
- Ironically, the best test of CMO.ie's value prop is whether CMO.ie itself shows up in AI answers for "AI visibility tracker for Irish brands." We track our own visibility on the same platform we sell.

### 8.4 Community

- Irish marketer Slack groups, agency Slack groups, Indie Hackers Ireland.
- Don't dump links. Share specific, anonymised insights from the product. Build authority; the link follows.

### 8.5 Howl.ie peer agencies

- Warm intro path. Howl already knows ~50 Irish digital agencies. Pitch them on Agency tier as a tool they sell, not as a tool they use.

---

## 9. Customer story templates

When you have a customer agree to be quoted, use these prompts to extract a usable story:

1. "What were you tracking about AI visibility before CMO.ie?" (Almost always: nothing.)
2. "What was the first surprising thing you saw in the product?" (The story moment.)
3. "Can you describe one specific change you made because of CMO.ie?" (Concrete action.)
4. "What would you tell another Irish marketer who's deciding whether to try it?" (The pull-quote.)

Story format:

> **[Brand]** ([sector], [size]) had no idea whether AI tools mentioned them in their category. Within a week of using CMO.ie, [specific finding]. They acted by [specific change], and [outcome].

---

## 10. Roadmap context (so you don't accidentally promise something that's coming later)

### Shipped + working today

- Brand profile auto-extract + edit
- Single-shot prompt suggester (10 prompts)
- Phase 6 batch generator (30-50 prompts + score + Google mirror)
- Daily runs across 5 AI engines
- Visibility chart, share-of-voice, sentiment
- Sources + Gap Analysis (domain + URL)
- Action plans (gaps / strategy / full tiers)
- Briefs + drafts + polish requests
- SEO audits
- Monthly playbooks (generation; email send is in flight)
- Crawlability tool (public, free)
- Audit Council (internal — never mentioned to customers)
- Agency tier with credit pool
- Stripe billing
- MCP server + REST API

### In flight

- Resend dispatcher for email send (newsletter confirmations, monthly playbook delivery).
- Phase 6 follow-ups (per-row score/mirror buttons, real keyword volume adapter).
- Phase 7 Audit Council follow-ups (auto-regeneration, Slack alerts when flag rate spikes).

### On the roadmap, NOT yet shipped (don't promise)

- White-labelled agency client logins.
- Per-prompt country / IP targeting.
- Tags + topics + AND/OR filters.
- Active / Inactive / Deleted prompt states with history preservation.
- Bulk CSV upload of prompts + competitors.
- Public pricing for Looker Studio connector (deprioritised).
- Adding Copilot / Grok / AI Mode to the model roster.

---

## 11. Operational notes

### Monitoring + signal

- The `/admin` dashboard shows real-time customer KPIs (active orgs, projects, signups in last 7d), AI spend, and system health. Marketing can pull it monthly to see signup velocity.
- The Audit Council inbox at `/admin/audit-council` shows where the AI is flagging hallucinations in our generated content. Worth a weekly skim — if a flag pattern emerges (e.g. brand profiles consistently mis-segmenting agency customers), that's a marketing-facing risk to flag.

### Where data lives

- Customer accounts + project data: Supabase (EU region).
- App + customer-facing pages: Vercel.
- AI providers: Anthropic, OpenAI, Google, Perplexity. Documented in `/privacy`.
- Email send (when Resend ships): Resend.

### Sources of truth

- Pricing: `src/lib/types.ts` → `PLAN_LIMITS`. The `/pricing` page reads from this so changes propagate automatically.
- Feature copy: `src/app/page.tsx` (teaser), `src/app/preview/page.tsx` (full landing), `src/app/faq/page.tsx`.
- Brand voice rules: `src/app/api/prompts/suggest/route.ts` system prompt + `src/app/api/prompts/generate/route.ts` system prompt — written in CMO.ie house voice, used as a reference when writing customer-facing copy.

### Internal tools to know about

- `/admin` — landing dashboard for the ops team.
- `/admin/audit-council` — hallucination review queue (internal only).
- `/admin/audit-council/metrics` — flag-rate trends.
- `/admin/playbooks` — preview / regenerate monthly playbooks.
- `/admin/admins` — grant / revoke admin access (DB-backed; bootstrap env list exists too).

---

## 12. Quick reference

- **Demo url:** Have a sandbox-account project ready. Email `odhran@howl.ie` if you don't have access.
- **Sales contact email:** `hello@howl.ie`.
- **Privacy / DPO email:** `privacy@howl.ie`.
- **Bug reports:** `hello@howl.ie` or in-product chat.
- **Press / PR:** `odhran@howl.ie`.
- **Repo:** `github.com:ozmoont/cmo-ie-app`.
- **Stripe dashboard:** Howl.ie account, owners + finance only.
- **Vercel project:** `og-6054s-projects/cmo-ie-app`.
- **Supabase project:** `bxnerkcilighzveyxyhv`.

---

## 13. What this doc deliberately doesn't have

- Slide decks. Lives in a separate Howl.ie marketing folder.
- Specific campaign plans. Those are quarterly + change too fast for a playbook.
- Customer-by-customer notes. Lives in CRM (when we have one).
- Pricing for one-off audit packages. Email sales.

If you find yourself adding any of the above to this doc, take it back out and put it in the right place. This playbook earns its keep by staying small + always-current.
