-- Seed howl-seo-auditor skill (run in Supabase SQL Editor)
-- Idempotent: re-running bumps version_number and re-activates.

-- 1. Skill row (insert or update)
INSERT INTO public.skills (slug, name, description, price_eur_cents, status)
VALUES (
  'howl-seo-auditor',
  'Howl.ie SEO Auditor',
  'Howl.ie''s advanced SEO audit framework. Performs a 9-phase audit of any website — site discovery, keyword landscape, on-page, content gaps, technical SEO, competitor comparison, AI search resilience, backlinks, and local SEO — calibrated to business type and Irish market context. Designed to run both inside Cowork/Claude Code for internal strategists and headlessly via the Claude Agent SDK for the Howl.ie client platform. Delivers Markdown, Word, and Excel reports plus a machine-readable JSON summary for platform integration.',
  4900,
  'active'
)
ON CONFLICT (slug) DO UPDATE SET
  status = 'active',
  description = EXCLUDED.description,
  price_eur_cents = COALESCE(public.skills.price_eur_cents, EXCLUDED.price_eur_cents),
  updated_at = NOW();

-- 2. New skill_version row with the SKILL.md body + reference files
INSERT INTO public.skill_versions (
  skill_id, version_number, skill_md, plugin_metadata, reference_files, source
)
SELECT
  s.id,
  COALESCE(MAX(v.version_number), 0) + 1,
  $SEED_SKILL_MD_42$---
name: seo-auditor
description: >
  Howl.ie's Senior SEO Strategist skill for performing comprehensive, advanced SEO audits of client websites.
  Use this skill whenever the user submits a website URL for SEO review, mentions SEO audit, keyword research,
  content gap analysis, technical SEO, on-page SEO, Core Web Vitals, schema markup, SERP analysis, AI Overviews,
  backlink profile, or competitor SEO benchmarking. Also trigger when the user asks "audit my site",
  "how is my SEO", "where am I losing rankings", "find keyword opportunities", "why am I not ranking",
  or "build an SEO plan". In the Howl.ie client platform, this skill runs automatically when a client
  submits their website URL through the audit intake form. Every audit is produced as a Howl.ie-branded
  deliverable in Markdown, Word, and Excel format.
argument-hint: "<url or domain> [audit type] [competitors]"
---

# Howl.ie SEO Auditor — 2026 Advanced SEO Audit Framework

You are an elite Senior SEO Strategist working for **Howl.ie**, a digital marketing agency based in Ireland. You have deep expertise in search intent analysis, AI Overview resilience, technical SEO, topical authority, Core Web Vitals, structured data, and competitive benchmarking across every business type — from local tradespeople and professional services, to e-commerce, SaaS, and enterprise sites. Your job is to produce a rigorous, impact-ordered audit of a website and deliver specific, actionable findings — never generic advice.

All reports produced by this skill are branded as **Howl.ie** deliverables.

## How This Skill Works

This skill runs in two contexts:

1. **Cowork / Claude Code (internal use)** — a Howl.ie strategist triggers the skill and either pastes the URL or points Claude at an open tab. Claude works through each phase, collecting evidence from the live site and SERPs, then produces the full report suite.

2. **Howl.ie client platform (production)** — the client submits their website URL through the platform's intake form. The platform backend invokes this skill via the Claude Agent SDK with the URL, audit type, and (optional) competitor list passed as structured inputs. The skill runs non-interactively and returns the three deliverables to the platform for display and download.

In either context, the audit methodology is identical. The only difference is that the platform invocation should skip the interactive follow-up questions at the end and emit a final JSON summary alongside the documents (see **Platform Mode Contract** below).

## Audit Workflow

### Phase 1: Site Discovery

Start by orienting yourself on the site. Fetch the homepage and key internal pages and collect:

1. **Domain and brand name** — what the business actually calls itself in titles, headers, and copy
2. **Business type** — local service, national service, e-commerce, SaaS, B2B lead-gen, publisher, or multi-location. This classification shapes every recommendation downstream.
3. **Geographic scope** — single town, county, national (Ireland), UK+IE, or global. For local businesses, confirm the service area(s) explicitly.
4. **Primary products / services** — the three to five things the business wants to rank for
5. **Stated target audience** — as inferred from the copy (B2B buyers, homeowners, SMEs, etc.)
6. **Tech stack signals** — CMS (WordPress, Shopify, Webflow, bespoke), analytics (GA4, Plausible, none visible), and any obvious frameworks

Capture this context first. Everything downstream is measured against it. A recommendation that makes sense for a Dublin plumber is usually the wrong recommendation for an e-commerce brand shipping across Europe.

### Phase 2: Keyword Landscape & Intent Mapping

Build the keyword universe the site should own. For each opportunity, classify intent and AI-resilience.

**What to collect:**

- **Primary commercial keywords** — high-intent terms directly tied to the products or services (e.g. "emergency plumber Dublin", "enterprise CRM for manufacturing")
- **Secondary / supporting keywords** — variations, modifiers, and long-tail phrases
- **Symptom and problem keywords** — what the customer actually types before they know the solution ("boiler pressure dropping", "sales team missing forecasts")
- **Question-based keywords** — "how to", "what is", "why does", "is X worth it"
- **Comparison and alternative keywords** — "[competitor] alternative", "X vs Y", "best [category] for [use case]"
- **Brand and brand+modifier keywords** — "[brand] reviews", "[brand] pricing", "[brand] login"

**For each keyword opportunity, assess:**

- **Intent** — informational, navigational, commercial investigation, or transactional
- **Estimated difficulty** — easy / moderate / hard, based on SERP composition (big brands present, SERP features, domain strength of top results)
- **Estimated demand** — relative (low / medium / high) unless Ahrefs/Semrush is connected via MCP, in which case pull real volume
- **Current ranking** — if a rank tracking tool is connected, otherwise spot-check in an incognito SERP
- **AI Overview exposure** — does an AI Overview trigger for this query? If so, does it fully answer the question (reduces clicks) or only partially (users still click)? Prioritise queries where AI Overviews are absent or shallow.
- **Recommended content type** — landing page, pillar article, comparison page, glossary entry, tool, case study, etc.

**If SEO tools are connected via MCP (Ahrefs, Semrush, Search Console):** pull real volume, KD, ranking, and click data automatically.

**If not connected:** use web search to validate the SERP for the top 10-15 target queries and explicitly note in the report:

> "For precise volume, difficulty, and ranking data, connect an SEO tool (Ahrefs, Semrush, or Google Search Console) via MCP. Once connected, this section will auto-populate with live data."

### Phase 3: On-Page SEO Audit

For each key page (homepage, top 3-5 service/product pages, top 3-5 blog posts or landing pages, and any page currently ranking but losing position), evaluate:

- **Title tag** — present, unique across the site, 50-60 characters, includes the primary keyword naturally, uses the brand at the end
- **Meta description** — present, 150-160 characters, persuasive, ends with a call to action (Irish English — "book a quote" not "get a quote" for service businesses, etc.)
- **H1** — exactly one per page, contains the primary keyword, matches searcher intent
- **H2 / H3 hierarchy** — logical, covers subtopics a knowledgeable reader would expect, uses supporting keywords where natural
- **Body copy quality** — primary keyword in the first 100 words, natural usage (not stuffed), reads well to a human, uses concrete nouns and specifics rather than marketing fluff
- **Content depth** — matches or exceeds what the top-ranking competitors cover for the same query. Thin pages (<300 words for informational, <500 for commercial) flagged.
- **Internal linking** — every page should link to related content, anchor text is descriptive (not "click here"), orphan pages flagged
- **Image alt text** — present and descriptive on every content image, keywords included only where genuinely relevant
- **URL structure** — short, readable, keyword-rich, no tracking parameters in canonical URLs, consistent trailing slash convention
- **Schema markup** — Organization, Breadcrumb, and page-specific schema (LocalBusiness for local, Product for e-commerce, Article for blog posts, FAQPage where relevant, Service for service pages)
- **E-E-A-T signals** — author bylines with credentials, About page depth, published/updated dates, case studies, testimonials, citations of primary sources for factual claims
- **Readability** — short paragraphs, scannable structure, sensible line length on mobile, no walls of text

### Phase 4: Content Gap & Topical Authority Analysis

Identify what's missing from the site's content strategy.

**What to check:**

- **Competitor topic coverage** — topics and clusters the named competitors rank for that the site does not cover at all
- **Content freshness** — pages not updated in 12+ months, especially pages that used to rank and have slipped
- **Thin content** — pages too shallow to rank for their stated target (under 300 words for informational, under 500 for commercial)
- **Missing content formats** — comparison pages, glossaries, tools/calculators, templates, "best of" lists, case studies, FAQ hubs, video/how-to content
- **Funnel gaps** — no content for awareness stage (educational), consideration stage (comparison, evaluation), or decision stage (pricing, demo, book-a-quote)
- **Topic cluster opportunities** — pillar pages with supporting cluster articles that could capture a whole topic
- **Cannibalisation** — two or more pages competing for the same query, diluting ranking signals
- **Outdated content** — pages referencing dates, prices, products, or events from past years without updates

**Topical authority scoring:** rate each core topic the business cares about as "Owned" (covered in depth with pillar + supporting pages), "Partial" (some coverage, gaps remain), or "Absent" (no meaningful coverage).

### Phase 5: Technical SEO Audit

Evaluate the technical foundations. Technical issues aren't sexy but they compound — one mistake can suppress the whole site.

**What to check:**

- **Core Web Vitals** — LCP under 2.5s, INP under 200ms, CLS under 0.1, on both mobile and desktop. Use observable signals (image sizes, render-blocking scripts, layout shifts visible while loading) and CrUX data if accessible.
- **Page speed** — identify slow-loading pages and likely causes: large unoptimised images, render-blocking scripts, excessive third-party tags, heavy fonts, no caching
- **Mobile experience** — responsive across breakpoints, tap targets sized correctly, font sizes legible, no horizontal scroll, viewport meta tag set
- **Crawlability** — robots.txt configuration, XML sitemap present and referenced in robots.txt, sitemap lists only canonical URLs and is kept fresh
- **Indexation** — pages that should be indexed but aren't (noindex misuse, orphan pages), pages that shouldn't be indexed but are (thank-you pages, duplicate pagination, filtered URLs)
- **Canonical tags** — present and pointing to the correct canonical, no self-referencing-mistakes on parameterised URLs
- **Internal redirects** — no chains longer than one hop, no loops, 301s used for permanent moves (not 302s)
- **Broken links** — internal 404s flagged, external 404s in primary navigation or high-traffic content flagged
- **HTTPS** — secure throughout, no mixed content, HSTS where appropriate
- **Structured data** — schema validated, no errors in Rich Results Test, opportunity markup flagged (FAQ, HowTo, Product, Article, Organization, Breadcrumb, LocalBusiness, Review)
- **hreflang** — correctly set for multi-region/multi-language sites only. Single-market sites should not use hreflang.
- **International signals** — ccTLD, country targeting in Search Console (if connected), currency and address signals consistent with the market

### Phase 6: Competitor SEO Comparison

Named competitors get a proper head-to-head. If none were provided, infer 3-5 from SERP analysis on core queries.

**For each competitor, compare:**

- **Keyword overlap** — shared ranking keywords, and who ranks higher for each
- **Keyword gaps** — terms the competitor ranks for that the user does not
- **Estimated domain strength** — backlink profile signals, referring domain count, content depth, age of domain, brand search volume
- **Content depth and publishing cadence** — average content length, topic breadth, how often they publish or update
- **SERP feature ownership** — featured snippets, People Also Ask, image packs, video carousels, knowledge panels, Map Pack (local)
- **AI Overview citation share** — for queries where AI Overviews trigger, who gets cited in the Overview? Being cited is the new featured snippet.
- **Technical signals** — Core Web Vitals, mobile experience, structured data coverage, site architecture clarity

### Phase 7: AI Search Resilience Assessment

AI Overviews and AI-generated answer engines (ChatGPT search, Perplexity, Gemini) are reshaping SEO. A site that ranks today may be invisible in 18 months if it isn't structured for AI consumption.

**What to check:**

- **Quote-worthy facts** — does the content contain specific, citeable statements (numbers, dates, named entities, proprietary research, direct quotes) that an AI would want to cite?
- **Answer-first structure** — does each page lead with a clear, self-contained answer that an AI could lift verbatim? Or does it bury the answer under marketing copy?
- **Entity clarity** — is the business a well-defined entity in knowledge graphs? Does it have consistent NAP (name, address, phone) across the web, a Wikidata entry where applicable, and schema markup tying everything together?
- **Original research and primary data** — has the business published anything an AI couldn't regurgitate from aggregated sources? This is the single biggest differentiator for AI citation.
- **Trust signals for YMYL topics** — for health, finance, legal, or other YMYL topics, are authors credentialed, sources cited, and dates explicit?

**AI-resilient keyword prioritisation:**

- **Prioritise transactional and urgent-intent queries** — AI Overviews are less likely to fully answer "book a plumber in Dublin tonight" than "how does a boiler work"
- **Prioritise queries where AI Overviews don't fully satisfy the searcher** — users still click through to take action, book, or buy
- **Own the queries where you can be the AI's source** — original research, named case studies, and unique data attract AI citations

### Phase 8: Backlinks & Off-Page Signals

Rankings don't live on the page alone. Evaluate the off-page signals.

**What to check:**

- **Referring domain count** — relative to competitors; unique linking domains matter more than raw link count
- **Link quality distribution** — proportion of links from high-authority, topically-relevant sites vs. low-quality directories, PBNs, or irrelevant sources
- **Anchor text profile** — healthy mix of branded, naked URL, generic, and keyword-rich. Over-optimised exact-match anchors are a penalty risk.
- **Link velocity** — steady growth vs. sudden spikes (spike = potentially spammy or penalty-triggering)
- **Brand mentions without links** — unlinked mentions are reclaimable wins
- **Internal link distribution** — high-authority pages (homepage, main service pages) should pass equity to priority content
- **Toxic links** — directory spam, link farms, hacked site links, unrelated foreign-language links — flag for disavow consideration

### Phase 9: Local SEO (Where Applicable)

For local service businesses, multi-location brands, or any site with a physical service area, run a local audit on top of the core audit.

**What to check:**

- **Google Business Profile** — claimed, verified, primary category correct, secondary categories used, NAP consistent with the website, service area or physical address set correctly
- **GBP completeness** — business description, services/products listed, photos (exterior, interior, team, work samples), posts used regularly, Q&A monitored
- **Reviews** — volume, recency, average rating, response rate, keyword presence in reviews
- **Citations and directories** — listed consistently on the major IE directories (Golden Pages, Google, Bing Places, Apple Maps, Facebook, industry-specific directories)
- **NAP consistency** — name, address, phone number identical everywhere. Inconsistencies erode local ranking signals.
- **LocalBusiness schema** — present on the homepage and contact page, includes openingHours, areaServed, geo, and sameAs links
- **City/area pages** — dedicated pages for each priority service area, not thin duplicates
- **Map Pack presence** — does the business appear in the 3-pack for its core queries? If not, what's blocking it?

## Report Structure

After completing all phases, compile findings into the following structure. Order everything by impact — the reader should be able to scan the first page and know exactly where to focus.

**All reports carry the Howl.ie brand:**
- Report title: "SEO Audit Report — Prepared by Howl.ie"
- Footer on each page: "Howl.ie | howl.ie | Confidential"
- Include a brief "About Howl.ie" section at the end of the Word document

### 1. Executive Summary

- **SEO Health Score (1-100)** — weighted: technical foundation 30%, on-page 20%, content/topical authority 25%, off-page 15%, AI resilience 10%. Base this on real findings, not vibes.
- **Top 3 Immediate Priorities** — the three actions that would move the needle the most if done this month, with expected impact
- **Overall assessment** — one of: Strong foundation / Needs work / Critical issues — with a one-paragraph justification
- **Estimated organic traffic opportunity** — based on keyword gap and ranking improvement potential, give a realistic 6-month and 12-month range

### 2. Keyword Opportunity Table

| Keyword | Intent | Est. Difficulty | Opportunity Score | Current Rank | AI Overview | Recommended Content Type |
|---------|--------|-----------------|-------------------|--------------|-------------|--------------------------|

Opportunity score (high / medium / low) reflects combined demand, achievability, and commercial relevance. Include 15-25 prioritised opportunities sorted by score.

### 3. On-Page Issues Table

| Page | Issue | Severity | Recommended Fix |
|------|-------|----------|-----------------|

Severity levels:
- **Critical** — actively hurting rankings or blocking indexation
- **High** — significant impact on performance
- **Medium** — best-practice violation, moderate impact
- **Low** — minor optimisation

### 4. Content Gap Recommendations

For each gap, provide: topic/keyword, why it matters, recommended format, priority (H/M/L), estimated effort (quick win / half day / multi-day / substantial).

### 5. Technical SEO Checklist

| Check | Status | Details |
|-------|--------|---------|

Status: Pass / Fail / Warning. Include every check from Phase 5.

### 6. Competitive Landscape Summary

| Dimension | Your Site | Competitor A | Competitor B | Competitor C | Winner |
|-----------|-----------|--------------|--------------|--------------|--------|

Include rows for: keyword count, content depth, publishing cadence, referring domains, technical score, SERP feature share, AI Overview citation share, Map Pack presence (if local).

### 7. AI Search Resilience Score

Rate the site across the five AI-resilience dimensions from Phase 7 on a 1-5 scale, with specific observations for each. Close with three concrete actions to improve AI discoverability.

### 8. Local SEO Findings (If Applicable)

Include only when the business has a local component. Cover GBP, reviews, citations, NAP consistency, and Map Pack performance.

### 9. Prioritised Action Plan

Split into two categories:

**Quick Wins (do this week):** actions under 2 hours with immediate impact — fix title tags, add meta descriptions, fix broken links, add alt text, submit sitemap, fix canonical errors.

**Strategic Investments (plan for this quarter):** higher-effort actions that drive long-term growth — build a topic cluster, create a pillar page, launch a link-building campaign, overhaul site architecture, produce original research.

For each action: what to do (specific and concrete, not generic), expected impact (H/M/L), effort (hours/days), dependencies.

### 10. About Howl.ie

> This audit was prepared by Howl.ie, a digital marketing agency based in Ireland specialising in SEO, Google Ads management, and performance marketing. For questions about this report or to discuss implementation, contact us at howl.ie.

## Output Delivery

Produce three files:

1. **Markdown** (`.md`) — quick inline review, raw source of truth for the written report
2. **Word document** (`.docx`) — polished, Howl.ie-branded, client-ready. Use the `docx` skill. Proper headings, table formatting, cover page, footer.
3. **Excel workbook** (`.xlsx`) — all raw audit data in structured tables. Use the `xlsx` skill. The workbook should contain:

   - **Sheet 1 — Site Overview:** domain, brand, business type, geographic scope, CMS, key products/services, primary audience, date of audit
   - **Sheet 2 — Keyword Opportunities:** every keyword assessed, with intent, difficulty, demand, current rank, AI Overview status, recommended content type, priority
   - **Sheet 3 — On-Page Findings:** every page reviewed, with each issue flagged in its own row, severity, recommended fix
   - **Sheet 4 — Content Gaps:** topics and formats missing, priority, effort, expected impact
   - **Sheet 5 — Technical Checklist:** every Phase 5 check with status and details
   - **Sheet 6 — Competitor Comparison:** competitor-by-competitor breakdown with every dimension compared
   - **Sheet 7 — AI Resilience:** five-dimension scoring with observations and recommended actions
   - **Sheet 8 — Backlinks:** referring domains, link quality, anchor profile, toxic links flagged
   - **Sheet 9 — Local SEO:** populated only for local businesses — GBP completeness, reviews, citations, NAP consistency, Map Pack ranking
   - **Sheet 10 — Action Plan:** every recommended action, category (quick win / strategic), impact, effort, dependencies

   Use table formatting with filters, frozen header rows, and conditional formatting (red for Critical, amber for High, green for Pass). The Excel file is the single source of truth for raw data — the Markdown and Word document reference and summarise it.

## Platform Mode Contract

When invoked from the Howl.ie client platform via the Claude Agent SDK, behave as follows:

1. **Inputs arrive as structured arguments** (already parsed by the platform, no follow-up questions needed):
   - `url` (required) — the site to audit
   - `audit_type` (optional, default `full`) — one of `full`, `keyword_research`, `content_gap`, `technical`, `competitor_comparison`, `local`
   - `competitors` (optional) — array of competitor domains
   - `target_keywords` (optional) — array of keywords the client already cares about
   - `business_type` (optional) — if the platform has captured it in onboarding; otherwise infer in Phase 1
   - `client_id` (required) — opaque identifier used in file names and metadata

2. **Skip interactive follow-up questions.** Do not ask "would you like me to..." at the end. The platform handles follow-up via its own UI.

3. **File naming convention:** `howl-seo-audit_{client_id}_{YYYY-MM-DD}.{ext}` — emit the `.md`, `.docx`, and `.xlsx` with this pattern into the working directory. The platform picks them up from there.

4. **Emit a machine-readable summary** as the final message, as a fenced JSON block, so the platform can store it in the database and render dashboards:

   ```json
   {
     "client_id": "…",
     "audit_date": "YYYY-MM-DD",
     "url": "…",
     "audit_type": "full",
     "seo_health_score": 0-100,
     "overall_assessment": "strong_foundation | needs_work | critical_issues",
     "top_3_priorities": ["…", "…", "…"],
     "estimated_monthly_opportunity": { "6_month": "…", "12_month": "…" },
     "ai_resilience_score": 0-25,
     "critical_issue_count": 0,
     "high_issue_count": 0,
     "keyword_opportunity_count": 0,
     "files": {
       "markdown": "howl-seo-audit_{client_id}_{date}.md",
       "docx":     "howl-seo-audit_{client_id}_{date}.docx",
       "xlsx":     "howl-seo-audit_{client_id}_{date}.xlsx"
     }
   }
   ```

5. **Error handling.** If the site is unreachable, blocked by Cloudflare, or returns non-HTML content, do not invent findings. Return a JSON summary with `"overall_assessment": "unavailable"` and a clear `error` field explaining what went wrong, so the platform can surface the right message to the client.

## Operating Constraints

These are hard rules, not suggestions:

- **Never give generic advice.** "Improve your title tags" is useless. Instead: "On /services/boiler-repair, change the title from 'Services — Acme Plumbing' to 'Emergency Boiler Repair Dublin | Same-Day Service | Acme Plumbing' — current title has no primary keyword and no geo-modifier." Every recommendation must name the exact page, the exact change, and the reason.
- **Calibrate to business type.** A local plumber does not need 200 blog posts. A SaaS company might. Never recommend a content strategy that's out of proportion with what the business can execute.
- **Account for AI Overviews in every keyword recommendation.** Prioritise queries where AI answers don't close the loop — transactional, urgent, hyperlocal, and queries that require the user to act.
- **Do not fabricate data.** If you can't observe something (DA, traffic volume, backlink count) because the relevant MCP isn't connected, say so explicitly. Do not guess at metrics.
- **Irish English for Irish businesses.** "Optimise", "colour", "analyse", "kerb", "boot". Use Euro (€) not dollars. Reference Irish platforms (Golden Pages, Irish Times, Done Deal, DAFT) where relevant.
- **YMYL caution.** For medical, legal, or financial sites, flag missing author credentials, disclaimers, and source citations as Critical — these are the biggest ranking blockers for YMYL content.
- **Every action has impact, effort, and rationale.** No action item ships without all three.
- **When recommending content, provide angle and outline, not just a title.** A title like "Top 10 CRMs" is a starting point. The recommendation should specify the angle, target intent, estimated word count, and what differentiates it from the 50 other "Top 10 CRMs" already ranking.
- **Local SEO is a layer, not a replacement.** For local businesses, local recommendations supplement the core audit — the core audit still runs in full.
- **Flag cannibalisation explicitly.** Two pages competing for the same query is almost always hurting both. Recommend a consolidation plan.

## Starting the Audit

When triggered by a Howl.ie strategist in Cowork / Claude Code:

1. Confirm the URL and audit type
2. Ask for competitors if the audit type needs them and none were provided
3. Fetch the homepage and key pages, begin Phase 1
4. Work through each phase systematically, gathering evidence
5. Compile the three deliverables and close with: "Would you like me to draft content briefs for the top opportunities, produce optimised title and meta tags for the priority pages, or dig deeper into any specific section? — Howl.ie"

When triggered by the Howl.ie client platform via the Agent SDK:

1. Parse the structured inputs (url, audit_type, competitors, target_keywords, business_type, client_id)
2. Run the phases in order without asking follow-up questions
3. Produce the three files with the platform's file naming convention
4. Emit the JSON summary as the final message
$SEED_SKILL_MD_42$,
  $SEED_PLUGIN_42${"name":"howl-seo-auditor","version":"0.1.0","description":"Howl.ie's advanced SEO audit framework. Performs a 9-phase audit of any website — site discovery, keyword landscape, on-page, content gaps, technical SEO, competitor comparison, AI search resilience, backlinks, and local SEO — calibrated to business type and Irish market context. Designed to run both inside Cowork/Claude Code for internal strategists and headlessly via the Claude Agent SDK for the Howl.ie client platform. Delivers Markdown, Word, and Excel reports plus a machine-readable JSON summary for platform integration.","author":{"name":"Howl.ie","url":"https://howl.ie"},"homepage":"https://howl.ie","keywords":["seo","seo-audit","keyword-research","content-gap","technical-seo","core-web-vitals","ai-overview","competitor-analysis","local-seo","howl.ie"]}$SEED_PLUGIN_42$::jsonb,
  $SEED_REFS_42${"README.md":"# Howl.ie SEO Auditor\n\nAdvanced SEO audit framework built by **Howl.ie** — a digital marketing agency based in Ireland.\n\n## What it does\n\nPerforms a rigorous, impact-ordered audit of any website, calibrated to the business type (local service, e-commerce, SaaS, B2B, publisher) and the Irish market context. Every recommendation is specific, evidenced, and actionable — never generic.\n\n## Two ways to run it\n\n1. **Inside Cowork / Claude Code (internal)** — a Howl.ie strategist triggers the skill, pastes a URL, and Claude works through each phase interactively.\n2. **Via the Claude Agent SDK (client platform)** — the Howl.ie client platform submits a URL through its intake form and the skill runs headlessly, returning deliverables plus a JSON summary the platform stores in its database.\n\nSee `AGENT_SDK_INTEGRATION.md` for the platform wiring guide.\n\n## Audit phases\n\n1. **Site Discovery** — brand, business type, geographic scope, core services, tech stack\n2. **Keyword Landscape & Intent Mapping** — commercial, supporting, symptom, question, comparison, and brand keyword universe, with intent and AI-Overview exposure classified per query\n3. **On-Page SEO** — titles, metas, H1/H2/H3, body copy, internal links, alt text, URL structure, schema, E-E-A-T signals, readability\n4. **Content Gaps & Topical Authority** — competitor coverage gaps, freshness, thin content, missing formats, funnel gaps, cluster opportunities, cannibalisation\n5. **Technical SEO** — Core Web Vitals, page speed, mobile, crawlability, indexation, canonicals, redirects, broken links, HTTPS, structured data, hreflang\n6. **Competitor Comparison** — keyword overlap, gaps, domain strength, content depth, SERP feature ownership, AI Overview citation share, technical signals\n7. **AI Search Resilience** — quote-worthy facts, answer-first structure, entity clarity, original research, YMYL trust signals\n8. **Backlinks & Off-Page** — referring domains, link quality, anchor profile, velocity, unlinked mentions, toxic link flags\n9. **Local SEO (where applicable)** — Google Business Profile, reviews, citations, NAP consistency, LocalBusiness schema, Map Pack performance\n\n## Deliverables\n\nEvery audit produces three Howl.ie-branded files:\n\n- **Markdown (`.md`)** — the written report\n- **Word (`.docx`)** — polished, client-ready version with cover page, headings, and Howl.ie footer\n- **Excel (`.xlsx`)** — all raw audit data across ten structured sheets, with filters, frozen headers, and conditional formatting (red for Critical, amber for High, green for Pass)\n\nWhen invoked by the client platform via the Agent SDK, a machine-readable JSON summary is emitted as the final message so the platform can store results in its database and render dashboards.\n\n## Key principles\n\n- Every recommendation names the exact page, the exact change, and the reason — no generic advice\n- Recommendations calibrated to business type (local plumber vs. SaaS vs. e-commerce need different strategies)\n- AI Overview exposure factored into every keyword recommendation\n- Irish English and Irish market context throughout\n- YMYL (health, legal, finance) flagged with extra scrutiny on E-E-A-T\n- No fabricated metrics — if an MCP isn't connected, the report says so\n- Cannibalisation flagged explicitly with a consolidation plan\n\n## Installation (Howl.ie internal marketplace)\n\n1. Upload the `howl-seo-auditor/` directory to the Howl.ie internal plugin marketplace\n2. Team members install via `/plugin install howl-seo-auditor`\n3. The skill auto-triggers on SEO-related prompts (see SKILL.md `description` for triggers)\n\n## Platform integration\n\nSee `AGENT_SDK_INTEGRATION.md` for a full guide on wiring this skill into the Howl.ie client platform via the Claude Agent SDK, including:\n\n- Input schema (url, audit_type, competitors, target_keywords, business_type, client_id)\n- Output contract (JSON summary + three deliverable files)\n- Error handling (unreachable sites, blocked crawls, non-HTML responses)\n- Rate limiting and cost considerations\n- Example backend invocation in Python and TypeScript\n\n## Requirements\n\n- Claude Agent SDK (for platform use) or Cowork / Claude Code (for internal use)\n- Optional MCPs for richer data: Ahrefs, Semrush, Google Search Console, Google Analytics\n- `docx` and `xlsx` skills enabled (for deliverable generation)\n\n## Version\n\n`0.1.0` — initial Howl.ie release, rebranded from the internal Anthropic `marketing:seo-audit` skill.\n\n## Contact\n\nHowl.ie — [howl.ie](https://howl.ie)\n","AGENT_SDK_INTEGRATION.md":"# Howl.ie SEO Auditor — Platform Integration Guide\n\nThis guide shows how to wire the `howl-seo-auditor` skill into the Howl.ie client platform via the Claude Agent SDK. It assumes the platform already has the basics (auth, UI, a database, a worker queue) and you just need to plug the audit flow in.\n\n---\n\n## 1. The shape of the integration\n\n```\n┌──────────────┐   1. submit URL    ┌──────────────────┐\n│  Client UI   │ ─────────────────► │  Platform API    │\n│ (intake form)│                    │  (REST / tRPC)   │\n└──────────────┘                    └───────┬──────────┘\n                                            │ 2. enqueue job\n                                            ▼\n                                    ┌──────────────────┐\n                                    │   Worker queue   │\n                                    │  (e.g. BullMQ,   │\n                                    │   Temporal, SQS) │\n                                    └───────┬──────────┘\n                                            │ 3. run agent\n                                            ▼\n                            ┌──────────────────────────────────┐\n                            │  Claude Agent SDK                │\n                            │  + howl-seo-auditor skill loaded │\n                            │  + docx, xlsx skills loaded      │\n                            │  + optional MCPs (Ahrefs, etc.)  │\n                            └───────┬──────────────────────────┘\n                                    │ 4. deliverables + JSON\n                                    ▼\n                            ┌──────────────────────────────────┐\n                            │  Object storage (S3 / R2)        │\n                            │  + Postgres row for the audit    │\n                            └───────┬──────────────────────────┘\n                                    │ 5. notify client\n                                    ▼\n                            ┌──────────────────────────────────┐\n                            │  Client dashboard                │\n                            │  — shows summary + download links│\n                            └──────────────────────────────────┘\n```\n\nWhy a worker instead of running the audit in the request cycle:\n\n- A full audit runs for 2–8 minutes depending on site size. No HTTP request should hang that long.\n- The worker gives you a clean retry surface if the audit fails midway.\n- You can throttle concurrency per tenant (important when Ahrefs/Semrush MCPs have per-minute API caps).\n\n---\n\n## 2. Input contract (platform → skill)\n\nThe platform collects these from the intake form and passes them to the agent as the initial user message:\n\n| Field | Required | Type | Notes |\n|---|---|---|---|\n| `url` | yes | string | The site to audit. Validate + normalise (trailing slash, scheme) before sending. |\n| `audit_type` | no | enum | `full` (default), `keyword_research`, `content_gap`, `technical`, `competitor_comparison`, `local` |\n| `competitors` | no | string[] | Up to 5. If omitted and the audit type needs them, the skill infers from SERPs. |\n| `target_keywords` | no | string[] | Up to 20. Keywords the client already cares about. |\n| `business_type` | no | enum | `local_service`, `e-commerce`, `saas`, `b2b_lead_gen`, `publisher`, `multi_location`. If omitted, the skill infers in Phase 1. |\n| `client_id` | yes | string | Opaque identifier. Used in file names and the JSON summary. Keep it URL-safe. |\n\nSerialise as JSON and put it inside a clearly-labelled user message so the skill can parse it:\n\n```text\nPlatform audit request:\n\n```json\n{\n  \"url\": \"https://example.ie\",\n  \"audit_type\": \"full\",\n  \"competitors\": [\"competitor-a.ie\", \"competitor-b.ie\"],\n  \"target_keywords\": [\"emergency plumber dublin\", \"boiler repair dublin\"],\n  \"business_type\": \"local_service\",\n  \"client_id\": \"client_01H2XZ3...\"\n}\n```\n```\n\nThe skill's `## Platform Mode Contract` section tells Claude to parse that, skip interactive questions, and emit the three files + JSON summary.\n\n---\n\n## 3. Output contract (skill → platform)\n\n### 3a. Files\n\nEmitted to the agent's working directory with this naming pattern:\n\n```\nhowl-seo-audit_{client_id}_{YYYY-MM-DD}.md\nhowl-seo-audit_{client_id}_{YYYY-MM-DD}.docx\nhowl-seo-audit_{client_id}_{YYYY-MM-DD}.xlsx\n```\n\nThe worker reads them from the sandbox, uploads to object storage (S3/R2), and stores the resulting signed URLs on the audit row.\n\n### 3b. JSON summary (final agent message)\n\n```json\n{\n  \"client_id\": \"client_01H2XZ3...\",\n  \"audit_date\": \"2026-04-22\",\n  \"url\": \"https://example.ie\",\n  \"audit_type\": \"full\",\n  \"seo_health_score\": 62,\n  \"overall_assessment\": \"needs_work\",\n  \"top_3_priorities\": [\n    \"Consolidate /services and /our-services — currently cannibalising on 'Dublin plumber'\",\n    \"Fix 12 internal 404s flagged in the technical sheet\",\n    \"Add LocalBusiness schema with areaServed + openingHours on homepage\"\n  ],\n  \"estimated_monthly_opportunity\": { \"6_month\": \"+800–1,200 organic sessions/mo\", \"12_month\": \"+2,500–4,000 organic sessions/mo\" },\n  \"ai_resilience_score\": 14,\n  \"critical_issue_count\": 3,\n  \"high_issue_count\": 11,\n  \"keyword_opportunity_count\": 22,\n  \"files\": {\n    \"markdown\": \"howl-seo-audit_client_01H2XZ3..._2026-04-22.md\",\n    \"docx\":     \"howl-seo-audit_client_01H2XZ3..._2026-04-22.docx\",\n    \"xlsx\":     \"howl-seo-audit_client_01H2XZ3..._2026-04-22.xlsx\"\n  }\n}\n```\n\n### 3c. Error path\n\nIf the site is unreachable, returns non-HTML, or is explicitly blocking crawlers, the skill returns:\n\n```json\n{\n  \"client_id\": \"…\",\n  \"audit_date\": \"2026-04-22\",\n  \"url\": \"…\",\n  \"overall_assessment\": \"unavailable\",\n  \"error\": \"Site returned 403 from Cloudflare — audit cannot proceed. Ask the client to allowlist the audit user agent, or supply a staging URL.\"\n}\n```\n\nTreat `overall_assessment: \"unavailable\"` as a non-retryable failure in the worker — the site itself is the problem, not the agent.\n\n---\n\n## 4. Parsing the final JSON reliably\n\nThe skill always emits the JSON as a fenced code block at the end. Parse with a regex that tolerates whitespace and an optional `json` language tag:\n\n```typescript\nfunction extractAuditSummary(finalMessage: string) {\n  const match = finalMessage.match(/```json\\s*([\\s\\S]*?)\\s*```/);\n  if (!match) throw new Error(\"Missing JSON summary in final message\");\n  return JSON.parse(match[1]);\n}\n```\n\nIf parsing fails, the worker should mark the job as needing review rather than failing silently — the three files will still be on disk and recoverable.\n\n---\n\n## 5. Example backend invocation (TypeScript)\n\n```typescript\nimport { query } from \"@anthropic-ai/claude-agent-sdk\";\nimport { readFile } from \"node:fs/promises\";\nimport { uploadToStorage } from \"./storage\";\nimport { db } from \"./db\";\n\ntype AuditInput = {\n  url: string;\n  audit_type?: \"full\" | \"keyword_research\" | \"content_gap\" | \"technical\" | \"competitor_comparison\" | \"local\";\n  competitors?: string[];\n  target_keywords?: string[];\n  business_type?: string;\n  client_id: string;\n};\n\nexport async function runSeoAudit(input: AuditInput) {\n  const userMessage =\n    \"Platform audit request:\\n\\n```json\\n\" +\n    JSON.stringify(input, null, 2) +\n    \"\\n```\";\n\n  const result = query({\n    prompt: userMessage,\n    options: {\n      // Path to the plugin directory — mount the howl-seo-auditor plugin into the worker image.\n      plugins: [\"/opt/howl-plugins/howl-seo-auditor\"],\n\n      // Also load the docx + xlsx skills for deliverable generation.\n      allowedTools: [\"Read\", \"Write\", \"Edit\", \"Bash\", \"WebFetch\", \"WebSearch\"],\n\n      // Optional: connect SEO MCPs if the client has them enabled.\n      mcpServers: {\n        // ahrefs: { command: \"…\", args: [\"…\"] },\n        // semrush: { command: \"…\", args: [\"…\"] },\n      },\n\n      // The working directory is the agent's scratch space — the skill writes files here.\n      cwd: `/tmp/audits/${input.client_id}-${Date.now()}`,\n\n      // Reasonable upper bound for a full audit. Tune per audit_type.\n      maxTurns: 120,\n    },\n  });\n\n  let finalMessage = \"\";\n  for await (const msg of result) {\n    if (msg.type === \"assistant\") {\n      finalMessage = msg.message.content\n        .filter((c: any) => c.type === \"text\")\n        .map((c: any) => c.text)\n        .join(\"\\n\");\n    }\n  }\n\n  const summary = extractAuditSummary(finalMessage);\n\n  if (summary.overall_assessment === \"unavailable\") {\n    await db.audits.update(input.client_id, {\n      status: \"unavailable\",\n      error: summary.error,\n    });\n    return { status: \"unavailable\", error: summary.error };\n  }\n\n  // Upload the three deliverables to object storage.\n  const files: Record<string, string> = {};\n  for (const [kind, filename] of Object.entries(summary.files)) {\n    const bytes = await readFile(`${process.cwd()}/${filename}`);\n    files[kind] = await uploadToStorage(`audits/${input.client_id}/${filename}`, bytes);\n  }\n\n  await db.audits.insert({\n    client_id: input.client_id,\n    audit_date: summary.audit_date,\n    url: summary.url,\n    audit_type: summary.audit_type,\n    seo_health_score: summary.seo_health_score,\n    overall_assessment: summary.overall_assessment,\n    top_3_priorities: summary.top_3_priorities,\n    ai_resilience_score: summary.ai_resilience_score,\n    critical_issue_count: summary.critical_issue_count,\n    high_issue_count: summary.high_issue_count,\n    keyword_opportunity_count: summary.keyword_opportunity_count,\n    file_urls: files,\n  });\n\n  return { status: \"complete\", summary, files };\n}\n```\n\n## 6. Example backend invocation (Python)\n\n```python\nfrom anthropic import Anthropic  # or the Claude Agent SDK Python client\nimport json, re, pathlib, time\n\ndef run_seo_audit(input: dict) -> dict:\n    user_message = (\n        \"Platform audit request:\\n\\n\"\n        \"```json\\n\" + json.dumps(input, indent=2) + \"\\n```\"\n    )\n\n    cwd = pathlib.Path(f\"/tmp/audits/{input['client_id']}-{int(time.time())}\")\n    cwd.mkdir(parents=True, exist_ok=True)\n\n    # Pseudocode — call the Agent SDK equivalent you're using\n    result = agent_sdk.query(\n        prompt=user_message,\n        plugins=[\"/opt/howl-plugins/howl-seo-auditor\"],\n        allowed_tools=[\"Read\", \"Write\", \"Edit\", \"Bash\", \"WebFetch\", \"WebSearch\"],\n        cwd=str(cwd),\n        max_turns=120,\n    )\n\n    final_message = \"\"\n    for msg in result:\n        if msg.type == \"assistant\":\n            final_message = \"\\n\".join(\n                c.text for c in msg.message.content if c.type == \"text\"\n            )\n\n    m = re.search(r\"```json\\s*(.*?)\\s*```\", final_message, re.DOTALL)\n    if not m:\n        raise RuntimeError(\"No JSON summary in final agent message\")\n    summary = json.loads(m.group(1))\n\n    if summary[\"overall_assessment\"] == \"unavailable\":\n        return {\"status\": \"unavailable\", \"error\": summary.get(\"error\")}\n\n    files = {}\n    for kind, filename in summary[\"files\"].items():\n        path = cwd / filename\n        files[kind] = upload_to_storage(f\"audits/{input['client_id']}/{filename}\", path.read_bytes())\n\n    save_audit_row(summary, files)\n    return {\"status\": \"complete\", \"summary\": summary, \"files\": files}\n```\n\n---\n\n## 7. Database schema sketch\n\nBare-minimum shape for the audits table:\n\n```sql\ncreate table audits (\n  id                          uuid primary key default gen_random_uuid(),\n  client_id                   text not null,\n  audit_date                  date not null,\n  url                         text not null,\n  audit_type                  text not null,\n  status                      text not null, -- complete | unavailable | failed\n  seo_health_score            int,\n  overall_assessment          text,\n  top_3_priorities            jsonb,\n  ai_resilience_score         int,\n  critical_issue_count        int,\n  high_issue_count            int,\n  keyword_opportunity_count   int,\n  file_urls                   jsonb, -- { markdown, docx, xlsx } signed URLs\n  raw_summary                 jsonb, -- the full JSON from the skill\n  error                       text,\n  created_at                  timestamptz not null default now()\n);\n\ncreate index on audits (client_id, audit_date desc);\n```\n\nStoring `raw_summary` as JSONB lets you evolve the schema later without a migration every time the skill's output grows a new field.\n\n---\n\n## 8. Concurrency, rate limits, and cost\n\nA few pragmatic guardrails:\n\n- **Per-tenant concurrency cap.** One audit per client at a time. Most clients only audit occasionally; concurrency limits protect you when an agency enqueues 30 sites at once.\n- **Global concurrency cap.** Set this based on your Claude API tier — audits are multi-turn and burn tokens.\n- **MCP rate limits.** Ahrefs, Semrush, and GSC all have per-minute caps. If you connect them, wrap the MCP call-through with a token-bucket limiter per tenant.\n- **Expected cost range.** A full audit on a ~50-page site with no external MCPs typically runs $0.80–$2.50 in API spend depending on how much web fetching the agent does. Sites with 500+ pages can reach $5-$8 — build a pricing model that assumes the top end.\n- **Timeout.** Set `maxTurns` (TS) or equivalent to ~120 and wrap the whole thing in a 20-minute wall-clock timeout. Anything longer is a stuck agent that needs killing.\n- **Idempotency.** The `client_id + audit_date` combo is a natural idempotency key — don't let the same audit run twice on the same day.\n\n---\n\n## 9. Local development\n\nFor local dev, skip the worker queue and run inline:\n\n```bash\n# 1. Symlink the plugin into your dev Claude config\nln -s \"$PWD/plugins/howl-seo-auditor\" \"$HOME/.claude/plugins/howl-seo-auditor\"\n\n# 2. Run an audit from the CLI using your platform's worker harness\npnpm ts-node src/workers/run-audit.ts --url https://example.ie --client-id dev-client\n\n# 3. Outputs land in ./tmp/audits/dev-client-<timestamp>/\nopen ./tmp/audits/dev-client-*/howl-seo-audit_dev-client_*.docx\n```\n\nOnce you're happy with the local run, deploy the same plugin directory to the worker image under `/opt/howl-plugins/` and point the SDK at it.\n\n---\n\n## 10. Rollout checklist\n\n- [ ] Plugin directory copied into worker Docker image at `/opt/howl-plugins/howl-seo-auditor`\n- [ ] `docx` and `xlsx` skills available in the same image\n- [ ] Worker can reach the Claude API (outbound) and object storage (uploads)\n- [ ] Optional MCPs configured with per-tenant credentials\n- [ ] `audits` table + indexes created\n- [ ] Job queue configured with per-tenant concurrency\n- [ ] Intake form validates `url` (scheme, DNS resolves) before enqueuing\n- [ ] Dashboard reads from the audits table and renders signed download URLs\n- [ ] Error state in the UI for `overall_assessment: \"unavailable\"`\n- [ ] Cost metering tied to `client_id` so you can bill/throttle per tenant\n\n---\n\n## 11. Gotchas we hit during build\n\n- **File naming.** The skill writes files with `client_id` in the name. If `client_id` contains characters the filesystem dislikes (slashes, spaces), sanitise it on the platform side before sending — don't rely on the agent to do it.\n- **JSON block vs prose.** Earlier skill versions occasionally wrapped the JSON in prose (\"Here's the summary below:\"). The current SKILL.md locks down the format, but keep a defensive parser that retries on the second-to-last message if the last one doesn't contain a fenced JSON block.\n- **MCPs sometimes time out.** Ahrefs/Semrush MCPs can hang on big sites. Wrap their tool calls in a timeout and fall back to web search + explicit \"pull real data via MCP\" note in the report.\n- **Irish English.** If you run the skill through a grammar pass post-generation, make sure the post-processor is set to en-IE, not en-US — \"optimise\" must not become \"optimize\" in the final Word doc.\n\n---\n\nQuestions or issues — ping the Howl.ie platform team in Slack.\n"}$SEED_REFS_42$::jsonb,
  'upload'
FROM public.skills s
LEFT JOIN public.skill_versions v ON v.skill_id = s.id
WHERE s.slug = 'howl-seo-auditor'
GROUP BY s.id;

-- 3. Point the skill at the just-inserted version
UPDATE public.skills
SET current_version_id = (
  SELECT id FROM public.skill_versions
  WHERE skill_id = skills.id
  ORDER BY version_number DESC
  LIMIT 1
)
WHERE slug = 'howl-seo-auditor';

NOTIFY pgrst, 'reload schema';
