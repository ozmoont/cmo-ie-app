# Phase 4 scope — Irish differentiation + free acquisition tools

_Target window: weeks 21–25 of the 26-week plan (~early October → mid-October 2026)._
_Status as of 23 April 2026: Phases 1, 2, 3 are all shipped and green (204 tests). Phase 4 is the asymmetric-bets phase — the stuff Peec can't easily copy because it requires Irish-market depth or Howl-specific distribution._

## Why Phase 4 matters

Phase 3 finished the "parity surface" — API, MCP, agency tier, model coverage. Peec has all of that (more mature). A Dublin agency sold on features alone would eventually pick the bigger name.

Phase 4 is where we **stop competing on surface area and start competing on edge**. Three asymmetric moves:

1. **Ireland-first everywhere.** Bundled publisher library, sector starter packs, "Irish opportunity" badges, prompt defaults tuned for Dublin / Cork / Galway media. A Howl.ie marketing director sees CMO.ie recommending pitches to `businessplus.ie` / `siliconrepublic.com` / `thejournal.ie` by name. Peec can't replicate without an Irish operator on-staff.
2. **Monthly playbook email.** Every project gets a "your three moves this month" email on the last working day of each month. Peec's dashboard tells you what happened. Our email tells you what to do. Low-maintenance, reuses Actions v2, high retention impact.
3. **Free crawlability tool at `/crawlability`.** Public URL, no signup, parse any domain's robots.txt against the Peec-published bot directory. Email capture on the results page. Strong top-of-funnel; a real reason to land on cmo.ie.

## Success criteria

- A new user from a tracked sector (Law / Construction / Food & Bev / Tech / Hospitality / Tourism) lands in onboarding, picks their sector, and gets 10+ sensible prompts + 5+ plausible competitors prefilled — no blank slate.
- Gap Analysis surfaces "Irish opportunity" badges on rows matching the publisher library, ranking them above non-Irish equivalents when the project's country is IE.
- Every live project receives a well-written monthly playbook email at the end of each month, with three concrete moves sourced from actual gap data.
- `/crawlability` is reachable publicly, parses any URL's robots.txt, tells the user which of the 40+ AI bots are blocked/allowed in under 5s, and captures email for a weekly newsletter.
- Irish agency prospects in demos say something like "this feels built for us" — the qualitative bar for Phase 4 landing.

---

## Workstreams

### A — Irish publisher library + sector templates (W21)

**What:** A curated JSON of Irish publishers, tagged by sector, loaded at build time into the gap-analysis weighting + source-type badges. Plus sector starter packs consumed by onboarding / `/api/prompts/suggest`.

**Data (committed as a JSON artifact, no migration):**

- `src/data/irish-publishers.json` — 60-100 rows to start. Each row:
  ```ts
  interface IrishPublisher {
    domain: string;              // "businessplus.ie"
    name: string;                // "Business Plus"
    source_type: "editorial" | "reference" | "corporate" | "ugc";
    sectors: string[];           // ["tech", "general", "business"]
    notes?: string;              // "trade press for Irish SaaS"
    weight?: number;             // 0.5..1.5; 1.0 default
  }
  ```
- `src/data/sector-templates.json` — starter packs keyed by sector slug (`law`, `construction`, `food-bev`, `tech`, `hospitality`, `tourism`). Each:
  ```ts
  interface SectorTemplate {
    slug: string;
    name: string;
    description: string;
    sample_prompts: string[];        // 10-20 battle-tested prompts
    sample_competitors: { name: string; website?: string; domains?: string[] }[];
    sample_publishers: string[];     // domains from irish-publishers.json
  }
  ```

**Implementation:**

- `lib/irish-market.ts` — `isIrishPublisher(domain)`, `getPublisherMeta(domain)`, `getSectorTemplate(slug)`, `listSectorTemplates()`.
- Gap Analysis query: when project's `country_codes` includes `IE`, boost `gap_score` on Irish-publisher rows by the publisher's weight (default 1.2×, capped at 2.0 to prevent small-publisher gaming).
- UI: "Irish opportunity" badge on gap rows where `isIrishPublisher(domain)` is true. Neutral emerald background, small, right-aligned.
- Onboarding: new "Sector" step — user picks one or "skip". If picked, prompts + competitors + publisher affinities seed from the template. Still editable.

**Sizing:** ~4 days including curating the data set.

### B — Monthly playbook email generator (W22)

**What:** A scheduled job that runs at 09:00 on the first working day of each month, generates a plain-text email per active project, and queues it for delivery.

**Schema (migration 018):**

- `monthly_playbooks` — one row per project per month. Columns: `id`, `project_id`, `month` (date, first of month), `subject`, `body_markdown`, `recipients TEXT[]`, `status` (`pending | sent | failed`), `sent_at`, `created_at`.
- No new email infrastructure — reuse existing Resend / Postmark / whatever-we-wired setup, or fall back to a "mark as ready, admin sends manually" flow for v1.

**Implementation:**

- `lib/monthly-playbook.ts` — `generatePlaybookForProject(projectId, month)`. Pulls the month's top 5 gap rows, scores them, asks Claude to write a 3-move playbook in the brand's voice (using the project's brand profile as voice reference).
- Cron: Vercel Cron or equivalent. Idempotent — re-running for the same (project, month) pair is a no-op.
- Admin UI at `/admin/playbooks` for previewing + manually sending if the cron doesn't deliver.
- Email template: plain text, one-column, editorial tone. Links to the live project dashboard, not a synthesised PDF.

**Sizing:** ~5 days. Main risks: email deliverability (Resend free tier is fine for v1); Claude prompt tuning for voice consistency.

### C — Free `/crawlability` tool (W23)

**What:** Public page at `cmo.ie/crawlability`. User enters any URL. We fetch its `/robots.txt`, parse against a baked-in list of ~40 AI crawler user-agent strings (Peec publishes this, so do others — consolidated list). Show allowed / partially allowed / blocked. Email capture at the bottom for "weekly Irish AI crawlability report".

**Schema (migration 019):**

- `crawlability_checks` — `id`, `url`, `domain`, `email` (nullable), `results JSONB`, `created_at`. Rate-limited by IP.
- `newsletter_subscribers` — `id`, `email`, `source` (`crawlability | onboarding | manual`), `subscribed_at`, `unsubscribed_at`. Simple enough for v1.

**Implementation:**

- `src/app/crawlability/page.tsx` — public, no auth. Input + submit. Results rendered inline with the standard marketing-page chrome.
- `src/app/api/crawlability/route.ts` — POST with URL, fetches robots.txt (respects timeout), parses, returns results JSON.
- `lib/crawlability.ts` — `checkCrawlability(url): CrawlabilityReport`. Pure logic (no network), given a robots.txt string returns the bot-by-bot report. Hands-off tests.
- Newsletter signup: plain POST, double opt-in via email confirmation (reuse Supabase auth flow if we can, otherwise a simple signed token).

**Sizing:** ~4 days. Most of the work is the AI bot directory curation + UI polish — the parsing is straightforward.

### D — Looker connector (W24, OPTIONAL)

**What:** Looker Studio community connector that wraps our REST API, so agency prospects who live in Looker don't have to build their own pipe. Only build if ≥ 2 agency prospects explicitly ask for it during the demos from W20-F2. Otherwise, skip.

**Implementation (if building):**

- Google Apps Script-based community connector.
- Pulls `/api/v1/projects/[id]/metrics` over the published REST API.
- Submits to Looker's community connector gallery.

**Sizing:** ~4 days if built. Skip entirely if not asked.

### E — Week 25 buffer + polish

Reserved for slip. Realistic expectation: weeks 21-24 will slip by at least one week total. Week 25 absorbs that. If everything lands on schedule, use it for customer-requested polish and launch prep from Phase 5.

---

## Execution plan

| Week | Workstream | Deliverable |
| ---- | ---------- | ----------- |
| 1 | **A** | Publisher library JSON, sector templates, gap weighting, onboarding sector step |
| 2 | **B** | Migration 018, playbook generator, cron job, admin preview |
| 3 | **C** | `/crawlability` public page, bot directory, newsletter signup |
| 4 | **D** (if asked) OR polish sweep | — |
| 5 | Buffer / launch prep | — |

Workstreams are largely independent. A is the most cross-cutting (touches gap analysis + onboarding + UI badges); B and C are greenfield with no dependencies on each other.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Publisher library goes stale (sites close, rebrand) | High | Medium | JSON artifact, PRs welcome, audit quarterly. Not a service outage if out of date. |
| Sector templates feel generic / AI-slop | High | High | Hand-curate the first pass; ask 2 Irish agencies to review before shipping. |
| Monthly playbook email lands in spam | High | Medium | Use a real sending domain (not howl.onmicrosoft.com). DKIM + SPF. Resend default works. |
| Crawlability false positives — robots.txt is allowed but CDN blocks bot | Medium | Medium | Caveat in the results ("robots.txt permissive but edge may still block"). Follow-up deep check is a paid feature. |
| Sector-based gap weighting creates echo chamber — user only sees Irish gaps | Medium | Medium | Cap Irish weight at 2.0× non-Irish; keep the filter toggle-able. |
| Looker connector build eats a week and nobody uses it | Medium | Low | Gate on explicit demand (2+ asks). Default: skip. |

---

## Kick-off task list

1. **W21-A1** Curate `src/data/irish-publishers.json` (60-100 rows across 6 sectors)
2. **W21-A2** Curate `src/data/sector-templates.json` (6 sectors × 10-20 prompts × 5 competitors)
3. **W21-A3** `lib/irish-market.ts` — query helpers + Gap Score weighting integration
4. **W21-A4** "Irish opportunity" badge on Gap rows
5. **W21-A5** Onboarding sector step + `/api/prompts/suggest` sector-aware path
6. **W22-B1** Migration 018 — `monthly_playbooks` table
7. **W22-B2** `lib/monthly-playbook.ts` — Claude-driven generator
8. **W22-B3** Cron job + admin preview UI
9. **W23-C1** Migration 019 — `crawlability_checks` + `newsletter_subscribers`
10. **W23-C2** `lib/crawlability.ts` — robots.txt parser against AI bot directory
11. **W23-C3** `/crawlability` public page + API route
12. **W23-C4** Newsletter signup flow (double opt-in)

---

## Open questions for OG to confirm

- **Sectors to ship in v1.** Plan doc named six: Law / Construction / Food & Bev / Tech / Hospitality / Tourism. Stick with those or swap?
- **Email sender domain.** `hello@cmo.ie`, `reports@cmo.ie`, or through Howl's existing sender?
- **Looker connector** — build or skip? (Decision deferred until W20 demos produce signal.)
- **Crawlability bot directory source.** Peec publishes one; we can also consult OpenAI/Anthropic's own UA docs. Any preference on starting point?
- **Monthly playbook voice.** Should it read like the project's brand (using the brand profile as style reference), or like CMO.ie's house voice? Recommend: CMO.ie house voice by default, toggleable per-project.
