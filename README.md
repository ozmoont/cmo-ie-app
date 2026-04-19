# CMO.ie

AI search visibility for Irish brands. CMO.ie monitors ChatGPT, Perplexity, Gemini, and Google AI Overviews daily — showing marketing leaders when their brand gets mentioned, where they rank against competitors, and what to do about it.

Built for solo marketers, small in-house teams, and agency strategists serving Irish growth brands.

## Stack

- **Next.js** 16.2.3 (App Router) · **React** 19.2.4 · **TypeScript** 5
- **Tailwind CSS** v4 · **Radix UI** primitives · **Recharts**
- **Supabase** (Postgres + Auth + SSR)
- **Stripe** billing
- **Anthropic SDK** for model-side calls
- **Vitest** + **React Testing Library** for unit tests

## Getting started

```bash
# 1. install
npm install

# 2. env — copy and fill in keys
cp .env.local.example .env.local   # if an example exists; otherwise see below

# 3. dev server
npm run dev
```

Open http://localhost:3000.

### Environment variables

See [`.env.example`](./.env.example) for the full list. At a minimum the app expects Supabase, Stripe, and at least one model adapter API key:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY` (Claude adapter + brand-mention analysis)
- Optionally: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY` — any model without a key is skipped on runs rather than failing.

Treat `.env.local` as secret — it is gitignored.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint (Next.js config) |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:run` | Run Vitest once (CI) |
| `npm run typecheck` | Strict TypeScript check |
| `npm run smoke:models` | Exercise each configured model adapter with a real API call |

## Project structure

```
src/
  app/
    (auth)/             login, signup, server actions
    (dashboard)/        dashboard, onboarding, projects, settings
    api/                auth, billing, credits, me, projects, prompts, settings, team
    layout.tsx          root shell
    page.tsx            marketing home
    opengraph-image.tsx edge OG image
  components/           dashboard + ui (shadcn-style) components
  lib/
    models/             per-provider adapters (Claude, ChatGPT, Gemini,
                        Perplexity) + shared types + router
    billing.ts          Stripe helpers
    queries.ts          Supabase query helpers
    run-engine.ts       prompt-run orchestration (uses lib/models)
    supabase/           SSR client + server client
    types.ts            shared types
    format.ts, utils.ts
scripts/
  smoke-models.ts       `npm run smoke:models` — exercise every adapter
supabase/
  migrations/           001 → 005 (005 is the simulation-to-real cutover)
docs/
  peec-ai-competitive-review.md
  execution-plan.md
  data-collection-sources.md
```

## Data pipeline

Every (prompt × model) combination goes through:

1. **Adapter query** (`src/lib/models/*.ts`) — real call to the provider's API with web search / grounding enabled. Returns the response text plus a list of source URLs, each flagged as `cited_inline` or merely retrieved.
2. **Analysis** (`src/lib/run-engine.ts` — Claude Haiku) — extracts `brand_mentioned`, `mention_position`, and `sentiment` from the response text.
3. **Persist** — `results` row + one `citations` row per source with `was_cited_inline`, `is_brand_domain`, `is_competitor_domain`, and `position`.

Adding a new model: implement `ModelAdapter` in `src/lib/models/{name}.ts`, register it in `src/lib/models/index.ts`, and extend the `AIModel` enum in `src/lib/types.ts`. See [`docs/data-collection-sources.md`](./docs/data-collection-sources.md) for the audit that led to this pipeline.

## Database

Supabase migrations live in `supabase/migrations/`. Apply via the Supabase CLI or the dashboard. Current migrations:

1. `001_initial_schema` — core tables
2. `002_brief_credits` — credit ledger for brief generation
3. `003_polish_requests` — polish-request queue
4. `004_org_api_keys` — per-org API key storage

## Design system

Visual direction, type, motion, and anti-patterns are documented in [`.impeccable.md`](./.impeccable.md). Summary: paper-warm light surfaces, near-black type, deep forest green as a rare accent. Geist for UI and mono. No gradient CTAs, no glow, no AI-slop fingerprints.

## Testing

Vitest runs in a jsdom environment. Component tests sit alongside source or under `__tests__/`. Example:

```tsx
// __tests__/button.test.tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Button } from "@/components/ui/button";

test("renders children", () => {
  render(<Button>Continue</Button>);
  expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
});
```

Async Server Components aren't supported by Vitest — cover those with end-to-end tests when we add Playwright.

## Business artefacts

`financial-model.py` generates `CMO.ie_Financial_Model.xlsx`. The script is the source of truth; regenerate the workbook by running:

```bash
python3 financial-model.py
```

## Agent guidance

If an AI assistant is helping with this codebase, read `AGENTS.md` first — Next.js 16 has breaking changes from earlier versions, and assistants should consult the shipped docs under `node_modules/next/dist/docs/` before writing code.
