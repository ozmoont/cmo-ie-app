# Deploying CMO.ie to Vercel

Runbook for putting the app in front of a test team.

## Target environments

We run two environments:

- **Preview** — every PR / non-main branch gets a throwaway `cmo-ie-<hash>.vercel.app` URL. Shares the production Supabase but no customer cares because PR deploys are private.
- **Production** — what `cmo-ie.vercel.app` (or `app.cmo.ie`) points at. Every merge to `main` deploys here. Testers use this URL.

We do NOT run a separate "staging" Supabase — adds maintenance overhead without the value at this stage. When the first real paying agency signs up we'll split environments.

## First-time setup (one-off, ~15 minutes)

### 1. Push latest code to GitHub

```bash
cd ~/Projects/cmo-ie
git status                    # make sure your local changes are committed
git push origin main
```

### 2. Create the Vercel project

- https://vercel.com → "New Project" → Import Git Repository → pick `cmo-ie`.
- Framework: Next.js (auto-detected).
- Root directory: `./` (default).
- Build + output settings: defaults — Next.js ships correctly out of the box.

### 3. Set env vars (Vercel → Project → Settings → Environment Variables)

Copy from your local `.env.local`. For each variable, apply to "Production" + "Preview" unless noted.

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key — never ship this to the browser. Keep "Sensitive" toggle ON. |
| `ANTHROPIC_API_KEY` | Yes | Claude / Anthropic key. |
| `OPENAI_API_KEY` | Optional | ChatGPT adapter. |
| `GEMINI_API_KEY` | Optional | Gemini adapter. |
| `PERPLEXITY_API_KEY` | Optional | Perplexity adapter. |
| `XAI_API_KEY` | Optional | Grok adapter. |
| `AZURE_OPENAI_*` + `BING_SEARCH_CONNECTION` | Optional | Copilot adapter (needs 3 Azure vars). |
| `JINA_API_KEY` | Optional | Lifts the Jina Reader fallback rate cap; works without it for small traffic. |
| `NEWSLETTER_TOKEN_SECRET` | Yes (for /crawlability newsletter) | 16+ chars. `openssl rand -hex 24`. |
| `CRON_SECRET` | Yes | Random string; Vercel Cron calls use this in the Authorization header. `openssl rand -hex 24`. |
| `STRIPE_SECRET_KEY` | Optional | Live key (sk_live_…) in Production; test key (sk_test_…) in Preview. |
| `STRIPE_WEBHOOK_SECRET` | Optional | The webhook signing secret Stripe gives you per-endpoint. |
| `STRIPE_PRICE_STARTER` | Optional | Price IDs for each plan. Generate in the Stripe dashboard. |
| `STRIPE_PRICE_PRO` | Optional | |
| `STRIPE_PRICE_ADVANCED` | Optional | |
| `STRIPE_PRICE_AGENCY` | Optional | |

### 4. Configure Supabase redirect URLs

Supabase needs to know which URLs can receive auth callbacks (signup confirmation, magic-link).

- Supabase Dashboard → Authentication → URL Configuration.
- Add `https://cmo-ie.vercel.app/**` to the redirect allowlist.
- If you're using a custom domain, also add `https://cmo.ie/**` or `https://app.cmo.ie/**`.
- Keep `http://localhost:3000/**` — that's your dev env.

### 5. First deploy

Click "Deploy" in Vercel. First build takes ~2 minutes. You'll get a URL like `cmo-ie-og.vercel.app`.

### 6. Smoke-test

- Open `/` — marketing page should render.
- Open `/login` — sign in as `odhran+1@howl.ie` / `Hotdog99.`.
- Open `/dashboard` — project list.
- Click into the Howden or icabbi project.
- Click "Run" — kick off a real pipeline (~2 min with the concurrency refactor).
- Click into Gaps → Act on this → Generate brief. Confirms the Claude path.
- Try `/crawlability?` on your phone — the public page should be reachable without auth.

If any of those fail, check Vercel's "Deployments" → latest → "Runtime Logs". The terminal-style logs we added during the signup-debug session (`projects POST — …` style) surface here.

## Custom domain (optional but recommended before agency demos)

1. Add `app.cmo.ie` (or `cmo.ie`) to your DNS provider, pointed at Vercel's CNAME.
2. Vercel → Project → Settings → Domains → add the domain. Vercel issues the SSL certificate automatically.
3. Update Supabase redirect URLs (step 4 above) to include the new domain.
4. Update `/agency` and `/crawlability` copy if they reference the vercel.app URL anywhere.

## Ongoing operations

### Deploying updates

Every push to `main` deploys automatically. No action needed from you.

Rollback if something breaks:

- Vercel → Deployments → find the last good deploy → click "…" → "Promote to Production".

### Cron jobs

The monthly playbook cron (`/api/cron/monthly-playbooks`) is declared in `vercel.json` — runs at 09:00 UTC on the 1st of each month. First execution on whichever 1st-of-the-month comes after you first deploy. You can invoke it manually for testing:

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://cmo-ie.vercel.app/api/cron/monthly-playbooks
```

### Cost monitoring

Keep an eye on three bills:

1. **Vercel** — free Hobby tier is fine until you have real traffic. Bandwidth + function invocations both count.
2. **Supabase** — Free tier until 500MB database + 2GB bandwidth. Upgrade to Pro (~$25/mo) before launch.
3. **Anthropic** — the one that'll actually cost money. Set a spend cap in the Anthropic console and subscribe to the 50%/90% threshold emails.

### Function duration limits

Long-running routes (actions, runs, monthly-playbooks) have `maxDuration` set in `vercel.json`. Defaults would cut them off at 10s. If Vercel's Hobby plan doesn't allow the durations we've set, upgrade to Pro — this is the only reason to pay before the first customer.

## Rolling it out to testers

1. Pick a URL (`cmo-ie.vercel.app` for internal, `app.cmo.ie` for external demos).
2. Share with testers + a short "what to try" doc. Good first-run script:
   - Sign up with your real email.
   - Create a project for your brand.
   - Pick a sector from the onboarding list.
   - Hit Run — watch it pull real AI responses.
   - Open Gaps → click a domain → "Act on this".
   - Download PDF from any page.
3. Ask them to paste bugs / confusions into a shared doc. Don't try to collect feedback in 10 channels.

## Troubleshooting

- **Signup → "Account created but organisation setup failed":** slug collision bug was fixed in the signup action — if it recurs, check the Vercel Runtime Log for the Postgres error; probably a plan-limits or migration drift issue.
- **Runs stuck > 5 min:** one of the model adapters is hanging. We ship a 45s per-task timeout — if the UI still shows "running" past that, check the `result` rows in Supabase; errored results have `model_version = 'error'` and an `[Error: …]` snippet.
- **Brand profile extraction fails:** the Jina Reader fallback should cover most sites. If it still fails, fill the profile manually via `/projects/[id]/profile`.
- **500 errors across the board:** usually env vars. Check every row of the table above.
