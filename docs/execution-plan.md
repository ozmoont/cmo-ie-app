# CMO.ie execution plan — solo + AI, 6 months to credible parity

_Input constraints: 1 FTE (you), AI-augmented (Claude Code / Agents / API), target date mid-October 2026 for "credibly parity with Peec on the surface our ICP cares about"._

_Source of truth for the gaps this plan addresses: [`peec-ai-competitive-review.md`](./peec-ai-competitive-review.md)._

## The reality check

Peec has 30+ FTEs and a ~2 year head start. **You cannot match their full surface area in 6 months.** Attempting it leads to half-built everything and shipped nothing.

The winning move is a narrowed plan with three properties:

1. **Cover the surface a Dublin marketing director would grade us on** when evaluating us vs Peec on a sales call. That's a specific, bounded set.
2. **Go deeper than Peec on two things they can't copy quickly** — Irish-market defaults and the content-creation pipeline (brief → draft → polish).
3. **Explicitly cut** 30-40% of what's in the gap review. A published kill list is as important as a build list.

## Guiding principles for the 26 weeks

- **Ship weekly.** A feature not deployed by Friday didn't happen that week. No 3-sprint epics.
- **Schema before UI.** For anything involving new data (sources, tags, topics, geos), ship the schema + data capture in week _N_ and the UI in week _N+1_. Lost data can't be back-filled.
- **Claude is a team member, not a tool.** Budget API spend as a line item. Classifier work (source type, URL type, competitor detection, brief drafting) is Claude's job — not yours.
- **Every feature must be demo-able in <30 seconds.** If a sales call can't see the gain, the feature is scope creep.
- **Stop the bleed on feature debt.** No new features in Jan–Feb 2026 that aren't on this plan. Customer requests go in a queue, not the sprint.
- **One day a week is not coding.** Support, sales, content, model-bill-audit. Burnout kills this plan more than any technical risk.

## Team model

You're the only FTE. The "team" is:

| Role | Capacity | What they do |
| --- | --- | --- |
| **You** | 4 days/wk build, 1 day non-build | Architecture, product decisions, customer work, critical path code. |
| **Claude Code** | Unlimited, pay-per-token | Implementation labour, tests, boilerplate, refactors, PR reviews. Use aggressively. Expected monthly spend: €200–600 depending on intensity. |
| **Claude via Anthropic API** | Production workload | Source type classifier, URL type classifier, competitor detection, brief/draft generation, prompt suggestions. Expected monthly spend: €300–800 at 50-100 active projects. |
| **Specialist contractor #1 — data collection engineer** | 40-80 hours, weeks 4–10 | Get Perplexity, ChatGPT-with-search and Gemini chat data flowing reliably. This is the hardest engineering problem on the plan and the one most likely to swallow a solo founder for a month. Budget €4–8k. |
| **Specialist contractor #2 — product designer** | 20-40 hours, weeks 14–18 | One pass across Sources views + Gap Analysis + Actions v2. Impeccable.md gets us 80%; a designer gets us the remaining 20% that closes sales. Budget €1.5–3k. |
| **Howl colleague (optional)** | Ad-hoc | Sales / customer conversations. Not code. |

Total out-of-pocket budget for contractors + Claude API: **~€8–14k over 6 months**. Comparable to 1.5 months of a junior engineer's salary, for roughly the same output on the work only a specialist should touch.

**Nothing else gets hired.** No PM, no ops, no marketing hire. Howl infrastructure covers that.

---

## The 26-week plan

Week numbering starts the Monday after this plan is approved. Dates assume start week of 27 April 2026, so target end is **25 October 2026**.

### Phase 1 — Credibility foundations (Weeks 1–6)

Goal: close the gaps that make our sales pitch fall apart. No new UI pages until the data model is honest.

**Week 1 — Honest data-collection audit**
- Document what channel we currently use for each model (Claude API, Gemini API, etc.).
- Spike: is Perplexity data accessible via their API, and does it differ materially from UI?
- Spike: ChatGPT-with-search data path — do we have it at all?
- Decision point end of week: which models stay API-only, which need scraped channels.
- **Deliverable:** `docs/data-collection-sources.md` — one page, publish internally so this choice is traceable.
- *You alone. No contractor yet — they come in week 4 once the spec is clear.*

**Week 2 — Schema foundations**
- Migration `005_sources_and_mentions`: `chat_sources` (chat_id, url, domain, position, was_cited), `chat_brand_mentions` (chat_id, brand_id, position, is_our_brand).
- Migration `006_tags_topics`: `topics` table, `prompt_topics` join, `tags` table, `prompt_tags` join, indexes for AND/OR filtering.
- Migration `007_brand_matching`: `brand_aliases` (brand_id, alias), `brand_domains` (brand_id, domain), add `display_name`, `tracked_name`, `regex_pattern`, `color` to competitors.
- Migration `008_brand_profile`: structured `brand_profile` columns on projects — `short_description`, `market_segment`, `brand_identity`, `target_audience`, `products_services` (jsonb).
- Migration `009_prompt_states_and_geo`: add `status` enum (active/inactive/deleted), add `country_code` ISO-3166.
- **Ingest pipeline updates on the same branch** — the run engine starts writing to these tables immediately, even before UI exists. This is non-negotiable: the day you ship UI without backfill, you've lost a week of data.
- *Claude Code implements. You review migrations.*

**Week 3 — Brand matching upgrade + auto-detected competitors**
- Replace the single-name competitor matcher with: primary tracked_name + aliases + optional regex. Match against the stored per-response text.
- "Suggested competitors" pipeline: after each daily run, detect unmodelled brand mentions, increment a counter, surface at ≥ 2 mentions as a suggestion with Track/Reject buttons.
- UI: competitor detail page upgrade — display_name, tracked_name, aliases, multiple domains, brand colour picker.
- **Demo:** "I added 'HubSpot, Inc.' as an alias and all 47 historical mentions re-classified."

**Week 4 — Share of Voice + brand profile capture**
- SoV metric: compute from `chat_brand_mentions`. Add to the Brands ranking table on the dashboard. Add `summariseSoV` alongside the existing summarisers.
- Brand profile onboarding: on project creation, fetch the website and have Claude extract the 6 profile fields. Present in a "confirm your profile" step (editable). Store. Use going forward in prompt suggestions instead of re-fetching.
- Retro-fit existing projects with auto-extracted profiles they can confirm / edit.
- **Data-collection contractor starts** in parallel — week 4 through week 10.

**Week 5 — Per-prompt geography**
- Add country selection to prompt add form (IE, UK, US, DE, FR to start). Default to org's home country.
- Run engine honours country per prompt — for API-based models, inject location context in the system prompt; for scraped channels, route through a geo-appropriate IP.
- Country filter on dashboard.
- **Demo:** "Same prompt, run from Ireland vs US — here's how Irish customers see it."

**Week 6 — Prompt states (active/inactive/deleted) + bulk CSV upload**
- State transitions with history preservation on inactive.
- Batch actions UI (select multiple, activate/deactivate, move to topic, assign tags).
- CSV upload with the Peec-style format: prompt, country, topic, tags.
- **Phase 1 demo call.** Book an Irish agency friend for a 30-min walkthrough. Seriously — this is what tells you whether Phase 1 landed or not.

### Phase 2 — Sources & gap analysis (Weeks 7–14)

Goal: the single biggest strategic gap. This is the phase that determines whether we can sell against Peec.

**Week 7 — Source domain classifier**
- Claude-powered classifier: given a domain + sample page, classify as Editorial / Corporate / UGC / Reference / Your-own. Cache indefinitely.
- Backfill classification on the per-chat source data captured since Week 2.
- **Deliverable:** every chat_source row has a source_type by end of week.

**Week 8 — Source URL page-type classifier**
- Same pattern: given a URL's rendered content, classify as Article / Listicle / How-To / Comparison / Product Page / Review / etc.
- Run at ingest time going forward; backfill what we can.
- Cache per-URL forever; re-classify only on manual trigger.

**Week 9 — Sources → Domains view**
- Domain-level table: retrieved %, retrieval rate, citation rate, source type, trend sparkline.
- Click-through to domain detail.
- Source-type breakdown chart.
- **Demo:** "These are the 8 domains that matter in your category. This one, businessplus.ie, drives 30% of mentions on prompts about Irish SaaS."

**Week 10 — Sources → URLs view**
- URL-level table: filtered by domain or cross-domain.
- URL detail page: prompts that trigger it, citation history, page type, screenshot (future).
- **Contractor #1 wraps up by end of this week.** Data collection should be stable by now.

**Week 11 — Gap analysis (the killer feature)**
- Given project + date range, return: sources where ≥ 1 tracked competitor is mentioned and we're not. Sorted by (source-frequency × competitor-breadth).
- Two views: Domain gaps and URL gaps.
- Each gap has a recommended playbook based on source type (editorial → PR outreach, UGC → community engagement, reference → directory submission, corporate → partnership).
- **Demo:** "Here are 12 places your competitors show up that you don't, ranked by how often AI uses them. Click one and see exactly what prompt triggered a competitor mention."

**Week 12 — Actions v2 — re-grounded on sources**
- Our existing brief/draft/polish flow gets wired into gap analysis results.
- A gap → produce a brief → draft the outreach email / listicle / LinkedIn post / press release → polish pass.
- The Action's opportunity signal is now source-based, not just brand-mention-based.
- **Demo:** "I clicked the gap on 'business.ie' and 45 seconds later I had a drafted pitch to their editor."

**Week 13 — Tags + topics + dashboard filtering**
- Tag and topic CRUD UI.
- Dashboard filters: tags (AND/OR), topics, country, model, competitor, date range with period-over-period delta. Persist filter state in URL.
- Per-prompt drilldown page ("click any active prompt, see a focused dashboard").
- *This was originally Phase 3 in the review but it's cheap once Phase 2 is done — and the filters are what make the Sources and Gap views usable at scale.*

**Week 14 — Phase 2 polish + design pass**
- **Contractor #2 (designer) comes in** for Weeks 14–18 intermittent work.
- Tighten the Sources / Gap / Actions screens specifically.
- Empty states, loading states, error states across all new surfaces.
- Mid-phase demo call with the same Irish agency contact from Week 6.

### Phase 3 — Integrations + agency tier (Weeks 15–20)

Goal: everything needed before we can pitch an agency plan to Howl's peers.

**Week 15 — Public REST API v1**
- OAuth app + API keys per org.
- Scoped read endpoints: `/projects`, `/metrics`, `/prompts`, `/chats`, `/sources`, `/competitors`.
- Rate limits, pagination, docs site.
- Expose the same data your dashboard shows. No more, no less.

**Week 16 — MCP server**
- Reuse the REST API. Wrap with an MCP server (streamable HTTP + OAuth 2.0).
- Tools: `get_visibility`, `get_competitors`, `get_sources`, `get_gap_analysis`, `list_prompts`, `get_prompt_detail`, `get_recent_chats`. All read-only.
- Published as a Claude connector.
- **Demo:** "I ask Claude 'how did my AI visibility change last week?' and get a real answer from my CMO.ie data."
- *This week alone probably has the biggest sales-narrative payoff-per-hour of any week on this plan.*

**Week 17 — Credit-pool pricing (agency tier)**
- New plan type: Agency. Credit pool instead of per-plan limits.
- Allocation UI: assign X credits to Client Y's project.
- Billing: monthly pool drains or renews depending on commit.
- Reuse our existing Stripe integration.

**Week 18 — Multi-client org management polish**
- We already have `org_api_keys`; finish the flows.
- Agency-level dashboard: all clients at a glance, roll-up visibility, per-client drilldown.
- Brand / org switching UX.
- Invitation flow polish.

**Week 19 — Export everywhere + model coverage**
- CSV export: chats, prompts, sources, gap analysis.
- Add Microsoft Copilot + Grok as trackable models.
- *These two additions depend on the data-collection work from Phase 1. If scraped channels are live, adding a model is days, not weeks.*

**Week 20 — Agency tier launch**
- Landing page for `/agency`.
- Book three agency calls from Howl's network.
- Soft-launch pricing.

### Phase 4 — Irish differentiation + free acquisition tools (Weeks 21–25)

Goal: push the asymmetric bets that Peec can't easily replicate.

**Week 21 — Irish source weighting + publisher library**
- Maintain a curated list of ~150 Irish publishers / directories / communities, tagged by sector.
- Gap analysis + Actions prefer these when relevant.
- "Irish opportunity" badge on sources that are .ie / Irish-audience.
- Sector templates: Law / Construction / Food & Bev / Tech / Hospitality / Tourism — each with a sensible default prompt pack, competitor starter list, and publisher targets.

**Week 22 — Monthly playbook generator**
- End-of-month: each project gets an auto-generated "your 3 moves this month" email. Uses gap analysis + actions + credit availability.
- Reuses the Actions pipeline; purely a new wrapper + delivery channel.
- **This is your answer to "Peec's dashboard is powerful but tells me nothing about what to do."**

**Week 23 — Crawlability as a free tool**
- Public page at `cmo.ie/crawlability`. No login needed.
- Parse any domain's robots.txt, check against the Peec-published bot directory (40+ bots), show allowed / partial / blocked.
- URL tester.
- Email capture for "weekly crawlability report".
- Strong top-of-funnel.

**Week 24 — Looker connector (if agency pipeline demands it)**
- Keep as optional. Build only if 2+ agency prospects have explicitly asked.
- Otherwise, skip — REST API + MCP server cover the use case.

**Week 25 — Buffer + polish + hard conversations**
- Reserved for slip. If weeks 1-24 all hit on time, use this for customer-requested polish and launch prep.
- Realistically at least 2 weeks of the plan will slip — this is the absorption.

### Phase 5 — Launch readiness (Week 26)

- Pricing page update to reflect new tiers.
- Changelog / release notes for the last 6 months of shipping.
- Launch post on Howl's channels + LinkedIn + maybe Indie Hackers.
- Book 10 agency demos.

---

## Explicitly on the kill list

The whole point of a plan this tight is the ruthless cut list. We are NOT building:

1. **Crawl Insights (server log ingestion)** — shelved. Revisit in Q1 2027. It's a valuable feature but swallows 4-6 weeks and is useless without source tracking, which Phase 2 is already doing.
2. **Full UI scraping fleet** — decided in Week 1. If the honest audit says we need it for ChatGPT + Perplexity, we scope down to those two with the contractor; we do not try to out-scrape Peec across 8 platforms.
3. **Video walkthroughs / in-app video library** — no time, and this is Peec's feature not an industry-standard one.
4. **Deep RegEx UI for competitor matching** — ship primary + aliases. Regex is an Enterprise conversation, not default UX.
5. **Query Fanouts (ChatGPT) + common terms** — fascinating data but ChatGPT-specific and hard to get. Defer to Q1 2027.
6. **Localisation beyond Ireland-UK-US-DE-FR geos** — no "add your own country" UI. Contact form + 2-day SLA if Enterprise asks.
7. **Volume score (prompt-level demand signal)** — Peec has it in beta; we defer. It's the least useful of Peec's differentiators for our ICP.
8. **Per-brand colour customisation** — one-day build but not needle-moving. Defer to polish week.
9. **In-app activity timeline / audit log** — Enterprise-tier ask; defer.
10. **Chrome extension / Figma plugin / mobile app / browser tool** — none of this.

If a customer asks for any of the above during the 26 weeks, the answer is "noted in the roadmap, not this half, here's why." Write that sentence once and copy-paste.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Data-collection week 1 audit reveals we have meaningfully worse data than Peec | High | High | Contractor #1 in weeks 4–10 to fix. Budget upfront. |
| Schema in Week 2 has a bug that corrupts months of source data | Medium | High | Write end-to-end tests for the ingest path in Week 2. Review migrations with Claude + one external engineer. Add monitoring alerts for zero-source days. |
| Claude API costs exceed budget as projects grow | Medium | Medium | Cap monthly spend with alerting at €500 / €800 / €1000 thresholds. Aggressively cache classifier outputs. Use Haiku for classification where quality holds up. |
| Burnout — 26 weeks of solo grind | High | High | **One day a week is mandatorily non-coding.** Weekly check-in with a Howl peer. No weekends in the first 8 weeks. |
| Gap analysis UX doesn't land | Medium | Very High | Book the Irish agency demo in Week 14 specifically to pressure-test this before Phase 3. If it's unclear, stop Phase 3 and iterate. |
| Contractor #1 doesn't deliver / goes quiet | Medium | High | Start conversations in Week 2, not Week 4. Have a backup contact. Contract deliverables, not hours. |
| Peec ships Irish-market features in H2 2026 | Low | High | Unlikely given their focus. If signals appear, pull Phase 4 forward. |
| Customer runs into a blocker we haven't built (e.g. asks for Salesforce integration) | High | Medium | Template response. Queue, don't divert. |
| Stripe / billing regression when adding agency tier | Medium | High | Test migrations on a staging account with a real EU VAT flow before shipping Phase 3. |
| You lose a week to a single rabbit hole (common failure mode) | High | Medium | If a feature takes more than its allocated week by Wednesday, either cut scope or defer to buffer week. Hard rule. |

---

## Revenue signposts

For the financial model, rough revenue milestones this plan should hit:

- **End of Phase 1 (Week 6, ~mid-June):** 5-10 paying customers on existing tiers. Mostly friendlies and Howl network. €500-€1500 MRR.
- **End of Phase 2 (Week 14, ~early August):** 20-30 paying customers. Gap analysis demo is closing cold-ish calls. €2k-€4k MRR.
- **End of Phase 3 (Week 20, ~late September):** First 2-3 agency accounts at Agency tier (€500-€1500/mo each). €5k-€9k MRR.
- **End of Phase 4 (Week 25, ~mid-October):** Public launch momentum. 50+ customers. €10k+ MRR target.

All of this assumes baseline acquisition work is happening (content, Howl network, outbound). If you're shipping features but not selling, these numbers don't land regardless of code.

---

## First two weeks — ticket-level breakdown

To keep you from spending your first day on this doc rather than building:

### Week 1 (starts Mon 27 Apr 2026) — Data-collection audit

Tickets (all solo, no contractor yet):

1. **Audit current model channels.** For each of Claude, ChatGPT, Perplexity, Gemini, Google AI Overviews: what data source do we use? API? Scraped? Mock? Document in `docs/data-collection-sources.md`.
2. **Run a data-quality spike.** Pick 3 prompts from a real project. Query each model through every available channel (API, UI if possible). Record the differences in response text, source lists, position order.
3. **Perplexity API evaluation.** They have a Sonar API. Is the source list in the API response the same as what shows in the UI sidebar? Document with screenshots.
4. **ChatGPT-with-search evaluation.** We either have this or we don't. Document the reality.
5. **Decision memo.** Given the findings, draft a one-pager: "For each model, here's the channel we'll use in production and why." Circulate to yourself for 24h, then commit.
6. **Post job spec for Contractor #1.** 2 paragraphs, 3 deliverables, 6-week engagement, skills: Playwright/Puppeteer, proxy networks, TypeScript, Node.js worker experience. Post to Howl's network + 2 contracting platforms.

### Week 2 — Schema foundations

Tickets (Claude Code drafts, you review):

1. **Migration 005: sources + mentions tables.** With indexes and RLS policies.
2. **Migration 006: topics + tags + joins.** With AND/OR-friendly indexes.
3. **Migration 007: brand matching expansion.** aliases, domains, display/tracked name split, regex, colour.
4. **Migration 008: structured brand profile columns.** Including a JSON-backed products/services field.
5. **Migration 009: prompt state enum + country code.**
6. **Update run engine ingest to write to all new tables.** Even before UI consumes them.
7. **Write integration tests** for the ingest path to verify every run produces sources, mentions, topic/tag associations.
8. **Monitoring.** Daily cron that alerts if yesterday's runs produced zero `chat_sources` rows.
9. **Backfill as much as possible** from existing chats. Where the source URL list wasn't captured historically, write NULL and move on.

That's 15 tickets across 2 weeks. Each should be ~4 hours for Claude Code + your review. Budget 40 hours/week of focused work; the rest is thinking, docs, customer calls, and sleep.

---

## How we stay honest

At the end of each week, answer three questions in a file called `docs/weekly-log.md`:

1. What shipped this week?
2. What didn't ship this week that should have?
3. What's at risk in the next two weeks?

One paragraph each. No markdown shenanigans. Don't edit last week's entry.

If two consecutive weeks show drift on question 2, the plan needs a rewrite, not more effort.

---

## Bottom line

Three things to internalise:

1. **You can't out-build Peec. You can out-prioritise them.** Their team makes 10× what you make but spends it on 10× the surface. Your pound-for-pound move is fewer features, shipped deeper, aimed harder at Irish marketers + agencies.
2. **Contractors are cheaper than burnout.** The €8-14k contractor budget in this plan is an insurance policy on finishing. Don't cut it.
3. **Week 14 (mid-August agency demo) is the checkpoint that matters.** If Gap Analysis lands with a real agency by then, the rest of the plan is just execution. If it doesn't, the plan needs reshaping — not louder grinding.

Good luck. Ship on Fridays.
