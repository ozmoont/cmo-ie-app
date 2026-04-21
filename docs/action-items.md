# Action items for OG

_Last synced: 19 April 2026, ~22:05._

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
- [ ] **Apply migrations 005 + 006** to your Supabase project. Either:
  - Dashboard → SQL Editor → paste contents of `supabase/migrations/005_real_data_pipeline.sql` + `supabase/migrations/006_brand_matching.sql` → Run each, OR
  - `supabase db push` if you have the Supabase CLI linked.
  - 005 truncates the synthetic Haiku data. No customers = no loss.
  - 006 adds brand matching fields (aliases / regex / domains) and the `result_brand_mentions` table that Share of Voice queries against.
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

## 📚 Reading — when you have 10 min

Written tonight, worth a skim before next session:

- [ ] [`docs/peec-ai-competitive-review.md`](./peec-ai-competitive-review.md) — full Peec feature audit
- [ ] [`docs/execution-plan.md`](./execution-plan.md) — 26-week plan, team model, kill list, risks
- [ ] [`docs/data-collection-sources.md`](./data-collection-sources.md) — audit that drove tonight's rebuild
- [ ] `README.md` — data pipeline section is new

---

## Appendix A — Claude's autonomous queue

Recently landed (19 April, evening sprint):

- [x] **Parallelise model calls per prompt.** `Promise.all` across adapters, per-adapter error isolation. ~4× speedup once real keys are in.
- [x] **BYOK wiring.** `organisations.{anthropic,openai,google,perplexity}_api_key` read in the run engine, passed through to adapters. Router also counts BYOK-set adapters as available.
- [x] **Migration 006 — brand matching + mentions table.** `display_name` / `tracked_name` / `aliases[]` / `regex_pattern` / `domains[]` on competitors and projects, plus `result_brand_mentions` (per-chat brand appearance records). Run engine now uses deterministic matching via `lib/brand-matching.ts` (was Claude-based).
- [x] **Share of Voice metric.** `computeShareOfVoice` + `summariseShareOfVoice` in `lib/format.ts`; `getShareOfVoice` + `getBrandMentionBreakdown` queries in `lib/queries/share-of-voice.ts`. Matches the Peec docs formula.

Next up (in order, as you sleep):

1. **Run engine integration tests.** Mocked adapters, end-to-end flow, DB writes, error isolation. Currently have unit coverage on adapters + brand matching + SoV; the run engine's orchestration path is thin on coverage.
2. **Migration 007 — tags + topics.** Filterable organisation layer on prompts. Schema + dashboard-filter infrastructure.
3. **Auto-detected competitor suggestions.** When a non-tracked brand shows up in `result_brand_mentions` ≥ 2 times, surface it as a pending suggestion. Cheap follow-on since matching data already flows.
4. **Brand profile extraction.** Claude parses the site at onboarding into structured profile (company / what you do / market / audience / products). Stored, editable, used to drive suggestions instead of re-fetching HTML.

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
