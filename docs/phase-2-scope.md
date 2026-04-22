# Phase 2 scope — Sources, Gap Analysis, Actions v2

_Target window: weeks 7–14 of the 26-week plan (late May → end of July 2026)._
_Status as of 21 Apr 2026: Phase 1 foundations are landed (adapters, brand matching, SoV, result_brand_mentions, insights page, brand profile). Phase 2 builds on top._

## Why Phase 2 matters

Phase 1 answered "what's the data pipeline?" and "how many times was I mentioned?". Phase 2 answers the only questions that actually sell CMO.ie against Peec.ai:

1. **Where does AI go to form its opinion of my category?**
2. **Where do my competitors appear that I don't?**
3. **What do I do about it?**

Without Phase 2 we have a dashboard. With Phase 2 we have a product.

From the competitive review:
> "Optimising sources gives you the most control over your AI visibility… Gap analysis is the killer feature: 'sources where competitors are mentioned but your brand isn't.'"

## Success criteria (what "done" looks like)

- **Sources → Domains** page shows every domain AI referenced across the project's runs, classified by type (Editorial / Corporate / UGC / Reference / Your own), with retrieval rate / citation rate columns and a filter bar.
- **Sources → URLs** page drills into URL-level with page-type classification (Article / Listicle / How-To / Comparison / etc.), click-through to the prompts that triggered each URL.
- **Gap Analysis** page lists — ranked by Gap Score — the domains and URLs where tracked competitors appear and the brand does not. Each gap has a recommended playbook per source type.
- **Actions v2** attaches the existing brief → draft → polish pipeline to each gap row, so a user clicks "Act on this" and gets a drafted pitch / listicle / community comment within 30s.
- **Dashboard drill-downs**: every summary card ("mentioned in X of Y", "position 2.1", "9 cited domains") links to the filtered insights/sources view that backs it.
- **Per-prompt page** shows the full history of responses, sources, and position for one specific prompt.

Bar for ship: a new user could sign in, watch a 3-minute run, open Gap Analysis, click one row, and get an outreach draft ready to send — without ever leaving the app.

---

## Work breakdown (6 workstreams, each independently shippable)

Each workstream is scoped to be roughly 3–10 days for a solo+AI developer. They can be shipped in any order after A, which unblocks B–D.

### A — Source type + URL type classifiers (foundational, blocks B/C/D)

**What:** Claude-powered classifiers that label each cited domain and URL. Runs lazily, caches forever.

**Schema (migration 010):**
- `domain_classifications` — `domain TEXT PK`, `source_type TEXT`, `confidence REAL`, `sample_url TEXT`, `classified_at TIMESTAMPTZ`, `classifier_model_version TEXT`.
- `url_classifications` — `url TEXT PK`, `page_type TEXT`, `confidence REAL`, `classified_at TIMESTAMPTZ`, `classifier_model_version TEXT`.

Source types (enum): `editorial`, `corporate`, `ugc`, `reference`, `your_own`, `social`, `other`.
Page types: `article`, `listicle`, `how_to`, `comparison`, `review`, `product_page`, `landing`, `directory`, `forum_thread`, `faq`, `other`.

**Implementation:**
- `src/lib/classifiers/domain.ts` — `classifyDomain(domain, sampleUrl?)` — fetches a representative page, sends to Haiku with classification prompt, caches result.
- `src/lib/classifiers/url.ts` — `classifyUrl(url)` — fetches the URL, extracts main content, Haiku classification.
- `src/lib/classifiers/queue.ts` — batch processor that runs after each run to classify any new domains/URLs it hasn't seen before. Budget ~$0.001 per classification call. Capped at 200 classifications per run.

**Testing:** unit tests with mocked Claude responses + fetch. Integration test that runs a full classification pass against a fixture of 20 mixed domains.

**Sizing:** ~5 days. The hardest piece is fetching and extracting main content from arbitrary URLs reliably; falling back to "other" gracefully when content is empty is critical.

### B — Sources → Domains view

**What:** Project-level page showing every domain AI cited across the selected date range, ranked by total citations.

**Schema:** none new — reads from `citations` + `domain_classifications` via join.

**Implementation:**
- `/api/projects/[id]/sources/domains` — returns the paginated domain list for the project with filters (date range, model, source_type).
- `/projects/[id]/sources/` (shell page with tabs) and `/projects/[id]/sources/domains` (the domains tab is default).
- Table columns: domain, source_type badge, retrievals (% chats where ≥ 1 URL from this domain appeared), retrieval_rate (avg URLs from this domain per chat when any appear), citation_rate (avg inline citations per chat when any appear), flags for `is_brand_domain` / `is_competitor_domain`.
- Click-through to the URLs tab filtered to this domain.
- Sources-type donut chart above the table (Editorial / Corporate / UGC / Reference / Your own / Other) — Recharts, reuses the analytics-charts visual style.

**Sizing:** ~4 days.

### C — Sources → URLs view

**What:** Drill-down from a domain to the individual URLs cited from it, plus a cross-domain URL list.

**Schema:** none new.

**Implementation:**
- `/api/projects/[id]/sources/urls` — filter by domain, page_type, date range. Pagination.
- `/projects/[id]/sources/urls` tab.
- Columns: URL (truncated + tooltip), page_type badge, retrievals, inline count, distinct prompts triggering it.
- Click a URL → side drawer with full URL, date-first-cited, page title, all prompts that triggered it with latest response snippet each.

**Sizing:** ~4 days.

### D — Gap Analysis (the killer feature)

**What:** Lists domains and URLs where competitors appear but our brand doesn't, ranked by Gap Score.

**Gap Score:**

```
gap_score = (
  source_frequency   # how often AI uses this source, normalised 0..1
  × competitor_breadth  # how many distinct tracked competitors appeared via this source, 0..1
  × (1 - our_presence)  # 1 when we're absent, 0 when we match competitor coverage
)
```

Rendered as a 1–3 stars UI (Peec convention): low / moderate / high opportunity.

**Schema:** none new — computed live from existing data; cached in a materialised view if perf becomes an issue.

**Implementation:**
- `src/lib/queries/gap-analysis.ts` — functions `getDomainGaps(projectId, opts)` and `getUrlGaps(projectId, opts)`.
- `/api/projects/[id]/gaps/domains` and `/api/projects/[id]/gaps/urls` — paginated + filtered.
- `/projects/[id]/gaps/` page with two tabs.
- Per-gap playbook text derived from source_type:
  - `editorial` → "Pitch the editor. Draft PR outreach."
  - `ugc` → "Engage authentically in this community."
  - `reference` → "Submit / correct the entry."
  - `corporate` → "Explore partnership / directory listing."
- Each gap row has an "Act on this" button that fires the existing brief/draft/polish flow preloaded with gap context.

**Sizing:** ~7 days, longest on page because the UX needs to land. This is the surface the product will be sold on.

### E — Actions v2 wiring

**What:** Connect the existing `brief_credits` + draft + polish pipeline to gap rows so a user's "Act on this" click produces a real outreach draft.

**Schema (migration 011):** add `source_gap` jsonb column to `polish_requests` / briefs for context (domain, URL, source type, top 3 competitors found in this source).

**Implementation:**
- Brief generator takes gap context + brand profile and produces a three-option brief ("pitch email to editor", "listicle draft", "community reply template") tailored to the source type.
- Draft stage picks one of the three (user selects) and produces the full output.
- Polish stage unchanged.
- Actions page groups briefs by gap + by source type.
- Ties to the existing credit-metering flow for monetisation.

**Sizing:** ~7 days. Most of the work is prompt engineering the brief templates per source type + testing outputs on real gap examples.

### F — Dashboard drill-down links + per-prompt page

**What:** Make every summary number on the project overview page clickable → filtered evidence view.

**Implementation:**
- Overview page cards get `Link` wrappers pointing to filtered `/insights` views.
- Per-prompt page `/projects/[id]/prompts/[promptId]` — response history over time, position trend chart, sources for this prompt only, brands named for this prompt only.
- Sparkline under each summary card showing the last 7 days of the metric.

**Sizing:** ~5 days.

---

## Execution plan (recommended order)

| Week | Workstream | Deliverable | Parallel track notes |
| ---- | ---------- | ----------- | ------------------- |
| 1 | **A** (classifiers) | Migration 010, domain + URL classifiers, queue processor | Profile track lands. No file overlap. |
| 2 | **B** (Domains view) | `/sources/domains` page + API | Profile track ships onboarding flow. No overlap. |
| 3 | **C** (URLs view) | `/sources/urls` page + drawer | — |
| 4 | **D** (Gap analysis) | `/gaps/` pages + API | — |
| 5 | **D** continues | Gap Score tuning + per-source-type playbook text | Profile track ships final UX polish. |
| 6 | **E** (Actions v2) | brief/draft/polish wired to gap context | Profile work should be done by now. |
| 7 | **E** + **F** | Dashboard drill-downs, per-prompt page | — |

Total: ~7 weeks solo+AI. 4-5 weeks with a contractor alongside.

---

## Coordination with the parallel profile track

The profile track is focused on:
- `/api/prompts/suggest`
- `/api/projects/[id]/profile`
- `BrandProfileCard`
- `/projects/[id]/prompts` page (reordered)
- Onboarding flow

Phase 2 touches different files, primarily:
- New: `src/lib/classifiers/`, `/sources/`, `/gaps/` routes and pages
- Modified (carefully): `insights.ts` (add new query helpers alongside existing ones), `run-engine.ts` (invoke classifier queue at end of run — one-line change)

**Coordination rules:**
1. **Merge to main at least daily.** Long-lived branches are the #1 risk for solo+AI parallel tracks.
2. **Feature-flag incomplete Phase 2 UI.** Any new route should sit behind a simple `?phase2=1` query param or a NEXT_PUBLIC_ENABLE_PHASE_2 env check until the section is demo-able. Don't confuse users by shipping half a Sources tab.
3. **No schema changes outside migration 010, 011 from Phase 2.** If profile track needs a schema change, they number forward (012+).
4. **Shared types in `src/lib/types.ts`** are changed only with a clear note in the commit message. Additive changes (new optional columns) are safe; renames are not.
5. **`run-engine.ts` is the one file both tracks might touch.** Phase 2 adds a post-run classifier hook; profile track shouldn't need to touch it. If profile track needs a change there, merge Phase 2's changes first then rebase.

---

## Risks and unknowns

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Classifier returns "other" too often (bad URLs, JS-heavy sites) | High | Medium | Keep a clear "unclassified" bucket in the UI; let users manually override a domain's type. Don't block the UI on classification success. |
| Gap Score tuning takes longer than expected | Medium | High | Ship a v1 scoring and iterate. Peec itself uses a simple 1–3 scale; we don't need to be cleverer than them on ship. |
| Actions v2 output quality on niche industries | Medium | High | Start with a single source-type playbook (Editorial) and extend. Budget 2 days of prompt iteration per playbook. |
| URL fetch fails at scale (rate limits, blocked UAs) | Medium | Medium | Respect robots.txt, back off on 429/403, mark as "unfetchable" rather than retrying forever. |
| Classifier cost runs away | Low | Medium | Hard cap at 200 classifications per run, use Haiku not Sonnet, cache indefinitely. Expected ~$5-15/month total at Phase 2 scale. |
| Phase 2 feature flag creep — half-finished UI ships to users | Medium | High | **Strict rule: no Phase 2 route is visible in the sidebar until its tab is complete.** Unfinished tabs are accessible via URL only. |

---

## Kick-off task list (seed backlog for the Phase 2 track)

These are the concrete tasks that get created in the task tracker when Phase 2 starts:

1. **Migration 010** — classification cache tables
2. **Domain classifier** — Claude prompt + fetch + cache write
3. **URL classifier** — Claude prompt + content extraction + cache write
4. **Classifier queue** — post-run hook in run-engine to classify new domains/URLs
5. **Classifier tests** — unit (mocked Claude) + integration (fixture run)
6. **`/sources/domains` API** — paginated query with filters
7. **`/sources/domains` page** — table + source-type donut chart
8. **`/sources/urls` API + page** — drill-down with drawer
9. **Gap Analysis algorithm** — `getDomainGaps` / `getUrlGaps` + Gap Score
10. **Gap Analysis API + page** — ranked tables + playbook text
11. **Migration 011** — `source_gap` JSON on briefs / polish_requests
12. **Brief generator v2** — gap-aware, source-type-tailored
13. **Actions v2 UI** — gap rows → "Act on this" → brief/draft/polish
14. **Dashboard drill-down links** — every summary card clickable
15. **Per-prompt page** — response history + position trend chart

---

## Open questions for OG to confirm

These shape priorities. None of them block the first week of Phase 2 work, but they affect later trade-offs:

1. **Do we want URL-level gaps or only domain-level for v1?** URL-level is more actionable ("pitch this specific article editor"); domain-level is easier to compute and display. Recommendation: ship both, URL list can start smaller.
2. **Which source_type gets the first Actions v2 playbook?** Editorial is most common for Irish market; UGC is highest-value for B2B SaaS. My instinct: Editorial first.
3. **How aggressively should we re-classify?** Recommendation: never re-classify automatically. Let users manually override if they disagree.
4. **What's the Gap Score display format?** Stars (1–3)? Percentage? Raw score? Peec uses stars. Recommendation: follow that convention.
5. **Do we need a public-facing Sources page for unauthenticated demo?** Would help sales. Not required for launch. Recommendation: defer.
