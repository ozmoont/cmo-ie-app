# Peec.ai vs CMO.ie — Deep Competitive Review

_Research date: 19 April 2026. Sources: `docs.peec.ai` intro, metrics (visibility, SoV, sentiment, position), prompt setup, organising, competitors, sources, chats, performance, actions, crawl insights, crawlability, use cases, agencies, MCP server, Looker connector, brand profile, API intro._

## TL;DR

Peec has a **substantially broader** product surface than CMO.ie today, but much of that surface is in two buckets we can ship quickly (better prompt org + proper source analysis) and one we should think carefully about before copying (server-log-based Agent Analytics).

The biggest strategic gaps, roughly ranked by impact:

1. **Source / citation tracking** — the single most important thing we're missing. Peec positions sources as "the foundation of AI optimisation" because customers can only influence sources, not the LLMs directly. We track brand mentions but not the URLs AI models retrieve or cite. Without this, our Actions feature is operating on less than half the signal.
2. **Share of Voice** as a distinct metric — not just visibility. Visibility answers "am I mentioned?", SoV answers "when something gets mentioned, how often is it me vs competitors?". Two different questions.
3. **Brand matching fidelity** — tracked name, aliases, regex, display name. Our competitor model is a single `name` string. Misses "HubSpot / HubSpot Inc. / hubspot.com" collapsing to one brand.
4. **Topics + Tags + batch operations** — we have `category` (awareness/consideration/decision) as a single enum. Peec has topics (one per prompt, folder-style) and tags (many per prompt, filter-style) with AND/OR logic across the whole dashboard.
5. **Auto-detected competitor suggestions** — Peec surfaces "brands mentioned alongside yours ≥ 2 times" as pending suggestions. Low-effort, high-value.
6. **Per-prompt geography / country** — CMO is Ireland-focused so we could make this a superpower, but today every prompt runs from a single location.
7. **Gap analysis** — sources where competitors appear but you don't. This is _the_ move-the-needle feature for agencies.
8. **Agent Analytics** (server-log bot crawl tracking) — meaningful but expensive to build. Evaluate vs priority list.
9. **Integrations** — Looker Studio connector, public API, MCP server. The MCP server in particular is cheap to build and is how Claude-fluent customers will increasingly want to consume this data.
10. **Agency-mode pricing** — credit allocation across clients. Directly relevant to Howl.ie as an agency dogfooding CMO.ie.

Things Peec does **not** have that we do, and should lean into:
- A structured **brief → draft → polish** content workflow. Peec's "Actions" tell you _where_ to act but stop before the output. Our action drafting is a genuine differentiator.
- Irish-market framing. Peec is a German/global product; we can out-localise on prompts, IP geos, and source weighting for .ie sites.

The rest of this doc is the evidence.

---

## 1 · Core metrics comparison

| Metric | Peec.ai | CMO.ie | Gap |
| --- | --- | --- | --- |
| **Visibility** (% of responses mentioning brand) | Yes. Line + bar charts, daily/weekly/monthly, top 6 competitors. | Yes. `summariseScore` already maps to Strong/Moderate/Low/Not visible tiers. | Close parity on metric, thinner on chart controls. |
| **Share of Voice** — % of _brand mentions_ that are yours vs all brands | Yes. Distinct from visibility: visibility = 4/10 chats, SoV = 4/(4+12) = 25%. | **Not tracked.** | **Missing.** Can be computed from existing data if we store per-chat brand mentions with positions. |
| **Sentiment** (0–100, tonal analysis) | Yes. Most scores 65–85. Positive / Neutral / Negative indicators from language analysis. | Yes. `summariseSentiment` with Positive/Mixed/Needs attention tiers. | Close parity. We should publish our scale (0–100) explicitly. |
| **Position** (avg ranking when mentioned) | Yes. Calculates average across all responses. Includes non-tracked brands in the order. | Yes. `summarisePosition` with Top/Mid-pack/Buried. | Close parity. Peec's subtlety: position counts _all_ brands mentioned, not just tracked competitors. Need to check our implementation. |
| **Volume** (prompt demand score 1–5) | Yes (beta). Combines real-time search trends, AI conversation data, industry signals. | Not tracked. | Medium gap. Useful for prompt prioritisation. |

### Verdict on metrics
We have the three headline metrics; we're missing SoV and Volume. SoV is the cheaper win — it's derivable from existing chat data if we capture brand-mention lists per response. Volume requires a third-party data source.

---

## 2 · Prompt management

| Feature | Peec.ai | CMO.ie | Gap |
| --- | --- | --- | --- |
| Manual prompt add (single) | Yes, max 200 chars. | Yes. | — |
| Manual prompt add (multi / batch) | Yes, line-break separated. | Unclear — likely single-entry. | Small. |
| CSV bulk upload | Yes. Comma/semicolon, columns: prompt / location / topic / tags. UTF-8. Template provided. | **Not implemented.** | Medium. Agencies and large clients will expect this. |
| AI-suggested prompts | Yes. Industry + brand-context driven. "Suggest more" button. | Yes — `/api/prompts/suggest` with Claude + website context extraction. We fetch ~200KB HTML and extract title / meta / og / H1 / body sample. **Actually better documented in code than Peec's version.** | No gap; we may be ahead on the reasoning transparency. |
| Suggested prompts as pending queue | Yes — separate `Suggested` / `Active` / `Inactive` tabs. `Track` / `Reject` buttons. | Partial — suggestions surface in UI but state model unclear. | Small. Formalise the queue. |
| Active / Inactive / Deleted state model | Yes. Inactive preserves history; deleted wipes data; suggested doesn't count toward limit. | Unclear, probably active/deleted only. | Medium. Inactive-with-preserved-history is genuinely useful for plan management. |
| Per-prompt country / IP | Yes. ISO-3166 alpha-2. Peec mentions "contact us if your country isn't in the list". | **Not supported.** Every prompt runs from the same geo. | Large. This is the Irish-market angle we should not concede. |
| Prompt-level analytics | Yes — visibility, sentiment, position, mentions, volume, tags, location, added date, all in the prompt list. | Partial. | Medium. |
| Individual prompt dashboard | Yes — mini-dashboard per prompt with competitor filter, Query Fanouts (ChatGPT), common terms, recent chats. | Partial — `projects/[id]/prompts` shows the list, no per-prompt drilldown. | Medium–Large. |
| Query Fanouts (what related queries ChatGPT ran internally) | Yes, ChatGPT-only. Shows common terms across fanouts. | Not tracked. | Medium — depends on whether we can get fanout data via the channel we use. |
| Category (awareness / consideration / decision) | **Not present as a product concept.** Peec has topics + tags instead. | Yes — `PromptCategory` enum. | This is ours. Keep, but consider layering tags on top. |

### Verdict on prompts
Our AI suggestion engine is solid and our category taxonomy has a clearer mental model than Peec's "topics + tags" for non-technical marketers. We're behind on: CSV upload, per-prompt country, inactive state, per-prompt drilldown, prompt-level tag/topic filtering.

---

## 3 · Organisation (topics + tags)

| Feature | Peec.ai | CMO.ie | Gap |
| --- | --- | --- | --- |
| Topics (one per prompt, folder-style) | Yes. Generates better prompt suggestions when topics exist first. | Not present. We have `PromptCategory` but it's a fixed 3-value enum. | Large. Custom topics would let clients organise by product line / market / sub-brand. |
| Tags (many per prompt, free-form) | Yes. AND/OR filtering. Applied across dashboard filters. | Not present. | Large. |
| Batch actions on prompts (checkbox, shift-select, select-all) | Yes — assign tags, assign topics, activate/deactivate/delete. | Not present. | Medium. Annoyance amplifier as prompt counts grow. |
| Filter dashboard by tags / topics | Yes. With AND/OR. | Not present. | Large. Without this, an agency tracking a client across 10 product lines can't slice the data. |
| Analytics aggregated at topic level | Yes. | Not present. | Large. |

### Verdict
This is a quick-to-build, high-user-value set of features. Implementation is mostly a join table (`prompt_tags`, `prompt_topics`) + UI + filter state. No ML involvement.

---

## 4 · Competitor / brand setup

| Feature | Peec.ai | CMO.ie | Gap |
| --- | --- | --- | --- |
| Manual add | Yes — Display Name, Tracked Name, Domain, optional regex. | Yes — single `name` + optional `website_url`. | Close. |
| Display name vs tracked name | Yes. Display is human-readable, tracked is the matching string. | No distinction. | Medium. Matters when tracking e.g. "AWS" that's written 5 different ways. |
| Aliases (alternative spellings, abbreviations) | Yes. | Not supported. | Large. Every real brand has aliases. |
| Regex matching | Yes. Case-sensitive, useful for disambiguating dictionary words like "Apple" or distinguishing "US" from "us". | Not supported. | Medium. Advanced but important. |
| Multiple domains per brand | Yes. Used to classify sources as "You" / "Competitor". | Only one `website_url`. | Medium–Large. |
| Brand colour | Yes. Custom colour picker for charts. | Not present. | Small but polish. |
| Auto-suggested competitors (detected in chats, ≥ 2 mentions) | Yes. Pending queue with Track / Reject. | **Not present.** | Large. This is the feature customers don't know they want until they see it. |

### Verdict
Our competitor model is too thin. The alias + regex layer is needed for any client whose brand isn't a unique token. Auto-detection is a clear shippable win that reuses the chat-analysis pipeline we already have.

---

## 5 · Brand profile (onboarding & configuration)

Peec extracts this from the domain at onboarding:
- Company name
- What you do (short description)
- Market segment / industry
- Brand identity (positioning)
- Target audience
- Products / services list

Used to personalise topic suggestions and prompt suggestions. Editable at any time; changes trigger re-suggestion.

**CMO.ie:** Has `brand_name` and `website_url`. Our prompt-suggestion code fetches the website and extracts title, meta description, og:description, og:site_name, H1, and a body sample — but this content is used ephemerally for each suggestion call, not stored as a structured profile.

**Gap:** Medium–Large. Extracting this into a stored brand profile means:
- Suggestions get better because Claude sees a curated, user-corrected profile instead of raw HTML every time.
- Faster suggestion calls (no web fetch each time).
- Users can fix the profile when industry inference is wrong.
- Becomes the anchor for downstream personalisation (action writing, competitor suggestions, sentiment context).

This is probably our highest-leverage onboarding change.

---

## 6 · Dashboard & filters

| Feature | Peec.ai | CMO.ie | Gap |
| --- | --- | --- | --- |
| Visibility graph, top N competitors | Yes — top 6, daily fluctuations, hover values. | Yes — `analytics-charts.tsx`, `project-charts.tsx`. | Close. |
| Brands ranking table (visibility, SoV, sentiment, position) | Yes — for top 7, "Show All" for full list. | Partial — likely 3 metrics, no SoV. | Add SoV column. |
| Recent chats with "brand mentions only" toggle | Yes. | Yes — `recent-chats.tsx`. | Close. |
| Top sources section | Yes — Type chart + Domain table with Retrieved / Retrieval rate / Citation rate / Type. | **Not present.** | Large. See section 7. |
| **Dashboard filters:** | | | |
| · Competitor filter | Yes. | No. | Medium. |
| · Date range with period-over-period change indicator | Yes — default 7 days, custom ranges, compares to previous period. | Partial — charts exist, unclear on PoP indicators. | Small. |
| · Tag filter (AND/OR) | Yes. | No. | Large (depends on tags being built). |
| · Model filter | Yes — ChatGPT / Claude / Perplexity / etc. | Partial — we track model per run but unclear UI-side. | Medium. |
| · Country filter | Yes. | No. | Medium. |
| · Topic filter | Yes. | No. | Medium. |
| Per-prompt filtered dashboard | Yes — same layout as main overview, one prompt deep. | No. | Medium–Large. |
| Brand visibility vs source visibility distinction | Yes — brand can be mentioned _or_ cited as a source, each tracked separately. | No — we only track brand mentions. | Large. Tied to source tracking. |

---

## 7 · Sources & citations (biggest single gap)

Peec's whole optimisation strategy hangs off this. Quote:
> Optimizing sources gives you the most control over your AI visibility... When AI models reference sources where you have a stronger presence, your visibility increases.

Features Peec ships, none of which we have:

- **Source tracking per chat.** Every chat stores the full list of URLs the AI accessed + an explicit citation list (sources referenced in response text).
- **Sources vs citations distinction.** All citations are sources; not all sources are citations. Peec reports both.
- **Domain-level analytics.** Top domains used across all your chats. Columns: Retrieved %, Retrieval rate, Citation rate, Source type.
- **URL-level analytics.** Page type classification (Article, Listicle, How-To Guide, Comparison, etc.). Click-through to see usage over time + which prompts trigger it.
- **Source type taxonomy.** Editorial / Corporate / UGC / Reference / Your own. Each has a different optimisation playbook (editorial = PR outreach, UGC = community engagement, etc.).
- **Gap analysis.** The killer feature: "sources where competitors are mentioned but your brand isn't." Sorted by Gap Score. Different playbooks by source type.

**Gap:** Extra-Large. This is the feature gap that most threatens our pitch. Without source tracking, our Actions feature is operating blind on half the data. An Irish agency selling AI visibility to clients will be asked "where should we get placed?" and we have to hand-wave.

**Implementation complexity:** Significant. Requires:
- Storing per-chat source lists (URL + was-cited flag).
- A classifier for source type (can use Claude for this — single prompt per new domain).
- A classifier for URL content type (same).
- The gap analysis join query.
- UI surfaces (Sources → Domains, Sources → URLs, per-URL detail).

**Why it's worth doing anyway:** Fixes the "what do I actually do about this?" problem. Clients intuitively understand "get into this article" far better than "increase your visibility score".

---

## 8 · Chat viewer

Peec's chat detail page shows:
- Status, model, location, sentiment, timestamp
- Full response text
- Inline brand-mention highlighting (which brands, at what position)
- **Query Fanouts** (ChatGPT only) — the internal queries the model ran
- **Common terms** across fanouts
- **Sources sidebar** with citation indicators

**CMO.ie:** `recent-chats.tsx` exists. Unknown exactly what's in the detail view. Based on schema we don't track sources at all.

**Gap:** Medium–Large. Tied to source tracking. Query Fanouts are ChatGPT-specific and depend on whether our data source exposes them.

---

## 9 · Actions — take-action layer

This is where product philosophies diverge.

**Peec's Actions:** group similar sources into opportunities. On-Page (content type you own) and Off-Page (Editorial / UGC / Reference). Each action has a **Relative Opportunity Score 1–3** based on (1) how often that source type is used and (2) how much competitors appear there vs you. Includes "tailored recommendations" as text suggestions. You filter actions by date / tags / model / topics / country.

**CMO.ie's Actions:** `projects/[id]/actions/page.tsx` plus `api/projects/[id]/actions/brief/route.ts`, `draft/route.ts`, `polish/route.ts`. We have `DraftOutputType`, `PLAN_LIMITS`, a credit system (`brief_credits` migration, `polish_requests` migration). We produce _actual content_ — briefs, drafts, polish passes — not just opportunity scores.

### What Peec has that we don't
- Opportunity score visible per action.
- Filter the action list by topic / tag / model / country.
- Grouping by **source type** (the output of Gap Analysis becoming an Action).

### What we have that Peec doesn't
- **The content itself.** Peec tells you "reach out to this editor"; we'd write the pitch. Peec tells you "you should have a listicle covering X"; we'd draft it.
- A billable credit system that monetises the content-generation work.
- Brief / draft / polish pipeline — a credible workflow.

### Verdict
Our Actions feature is arguably the most defensible thing we have. But it relies on source data we don't capture. Without source tracking, our action suggestions come from brand-mention data alone, which is a weaker signal. **The priority here is: feed source data into Actions first, then the drafting layer we already have becomes dramatically more valuable.**

---

## 10 · Agent Analytics (server-log AI bot tracking)

This is a whole separate product inside Peec. Two features:

### Crawl Insights
Ingests your server logs (Cloudflare Workers for real-time, or CSV/CLF upload), identifies AI bot user agents, and shows:
- Bot visit volume over time.
- Breakdown by platform (OpenAI / Anthropic / Google / etc.), bot (GPTBot / ClaudeBot / PerplexityBot), and bot type (Training / Search / User Query / Other).
- Per-URL table: visits, platforms, status codes, _retrievals_ (how often this URL appeared as an AI source), _citation rate_, topics it covers.
- 4xx/5xx failure rate detection.
- Top-visited folder / URL.
- Cross-reference with prompt tracking — "bots crawl this page heavily but it never appears in AI answers" → content or access problem.

### Crawlability
Pure read of your robots.txt. Checks 40+ AI bots across 20+ vendors (full directory in their docs — GPTBot, ClaudeBot, PerplexityBot, GrokBot, Amazonbot, Meta-ExternalAgent, Applebot-Extended, CCBot, PanguBot, DeepSeekBot, TikTokSpider, etc.). Tells you which bots are allowed / partial / blocked. Includes URL tester and maintained directory of which bots do what.

**Gap:** Extra-Large but separable.

**Strategic call:**
- **Crawlability** is the cheap half. It's effectively a free audit tool — parse a robots.txt, check against a maintained list of 40 AI user agents. Zero ongoing ops cost once the bot directory is built. Strong acquisition / lead-gen play. Could be a public landing page at `cmo.ie/crawlability` that doesn't even need login.
- **Crawl Insights** is the expensive half. Cloudflare Worker integration + log parsing + storage. Valuable but meaningful engineering. The combined-signal use cases (log activity + prompt tracking) are powerful, but require source tracking to exist first or they're empty.

Recommendation: ship Crawlability within a month as a free tool; shelve Crawl Insights until sources + gap analysis land.

---

## 11 · Integrations

| Integration | Peec.ai | CMO.ie | Gap |
| --- | --- | --- | --- |
| Looker Studio connector | Yes. Exposes Brand / Source Domain / Date + Visibility / Citations / Chats. | No. | Medium. Agencies and analyst-types want data in their existing BI stack. |
| Public REST API | Yes. Enterprise only. Reports / Project / Company endpoints. | Internal API only. | Medium. Needed for agency tier. |
| MCP Server | Yes. Read-only. Works with Claude Desktop, Cursor, VS Code (Copilot), Windsurf. OAuth 2.0. Free-form questions and slash commands. | No. | Medium. **Cheap to build.** Huge signal-of-modernity to the Claude-fluent crowd. We'd be one of very few AI-search analytics tools with an MCP server. |
| CSV export | Unclear but implied. | Unclear. | Small. Confirm we have this. |

The MCP server is probably the sleeper win here. It's a weekend project for someone who knows MCP, and it lets users ask Claude "how's my AI search visibility this week?" and get real answers from their data. Directly resonates with our ICP (marketers who _already_ use ChatGPT / Claude).

---

## 12 · Agency-mode pricing

This is directly relevant to Howl.ie.

**Peec agency model:**
- Credit-based: 1 prompt × 1 model × 1 day = 1 credit. 30 credits/prompt/model/month.
- Plans: Essentials (10k credits) / Growth (25k) / Scale (65k, adds API) / Comprehensive (custom, adds API + dedicated support).
- Credits _allocate_ — they don't drain. One pool across all clients. Easy to rebalance.
- Projects tab shows allocated vs remaining.

**CMO.ie current:**
- Per-plan fixed limits: Starter (1 project, 50 prompts, 3 models), Pro (3 projects, 150 prompts, 5 models), Advanced (unlimited).
- No agency / multi-client allocation model.
- `org_api_keys` migration suggests multi-org is contemplated but I haven't read the implementation.

**Gap:** Large for the agency segment. If we want Howl (or peer Irish agencies) as anchor customers, the per-plan model doesn't flex. Credit-pool model is the industry standard.

---

## 13 · Data collection method — the underlying choice

Peec's pitch leans heavily on one claim:
> Peec AI uses advanced UI scraping technology to interact with AI models exactly as real users do... API responses often differ from what users see in the actual interface... Different sources: The number and type of sources used in API responses can be different from those shown to real users.

**If true**, this is a durable differentiator. API-based competitors (including us, if we're using `@anthropic-ai/sdk`) get sanitised, potentially different data than what an actual ChatGPT user sees — especially around sources and citations.

**Risks to Peec's approach:**
- ToS-adjacent. OpenAI, Google and Anthropic all have clauses against automated UI scraping. They tolerate it for now; they might not later.
- Fragile. Any UI change breaks the pipeline.
- Expensive. Headless browsers + residential proxies at scale.

**Where we are:** Unclear from the code I've seen, but the presence of `@anthropic-ai/sdk` suggests we use APIs. Worth auditing explicitly.

**Recommendation:**
- Audit our data-collection approach honestly. If we're API-based for Claude and don't have Gemini / ChatGPT / Perplexity wired at all, that's a bigger gap than any dashboard feature.
- Consider a hybrid: APIs where they exist and give good data (Claude, Gemini API), UI automation where the API is materially different (Perplexity, ChatGPT with search, Google AI Overviews) or doesn't exist (AI Mode, Copilot, Grok).
- Make the honest version of Peec's claim: don't over-promise UI-scraping if we're not doing it, but do publish what source of truth we use per model.

---

## 14 · Models / platforms coverage

| Platform | Peec mentions | CMO.ie |
| --- | --- | --- |
| ChatGPT | Yes | Yes |
| Claude | Yes (via MCP + tracked) | Likely (we use Anthropic SDK) |
| Perplexity | Yes | Claims yes (marketing page) |
| Gemini | Yes (US-only for now) | Claims yes |
| Google AI Overviews | Yes | Claims yes |
| Google AI Mode | Yes | Unclear |
| Microsoft Copilot | Yes | Not mentioned |
| Grok | Yes | Not mentioned |
| DuckAssistBot | Yes | Not mentioned |

**Gap:** Medium. Our landing page claims 4 models (ChatGPT, Perplexity, Gemini, Google AI Overviews); Peec claims 8+. Each extra model is a real engineering cost. But for sales parity we'd want at minimum to add Copilot and Grok.

---

## 15 · What Peec _doesn't_ have

It's worth listing these deliberately. These are the edges we can sharpen.

1. **Actual content generation.** Peec stops at "you should create a listicle on X"; we write the listicle. Our `brief → draft → polish` pipeline + credit system is a genuine product extension.
2. **Irish-market / .ie focus.** Peec is a German-headquartered, EU-plus-global product. We can:
   - Default prompts to en-IE phrasing.
   - Prefer / weight .ie and Irish-audience sources.
   - Pre-curate Irish publisher targets (Irish Times, Independent.ie, Business Post, RTÉ, Silicon Republic, etc.) in the Actions taxonomy.
   - Add Irish sector templates (law, construction, food & bev, tech, hospitality).
3. **Opinionated monthly playbook.** Our `.impeccable.md` already signals "three jobs to be done" framing. Peec's dashboard is powerful but very "here are all the metrics, you figure it out." We can ship an opinionated "this month, do these three things" output that non-technical marketers will prefer.
4. **Agency dogfood story.** We're built by an agency, for agencies + their clients. Peec added agency plans later and doesn't tell an agency narrative in onboarding. We can.
5. **Price point (if we choose).** Peec is enterprise-flavoured. If our Starter (€49) holds on content and competitor counts, we can attract the solo-marketer long tail Peec has conceded.

---

## 16 · Prioritised recommendations

Grouping into phases so this is actionable. My suggested sequence:

### Phase 1 — Close the credibility gap (4–6 weeks)
Non-negotiable for matching Peec's sales story.
1. **Brand matching upgrade.** Add aliases + regex + multiple domains per brand. Split display name vs tracked name.
2. **Share of Voice metric.** Compute from existing per-chat brand-mention data. Add to dashboard + summaries.
3. **Source tracking schema + ingest.** Store per-chat URL lists + was-cited flag. Start storing even if UI isn't built yet — back-fill is impossible, forward-filling gives compounding value.
4. **Structured brand profile.** Extract on onboarding, store it, make it editable, feed it to suggestion calls. Stops us re-fetching the website every time.
5. **Auto-detected competitor suggestions.** Reuses chat analysis pipeline.

### Phase 2 — Ship the source optimisation story (6–8 weeks)
The gap that most closes the competitive delta.
6. **Sources → Domains view.** Top domains with retrieved / citation rate / type.
7. **Sources → URLs view.** URL-level with page type classification (Claude-assisted).
8. **Source type taxonomy.** Editorial / Corporate / UGC / Reference / You. Powered by a lightweight classifier.
9. **Gap analysis.** Competitors-mentioned-you-aren't tables, ranked by Gap Score.
10. **Actions v2.** Re-ground our brief/draft/polish workflow on _source opportunities_, not just brand-mention data.

### Phase 3 — Organisation + scale (2–3 weeks)
Makes existing customers happier, essential for agency / multi-client tiers.
11. **Tags + topics** with AND/OR dashboard filters and topic-level aggregated analytics.
12. **Active / Inactive / Deleted prompt states** with history preservation on inactive.
13. **Batch prompt actions** (select multiple, assign tags/topics, activate/deactivate).
14. **CSV bulk upload** for prompts and competitors.
15. **Per-prompt country / IP** (start with IE / UK / US / EU — Irish brands targeting expat markets).

### Phase 4 — Agency + integrations (3–4 weeks)
Needed before we pitch Howl's peers.
16. **Credit-pool pricing model** alongside the current plan-limit model.
17. **Multi-client org management** (we have `org_api_keys`, finish the job).
18. **MCP server.** Read-only, OAuth, reuse our existing API. High marketing leverage per week of work.
19. **Public REST API** (Enterprise / agency tier).
20. **CSV export** everywhere; **Looker Studio connector** (deprioritise — Looker is losing mindshare, the ROI isn't obvious vs the REST API).

### Phase 5 — Agent Analytics (opportunistic)
21. **Crawlability tool** as a free, login-free landing page. Low cost, high acquisition value.
22. **Crawl Insights** — revisit only after Phase 2 is shipping real user value. It's a big build and has strong diminishing returns without source tracking first.

### Phase 6 — Coverage expansion
23. **Add Copilot, Grok, AI Mode** to the model roster.
24. **Honest data-collection audit** — publish per-model which source-of-truth we use (API vs scraped), and prioritise closing the gap where APIs lie.

---

## 17 · Things I'd explicitly _not_ copy

- **"UI scraping as the only path to truth" marketing claim.** Ethically grey, legally brittle, operationally expensive, and the reality is more nuanced. Commit instead to accurate data with explicit source-of-truth per model.
- **Generic "tailored recommendations" text in Actions.** These read like LLM output padding. Our brief / draft / polish pipeline is better; don't regress to empty text.
- **Mandatory auto-topic structure.** Topics are useful but forcing them at onboarding adds friction. Make topics optional; let users start flat and organise later.

---

## Appendix A · Full Peec.ai feature inventory

(Lifted from the docs, for reference when building backlog tickets.)

**Metrics:** Visibility, Share of Voice, Sentiment, Position, Volume (beta).

**Prompts:** AI suggestions, manual add, bulk CSV upload, active / inactive / deleted states, per-prompt country, 200-char limit, batch select + actions, tags, topics, individual prompt dashboard, Query Fanouts (ChatGPT), common terms analysis.

**Competitors / Brands:** Manual add, auto-suggested from chats (≥ 2 mentions), display name, tracked name, aliases, regex, multiple domains, brand colour, brand detail page.

**Brand profile:** Company name, what you do, market segment, brand identity, target audience, products/services. Editable, drives suggestions.

**Dashboard:** Visibility graph top-6, brands ranking top-7 / show-all, top sources (type chart + domain table), recent chats with brand-only toggle. Filters: competitor, date range with PoP, tags (AND/OR), models, country, topics.

**Sources:** Per-chat source list, per-chat citation list, domains table (retrieved / retrieval rate / citation rate / type), URLs table (page type, usage over time, triggering prompts), source type taxonomy (Editorial / Corporate / UGC / Reference / You), gap analysis.

**Chats:** Status / model / location / sentiment, full response, brand-mention highlighting, query fanouts, sources sidebar, source-vs-citation distinction.

**Actions:** On-Page (Owned by content type), Off-Page (Editorial, UGC, Reference), Relative Opportunity Score 1–3, per-action filters (date, tags, model, topics, country), recommendation text.

**Agent Analytics:**
- _Crawl Insights:_ Cloudflare Workers integration, CSV/CLF upload, filters (date / platform / bot type / bot), KPI summary (visits / active bots / failure rate / top folder / top URL), crawl activity over time, by-platform / by-bot / by-type breakdown, URL-level table cross-referenced with prompt data.
- _Crawlability:_ 40+ AI bots × 20+ vendors robots.txt check, URL tester, maintained bot directory with platform / type / purpose.

**Integrations:** Looker Studio connector, Enterprise REST API, MCP server (OAuth 2.0, streamable HTTP, read-only).

**Agency:** Credit pool (1 prompt × 1 model × 1 day = 1 credit), plan tiers Essentials / Growth / Scale / Comprehensive, API access on Scale+.

---

## Appendix B · Sources

- [Welcome to Peec AI](https://docs.peec.ai/intro-to-peec-ai)
- [Visibility](https://docs.peec.ai/metrics/brand-metrics/visibility)
- [Share of Voice](https://docs.peec.ai/metrics/brand-metrics/share-of-voice)
- [Sentiment](https://docs.peec.ai/metrics/brand-metrics/sentiment)
- [Position](https://docs.peec.ai/metrics/brand-metrics/position)
- [Understanding your performance](https://docs.peec.ai/understanding-your-performance)
- [Get inspired by Actions](https://docs.peec.ai/get-inspired-by-actions)
- [Crawl Insights](https://docs.peec.ai/crawl-insights)
- [Use Cases](https://docs.peec.ai/use-cases)
- [Introduction to Peec API](https://docs.peec.ai/api/introduction)
- [Understanding sources](https://docs.peec.ai/understanding-sources)
- [Crawlability](https://docs.peec.ai/crawlability)
- [Setting up your prompts](https://docs.peec.ai/setting-up-your-prompts)
- [Organizing your setup](https://docs.peec.ai/organizing-your-setup)
- [Identifying your competitors](https://docs.peec.ai/identifying-your-competitors)
- [Peec AI for Agencies: Getting started](https://docs.peec.ai/agencies/agency-getting-started)
- [MCP Server](https://docs.peec.ai/mcp/introduction)
- [Looker Studio connector](https://docs.peec.ai/looker/introduction)
- [Brand profile](https://docs.peec.ai/project-profile)
- [Understanding chats](https://docs.peec.ai/understanding-chats)
