# Phase 3 scope — Integrations + agency tier

_Target window: weeks 15–20 of the 26-week plan (~mid-August → late September 2026)._
_Status as of 22 April 2026: Phase 1 + Phase 2 are both shipped and green (170 tests). Phase 3 builds on that evidence layer and exposes it through integrations + a plan shape that lets agencies resell._

## Why Phase 3 matters

Phase 1 gave us honest data. Phase 2 turned it into actionable insight. Phase 3 is the phase where **CMO.ie becomes a thing other systems can talk to, and a product an agency can profitably run for their clients.**

Concretely:

1. **Public REST API** — every number in the dashboard is reachable over HTTP with an API key. Required for Zapier-class integrations, for piping visibility into Looker/Sheets, and for the MCP server to stand on top of.
2. **MCP server** — the biggest sales-narrative win per engineering hour in the whole 26-week plan. "Ask Claude how your AI visibility changed last week" is a demo that closes calls.
3. **Agency tier** — pool credits across multiple client projects, sell to Howl's peer agencies in Dublin. This is the plan's stated revenue unlock for weeks 15-20 (see `execution-plan.md` §Revenue signposts: €5k-€9k MRR target by end of Phase 3).
4. **Multi-client management polish** — agency users live in a different mental model than single-brand operators. We already have `org_api_keys` and profiles; this phase finishes the flows.
5. **CSV export + model coverage expansion** — the two unblock-the-enterprise-conversation items. Copilot and Grok coverage becomes cheap once scraped channels are live, so we add them here and close the "what about…" questions for the rest of 2026.

## Success criteria

- A third-party developer can get from "I have an API key" to "I'm showing my visibility score in Sheets" in under 15 minutes, with no help from us.
- An Anthropic user installs our MCP server, asks "how did CMO.ie visibility change last week?" in Claude, and gets a real, grounded answer from their live project data.
- A Howl peer agency can onboard 3 client brands under one billing relationship, allocate credits between them, and see each client's visibility at a glance without swapping orgs.
- CSV export is wired on Sources, Gap Analysis, and Per-prompt pages. Any data in the UI can leave the app as CSV in one click.
- Copilot + Grok are full ModelAdapter citizens — can be toggled on for a project, respect BYOK, write back through the same citation + brand-matching pipeline.
- `/agency` landing page is live; three Dublin agencies have booked demos.

---

## Workstreams (6, roughly one per week; two run in parallel)

### A — Public REST API v1 (Week 15)

**What:** `/api/v1/*` namespace with token auth, scoped read endpoints, rate limits, pagination, and an auto-generated docs page. Reuses all existing query helpers — this is a thin HTTP layer over `lib/queries/*` + `lib/insights`.

**Schema (migration 016):**

- `api_keys` — `id`, `org_id`, `name` (user-visible label), `token_hash` (bcrypt or HMAC; never store plaintext), `token_prefix` (first 8 chars for UI lookup), `scopes TEXT[]`, `last_used_at`, `revoked_at`, `created_at`, `created_by`.
- Scopes for v1: `visibility.read`, `sources.read`, `gaps.read`, `prompts.read`, `chats.read`. Writes are out of scope for v1 (too much surface to lock down safely).
- Partial unique index on `token_prefix` where `revoked_at IS NULL`.

**Endpoints (all GET):**

- `/api/v1/projects` — list projects the key's org owns.
- `/api/v1/projects/[id]/metrics` — latest visibility %, SoV, position, sentiment, totals.
- `/api/v1/projects/[id]/prompts` — prompt list + per-prompt latest visibility (reuses `lib/queries/prompt-detail.ts`).
- `/api/v1/projects/[id]/chats` — paginated result rows with snippet + sources + brand mentions.
- `/api/v1/projects/[id]/sources` — domain + URL aggregates (reuses `lib/queries/sources.ts`).
- `/api/v1/projects/[id]/gaps` — domain + URL gaps with score + playbook (reuses `lib/queries/gap-analysis.ts`).
- `/api/v1/projects/[id]/competitors` — competitor list with domain + alias set.

**Cross-cutting:**

- `lib/api-auth.ts` — `requireApiKey(request, requiredScope)` helper. Looks up `token_hash` by prefix, constant-time compares, increments `last_used_at`.
- Rate limiting: 60 req/min per key, simple in-memory counter with periodic reset. Upgrade to Redis when traffic demands.
- Pagination contract: `?page=1&page_size=50`, cap `page_size` at 200. Response envelope `{ data, pagination: { page, page_size, total, has_more } }`.
- Error envelope: `{ error: { code, message, details? } }` with stable `code` values.

**Docs:** `/docs/api` page (SSR, no MDX build step) listing every endpoint with `curl` + `fetch` examples. Generated from a single source-of-truth array in `lib/api/catalogue.ts` so we don't drift.

**Sizing:** ~5 days.

### B — MCP server (Week 16)

**What:** Wrap the REST API with a streamable-HTTP MCP server so Claude connectors can query CMO.ie data in natural language. Reuses the same token scheme as REST.

**Implementation:**

- `src/app/api/mcp/route.ts` — handles `POST` with MCP envelope, dispatches to `lib/mcp/tools.ts`.
- Tools (read-only v1):
  - `get_visibility(project_id, window?)` — visibility %, SoV, totals.
  - `get_prompt_detail(project_id, prompt_id)` — full per-prompt breakdown.
  - `list_gaps(project_id, scope: "domain" | "url")` — ranked gaps with competitors + playbook.
  - `list_sources(project_id, source_type?)` — domain aggregates.
  - `get_recent_chats(project_id, limit?)` — latest result rows with snippets.
- OAuth 2.0 authorization-code flow for connector install; after install, the token is scoped to exactly the org that installed it.
- Published as a connector card with install URL, scopes, and a screenshot of a Claude conversation using it.

**Demo shape:** "Ask Claude: *how did my AI visibility change this week, and what's the single best gap to act on?*" → Claude hits `get_visibility` + `list_gaps` + `get_prompt_detail`, composes a two-paragraph answer with a real citation.

**Sizing:** ~4 days. Most of the cost is in the OAuth install flow + verifying the connector works end-to-end with a real Claude session.

### C — Credit-pool pricing (agency tier) (Week 17)

**What:** New plan type `agency` with a shared brief-credit pool that spans every project the org owns, plus allocation UI so the agency owner can cap individual clients.

**Schema (migration 017):**

- `organisations.plan` — extend check constraint to include `agency`.
- `organisations.agency_credit_pool INT NOT NULL DEFAULT 0` — replaces `brief_credits_limit` for agency-tier orgs.
- `project_credit_allocations` — `project_id PK`, `monthly_cap INT` (nullable; NULL = uncapped within pool). A tiny table, but essential for capping one client's spend.
- Stripe: new price on the agency product. Default pool size: 100 briefs/month at €500/mo, 250 briefs/month at €1000/mo (tune once we know ICP price tolerance).
- `PLAN_LIMITS.agency` in `lib/types.ts` — `projects: Infinity`, `briefCredits: <pool>`, `actionTier: "full"`.

**Implementation:**

- Billing: adapt `lib/billing.ts` to:
  - Treat agency pool as the org's `brief_credits_limit`.
  - `getOrgBriefCredits(orgId)` returns pool + usage across all projects.
  - `getProjectBriefCredits(projectId)` returns the per-project cap from `project_credit_allocations` + project-local usage.
  - Brief route decrements project usage first, then pool.
- Admin UI: an "Allocation" panel at `/agency/billing` where the owner sets per-client caps.

**Sizing:** ~5 days. Most of the risk is Stripe integration — we must test migration from `pro` → `agency` cleanly with a real test-mode subscription.

### D — Multi-client org management polish (Week 18)

**What:** Make the agency UX actually pleasant. Roll-up dashboard, per-client drilldown, brand-switching without re-login, invitation polish.

**Implementation:**

- `/agency/dashboard` — all org projects stacked; per-project visibility sparkline + gap count + last-run date.
- Project switcher: keep the current sidebar per-project nav, add a top-level org switcher for users in multiple orgs. Already half-implemented — finish it.
- Invitations: on accepting an invite, land in the org's first active project; show an "onboarded by <name>" welcome strip for 24h.
- Branding per-client: already shipped (`brand_display_name`, per-competitor colour) — this week is just making sure the agency surface actually uses it.

**Sizing:** ~4 days. More polish than new surface.

### E — CSV export + model coverage (Week 19)

**What:**

- CSV export buttons on Sources (domains + URLs), Gap Analysis (domains + URLs), per-prompt detail, and Insights.
- Two new ModelAdapters: Microsoft Copilot (via Azure OpenAI + Bing grounding) and xAI Grok (via xAI API).
- Both support BYOK. Default-off on existing projects; opt-in on the Competitors / Models tab.

**Implementation:**

- `lib/csv.ts` — generic `toCsv(rows, columns)` helper. CSV is easier than we think but we do need to handle commas + quotes + newlines inside string cells. One helper, tested.
- Pages add a small "Export CSV" button top-right on each table/list.
- `lib/models/copilot.ts` + `lib/models/grok.ts` — same `ModelAdapter` shape as the existing four. Add to the router. Add `copilot` + `grok` to the `AIModel` union in `types.ts` (breaking-ish — everywhere we `switch(model)` needs to handle the new values).

**Sizing:** ~4 days. CSV is a half-day; the adapters are the bulk.

### F — Agency launch (Week 20)

**What:**

- `/agency` public marketing page — who it's for, what's in it, pricing.
- Onboarding flow for agency orgs: set up billing, invite team, create first 3 client projects.
- Seed 3 demos with Dublin agencies from Howl's network.

**Sizing:** ~3 days of copy + design + 2 days of sales outreach prep.

---

## Execution plan (recommended order)

| Week | Workstream(s) | Deliverable |
| ---- | ------------- | ----------- |
| 1 | **A** (REST API v1) | Migration 016, api-auth lib, 7 endpoints, docs page |
| 2 | **B** (MCP server) in parallel with **E** adapters | MCP endpoint + tools; Copilot/Grok adapters |
| 3 | **C** (Agency tier) | Migration 017, billing overhaul, Stripe prices |
| 4 | **D** (Multi-client polish) + **E** CSV | Agency dashboard; export buttons |
| 5 | **F** + tidy-up | Landing page, demos booked |
| 6 | Buffer | Slip absorption + customer feedback |

Parallel tracks rule-of-thumb: Track A (A → B) doesn't overlap with Track B (C → D → F); Track C (E) is small and slots in anywhere.

---

## Coordination with Phase 2 surfaces

Phase 3 is additive: it wraps the existing `lib/queries/*` helpers rather than replacing them. Specifically:

- **REST API reuses every query helper shipped in Phase 2.** If we ever change a query shape, we bump `/api/v1` to `/api/v2` — never break consumers silently.
- **CSV export reads from the same helpers.** No risk of export showing different numbers than the dashboard.
- **MCP server is a thin wrapper over REST.** If REST breaks, MCP breaks too — by design.
- **Agency tier changes `PLAN_LIMITS` but not dashboard semantics.** Blur gates and credit panels read from the plan config like they do today.

The one cross-cutting change is `AIModel` union in `lib/types.ts` getting two new values. Anywhere we exhaustive-switch on the union (adapters router, dashboard chart labels, `MODEL_LABELS`) will need the two new arms. TypeScript will surface all of them on the first `tsc --noEmit` after the type change — we fix them straight through.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| REST API v1 contract decisions we can't reverse | Medium | High | Keep writes out of v1. Version the namespace. Publish a "this may change" banner on the docs page until W20. |
| MCP OAuth flow fighting Next.js SSR | Medium | Medium | Prototype the connector install in W15 as a side-errand before W16 depends on it being clean. |
| Stripe test/prod drift when adding agency prices | Medium | High | Run through the agency signup flow on a staging subscription before shipping W17. Monitor the first live conversion hourly for 72h. |
| Copilot/Grok adapters rate-limit or break in ways the existing four didn't | Medium | Medium | Ship them default-off. Add retries via the existing `lib/models/retry.ts`. First-party smoke test each before the first customer gets access. |
| Agency customer uncovers a multi-tenant RLS hole | Low | Catastrophic | We already have RLS on every table shipped Phase 1+2. Add an automated test: a non-owner user of org A cannot read org B's projects via REST API. |
| Phase 3 scope creep from demo feedback | High | Medium | Log all demo feedback in `docs/phase-3-feedback.md`. Review only at end-of-week. Nothing gets pulled into the current week mid-sprint. |

---

## Kick-off task list

1. **Migration 016** — `api_keys` table + indexes.
2. **`lib/api-auth.ts`** — token verification, scope checking, rate limit bookkeeping.
3. **REST v1 endpoints** — 7 routes listed in Workstream A.
4. **API docs page** — `/docs/api` with endpoint catalogue + examples.
5. **MCP server route** — dispatch + tool schemas.
6. **MCP tools** — 5 read-only tools over the REST helpers.
7. **Migration 017** — agency plan + credit pool + allocations table.
8. **Billing layer overhaul** — `getOrgBriefCredits` / `getProjectBriefCredits` updates.
9. **Agency allocation UI** — `/agency/billing` panel.
10. **Agency dashboard** — roll-up view.
11. **CSV export helper** — `lib/csv.ts` + buttons on 4 pages.
12. **Copilot adapter** — Azure OpenAI + Bing grounding.
13. **Grok adapter** — xAI API.
14. **AIModel union expansion** — types.ts + every exhaustive switch.
15. **Agency landing page** — `/agency`.
16. **Three seeded demos** — OG books these in Howl's network.

---

## Open questions for OG to decide before W17

- **Agency tier price points.** €500 / €1000 / €2000 per month? Credit pool sizes? My draft: €500 = 100 briefs, €1000 = 250 briefs, €2000 = 600 briefs. Revisit after two demos.
- **Copilot API source.** Azure OpenAI (requires Azure subscription) or the public Microsoft Copilot API if it exists by W19? The plan doc assumed "if scraped channels are live". We have not shipped scraped channels. Decision needed.
- **MCP connector distribution.** Public connector directory listing or private install URL first? Public gets more reach; private lets us iterate without breaking users.
- **REST API rate limit.** 60 req/min is a guess. Tighten once we see usage.
