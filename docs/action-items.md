# Action items for OG

_Last synced: 22 April 2026 — Phase 2 complete, starting Phase 3._

This is the running list of things only the founder can do (credentials, business calls, commits, deploys). Tick items with `[x]` as you go; Claude will update this file during sessions to reflect progress.

Claude's autonomous work queue is in [Appendix A](#appendix-a--claudes-current-autonomous-queue).

---

## 🚨 Urgent — security (tonight)

- [ ] **Rotate Anthropic API key.** The key `sk-ant-api03-EH6k…` was transmitted in this chat session. Revoke at https://console.anthropic.com/settings/keys, generate a replacement.
- [ ] **Rotate Supabase JWT secret.** Dashboard → Project settings → API → "Reset JWT secret". This invalidates the old `anon` + `service_role` keys; copy the fresh values.
- [ ] **Delete `.env.local.save`** from `~/Projects/cmo-ie` — the sandbox couldn't remove it (fuseblk permissions). Run `rm .env.local.save` locally.
- [ ] **Audit for anomalies.**
  - Anthropic console → Usage → eyeball the graph on the old key for unexpected spikes.
  - Supabase dashboard → Logs / audit for anything anomalous between 16 Apr (when `.env.local.save` was created) and now.

## 🔧 Setup — unblocks everything else

- [ ] **Paste fresh keys into `.env.local`.** File is already structured with empty slots. Required: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **`npm install`** from `~/Projects/cmo-ie` on your Mac. Picks up `tsx` as a new dev dep (needed by the smoke test).
- [ ] **Apply migrations 005 → 009** to your Supabase project. Either:
  - Dashboard → SQL Editor → paste each of `supabase/migrations/005_real_data_pipeline.sql` through `009_brand_profile.sql` in order → Run, OR
  - `supabase db push` if you have the Supabase CLI linked.
  - **005** truncates the synthetic Haiku data. No customers = no loss.
  - **006** brand matching fields (aliases / regex / domains) + `result_brand_mentions`.
  - **007** tags + topics + prompt status enum + per-prompt country.
  - **008** `competitor_suggestions` table for the auto-detect pipeline.
  - **009** structured brand profile columns on projects.
- [ ] **Run the smoke test.** `npm run smoke:models`. Paste the output back in chat for review. Even just the Anthropic key filled in is enough to prove the pipeline end-to-end.

## 📝 Git housekeeping

- [ ] **Amend the initial commit** to fix the committer identity (`Odhran Ginnity <og@mac.lan>` → your real email). Optional but clean:
  ```
  git config --global user.email "odhran@howl.ie"
  git config --global user.name "Odhran Gavin"
  git commit --amend --reset-author --no-edit
  git push --force-with-lease origin main
  ```
  Safe to force-push — one commit, solo repo. Skip if you don't care.
- [ ] **Commit + push tonight's work** after smoke tests pass:
  ```
  git add .
  git commit -m "feat: real multi-model data pipeline + migration 005"
  git push
  ```
  The CI workflow should go green (lint / typecheck / 40 tests).

## 🔑 Optional — model coverage when you're ready

Fill any of these to light up more adapters. Missing keys = that model is skipped cleanly.

- [ ] **OpenAI API key** → https://platform.openai.com/api-keys (ChatGPT adapter via Responses API + web_search tool)
- [ ] **Gemini API key** → https://aistudio.google.com/apikey (Gemini adapter with google_search grounding)
- [ ] **Perplexity Sonar key** → https://www.perplexity.ai/settings/api (Perplexity adapter)

## 💰 Business decisions pending

- [ ] **SerpAPI go/no-go** for Google AI Overviews coverage. Starts ~$75/mo for 5k searches. Without it, google_aio stays in the "unimplemented" list. Recommendation: yes — Irish marketers will expect it. Decide by end of Phase 1.
- [ ] **Confirm plan start date.** Execution plan assumed Monday 27 April 2026 as Week 1. Slide if needed.
- [ ] **Product designer (Phase 2, weeks 14–18).** 20–40 hours for Sources + Gap Analysis + Actions v2 polish. €1.5–3k. Start sourcing now; Howl's network first.
- [ ] **Data-collection contractor (originally Phase 1).** Now deferred — tonight's rebuild covered 4 of 5 models via direct APIs. Only re-engage if we decide ChatGPT-without-search isn't enough and we need UI-scraped ChatGPT, or if Google AIO via SerpAPI proves inadequate.

## 📌 Near-term polish — parked

These are small-but-real items we consciously set aside while moving into Phase 3. Each is scoped to roughly half-a-day of work and none block Phase 3. Pick them up between Phase 3 milestones when momentum drops, or sweep them in the Phase 5 "launch readiness" buffer week.

- [ ] **#37 — Verify Claude inline-citation parsing with a citation-heavy prompt.** The Anthropic adapter's inline-citation detector was written against 2-3 test responses. Run a prompt that reliably pulls 10+ citations (e.g. "best SaaS companies in Ireland with sources") and spot-check that `was_cited_inline` matches the actual inline references, not just the sidebar list. If it drifts, tighten the matcher. Zero data-loss risk until then — we still store every source; inline-flag accuracy just affects the `citation_rate` column on Sources.
- [ ] **#40 — Wire competitor suggestions into the run engine.** `lib/competitor-suggestions.ts` has the infrastructure (`filterUntrackedBrands`, `recordSuggestionObservations`, `getPendingSuggestions`) and the DB table (migration 008) already exists. Missing: a call at the end of each run that extracts untracked brand names from `result_brand_mentions` and calls `recordSuggestionObservations`. Plus the "Track this competitor" button on the Competitors page. Roughly a day.
- [ ] **#45 — Improve summariser copy with actual numbers.** `summariseScore` / `summarisePosition` / `summariseSentiment` in `lib/format.ts` currently reach for generic phrasing. Rewrite to pull in specifics from the data — e.g. "Mentioned in 3 of 12 checks (25%) — Claude saw you, ChatGPT and Perplexity didn't." The hooks are already in place; it's a copy + test-cases pass.
- [ ] **#31 — Rotate Anthropic + Supabase keys.** Still live on the urgent list above. Keep it there.

## 📚 Reading — when you have 10 min

Written tonight, worth a skim before next session:

- [ ] [`docs/peec-ai-competitive-review.md`](./peec-ai-competitive-review.md) — full Peec feature audit
- [ ] [`docs/execution-plan.md`](./execution-plan.md) — 26-week plan, team model, kill list, risks
- [ ] [`docs/data-collection-sources.md`](./data-collection-sources.md) — audit that drove tonight's rebuild
- [ ] `README.md` — data pipeline section is new

---

## Appendix A — Claude's autonomous queue

Landed in the 19–21 April sprint:

- [x] **Parallelise model calls per prompt.** `Promise.all` across adapters, per-adapter error isolation. ~4× speedup once real keys are in.
- [x] **BYOK wiring.** `organisations.{anthropic,openai,google,perplexity}_api_key` read in the run engine, passed through to adapters. Router also counts BYOK-set adapters as available.
- [x] **Anthropic unsupported-country handling.** Adapter drops `user_location` for regions Anthropic rejects (IE), embeds market hint in the prompt instead. First real smoke test passed.
- [x] **Migration 006 — brand matching + mentions table.** `display_name` / `tracked_name` / `aliases[]` / `regex_pattern` / `domains[]` on competitors and projects, plus `result_brand_mentions`. Run engine uses deterministic matching via `lib/brand-matching.ts` (was Claude-based).
- [x] **Share of Voice metric.** `computeShareOfVoice` + `summariseShareOfVoice` in `lib/format.ts`; `getShareOfVoice` + `getBrandMentionBreakdown` in `lib/queries/share-of-voice.ts`. Matches the Peec docs formula.
- [x] **Run engine helper tests.** Exported `normDomain`, `buildMatchables`, `tagSources` and added focused unit tests — caught two silent data bugs (case-sensitive scheme matching + empty-string fallback).
- [x] **Migration 007 — tags + topics + prompt states + country.** `topics` and `tags` tables with join table, AND/OR-friendly indexes. Prompt status enum (active / inactive / deleted). Per-prompt `country_code` with backfill from project country_codes[].
- [x] **Migration 008 + suggestion helpers.** `competitor_suggestions` table. `filterUntrackedBrands`, `recordSuggestionObservations`, `getPendingSuggestions` in `lib/competitor-suggestions.ts` with unit tests.
- [x] **Migration 009 — brand profile.** Structured `profile_*` columns on projects. `extractBrandProfile` + `fetchSiteSnapshot` + `normaliseProfile` in `lib/brand-profile.ts` with unit tests.

Currently: **170 tests passing, lint + typecheck clean.** All of Phase 1 + Phase 2 shipped green.

Phase 2 wrap-up additions (22 April 2026):

- [x] **P2-C — Sources / URLs drill-down.** `getProjectSourceUrls` + `getProjectSourceUrlDetail` in `lib/queries/sources.ts`; `/api/projects/[id]/sources/urls` route; real URLs page with `?domain=` / `?page_type=` / `?url=` (drawer) support.
- [x] **P2-D1 — Gap Analysis algorithm.** `computeGapScore` + `getDomainGaps` + `getUrlGaps` in `lib/queries/gap-analysis.ts`. 9 unit tests locking in the scoring curve + ordering.
- [x] **P2-D2 — Gap Analysis page.** `/projects/[id]/gaps/{domains,urls}` with star ranking, competitor chips, source-type playbook text, "Act on this" CTAs. Sidebar entry added.
- [x] **P2-E1 — Migration 015.** `source_gap JSONB` on `polish_requests` + GIN index. (Renumbered from scope-doc's 011 since that slot was taken.)
- [x] **P2-E2 — Gap-aware brief generator.** `lib/gap-brief-templates.ts` — source-type-tailored playbook instructions. Brief route now has two modes (classic + gap). 12 unit tests covering playbook uniqueness + context rendering + title derivation.
- [x] **P2-E3 — Actions v2 UI.** `/projects/[id]/actions/gap` guided flow (idle → briefed → polished). Gap rows' "Act on this" route here now.
- [x] **P2-F1 — Dashboard drill-downs.** `DrilldownLabel` component; every Overview section label wired to the matching Insights / Sources / Gaps destination with scroll-to anchors.
- [x] **P2-F2 — Per-prompt detail page.** `lib/queries/prompt-detail.ts`; `/projects/[id]/prompts/[promptId]` with visibility %, inline SVG sparkline, latest-per-model snapshot, sources / brands panels, collapsible response history.
- [x] **Migration 014 — Action-table RLS.** Fixed the "navigate away mid-generation loses everything" bug.

Next up (Phase 3 — integrations + agency tier, weeks 15-20):

1. **Public REST API v1.** OAuth app + scoped read endpoints (`/projects`, `/metrics`, `/prompts`, `/chats`, `/sources`, `/competitors`). Rate limits, pagination, docs site.
2. **MCP server.** Wrap the REST API so Claude connectors can query visibility / gaps / sources data in-chat. Biggest sales-narrative payoff-per-hour on the plan.
3. **Credit-pool pricing (agency tier).** New plan type with shared credit pool across client projects. Reuse Stripe.
4. **Multi-client org management.** Agency dashboard, per-client allocation, invite flow polish.
5. **CSV export + model coverage expansion.** Copilot + Grok as trackable models.
6. **Agency tier launch.** `/agency` landing page + 3 seeded demos from Howl's network.

---

## Appendix B — Things we've explicitly deferred

Don't let these creep back in without a plan change.

- Full UI-scraping fleet (ChatGPT UI, Perplexity UI, Gemini UI)
- Agent Analytics / Crawl Insights (server-log ingestion)
- Query Fanouts (ChatGPT internal queries + common terms)
- Copilot, Grok, DeepSeek model coverage
- Volume score (prompt-level demand signal)
- Per-brand colour customisation UI
- In-app audit log / activity timeline
- Chrome extension, mobile app, Figma plugin
- Localisation beyond IE / UK / US / DE / FR

See [execution-plan.md § Kill list](./execution-plan.md#explicitly-on-the-kill-list) for rationales.
