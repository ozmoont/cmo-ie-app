# Phase 5 scope — Launch readiness

_Target window: week 26 (~end of October 2026)._
_Status as of 23 April 2026: Phases 1-4 are all shipped and green (252 tests). Phase 5 is the launch week — one week only. Everything that ships here is sales / marketing / communications, not new features._

## Why Phase 5 matters

Four phases of building have produced the product. Phase 5 is the week we **tell the world what we built** — in a way that gets Irish agencies and B2B marketers to book demos. A product that ships without a launch announcement is a product nobody buys.

The plan deliberately isolates launch work to one week so feature development doesn't contaminate it. No new features. No "one more small thing." Five working days of copy, design polish, and outreach.

## Success criteria

- Public pricing page live at `/pricing` with all four paid tiers (Starter / Pro / Advanced / Agency — the tiers we already charge for via Stripe) plus trial.
- A `/changelog` page listing every material shipment from Phase 1-4. Credibility artifact — "this thing wasn't built in a weekend".
- Landing page (`/`) carries a real headline + three proof-points + two CTAs (demo + trial) and reads cold to an Irish marketing director.
- Launch posts drafted and scheduled:
  - Howl.ie blog
  - OG's LinkedIn
  - Indie Hackers
  - Twitter/X thread
- **Ten agency demos booked** (slip target: seven if reality bites).
- Soft-launch decision made — go public or stay "private beta" until we've closed three paying agency accounts.

---

## Workstreams

### A — Public pricing page (1 day)

**What:** A standalone `/pricing` page matching the editorial style of `/agency`. Four tier cards + trial row.

**Implementation:**
- Server-rendered page at `/src/app/pricing/page.tsx`.
- Reuses `PLAN_LIMITS` from `lib/types.ts` so pricing drift is impossible — if someone bumps prompt limits in the product, the pricing page updates automatically.
- Feature-comparison table below the tier cards. Anti-marketing; the real limits, not "up to" handwaving.
- FAQ section: what counts as a check, how credit refills work, whether we charge for failed model calls, GDPR / data handling, cancellation.
- CTA: Book a demo (→ Calendly or mailto until we wire a real widget).

**Sizing:** 1 day. Mostly copy + layout; `PLAN_LIMITS` drives the numbers.

### B — Changelog page (0.5 day)

**What:** A dated list of what we shipped, grouped by phase.

**Implementation:**
- Static `/changelog/page.tsx`. MDX if we have it wired; plain TSX if we don't.
- Curated — not a git-log dump. One line per material ship, grouped by month + phase.
- Highlight the big marketing points: Gap Analysis, Irish publisher weighting, MCP server, Agency tier, PDF reports.

**Sizing:** 0.5 day. This is the easiest ship of the week.

### C — Landing page polish (1 day)

**What:** Rewrite the `/` page for a cold Irish marketing director.

**Current state:** a generic Next.js starter-ish home. Needs a real hero, three proof points, two CTAs.

**Implementation:**
- Hero: "Track your AI visibility across ChatGPT, Claude, Perplexity, Gemini — built for Irish brands."
- Proof strip: logos if we have any permitted, anonymised otherwise ("an Irish agency running 12 clients on the Agency tier").
- Three-card feature grid: Gap Analysis, Irish-first sources, Monthly playbook email.
- Testimonial slot (can be a real Howl quote if OG writes one).
- Two CTAs: "Start free trial" + "Book a demo".
- Hide the `/` sign-up auto-redirect that bounces logged-in users — marketing page takes precedence.

**Sizing:** 1 day. Design + copy + a11y pass.

### D — Launch posts (1 day)

**What:** Four pieces of launch content, ready to publish / schedule.

**Drafts to write:**

1. **Howl.ie blog post** — long-form. 1500-2000 words. "We built a CMO for AI search, for Irish brands. Here's why." Story-driven, covers: the problem (AI search is replacing Google for B2B queries), the gap (Peec is great but U.S.-centric), the choices we made (Irish publisher weighting, sector templates, agency tier). Includes a screenshot or GIF of Gap Analysis in action.
2. **OG's LinkedIn post** — 300 words. Founder voice. "6 months, one person + Claude. Here's what we shipped." Lists the main features with one sentence each. Calls out the /crawlability free tool.
3. **Indie Hackers post** — technical/business angle. "Solo + AI builder: lessons from 6 months shipping CMO.ie." Honest about where we used contractors, where AI coded, where we got stuck.
4. **Twitter/X thread** — 8-10 tweets. Punchy. One thread per big feature. Screenshots.

**Implementation:** A new `docs/launch-posts/` folder, four markdown files. OG copy-edits + schedules.

**Sizing:** 1 day to draft. OG adds voice on top.

### E — Agency demo booking push (Ongoing, W25-W26)

**What:** Outreach to 15-20 Dublin / Cork agencies, target 10 demos booked.

**List to build:**
- Howl's network (first 3)
- Dublin ad agencies (via IAPI member list — pull from iapi.ie/members)
- Irish digital/SEO agencies (via LinkedIn search "Dublin digital agency 10-50 employees")
- Regional agencies (Cork, Galway, Belfast)

**Outreach template:** Short. Founder voice. Mention CMO.ie's Irish-first positioning. Offer a 30-min walkthrough where we run their prompts against their actual brand. Attach a PDF report.

**Founder task, not code.** Logged in `docs/phase-3-feedback.md` as demos happen.

### F — Soft-launch vs hard-launch decision (1 hour, W26 Monday)

**What:** Go/no-go call on making CMO.ie publicly discoverable.

**Inputs for the decision:**
- Pricing page landed? (Blocker if no)
- Three agency demos happened? (Quality signal)
- Any catastrophic bug in the last 7 days? (Blocker if yes)
- Anthropic bill trajectory acceptable? (Budget check)

**Outcomes:**
- **Go:** publish launch posts, switch `/` from redirect-to-dashboard-if-logged-in to always-show-marketing for unauth. Submit to Product Hunt, Indie Hackers front page, Hacker News Show HN.
- **Stay quiet:** keep `/` private, close three paying agency accounts first, re-decide at end of November.

### G — Launch-day observability (0.5 day, W26 Wednesday)

**What:** Minimum viable ops for a launch spike.

**Implementation:**
- Sentry (or equivalent) wired for errors. Lose nothing to console.log.
- Anthropic cost dashboard — a simple `/admin/costs` page that pulls usage from the Anthropic API (has a `/v1/organizations/usage_report` endpoint) and shows daily spend.
- Alert: "Anthropic spend > €X/day" email to OG. Cheap insurance against a runaway prompt loop.

**Sizing:** 0.5 day.

### H — Buffer / reserved for emergencies (0.5 day)

Always reserve a half-day of launch week for whatever breaks. If nothing breaks, this becomes the third launch-post polish pass.

---

## Execution plan

| Day  | Focus | Deliverable |
| ---- | ----- | ----------- |
| Mon  | A + F | `/pricing` page live; soft/hard-launch decision made |
| Tue  | B + C | `/changelog` + landing-page rewrite |
| Wed  | D + G | 4 launch post drafts + observability wired |
| Thu  | E     | Outreach push + demo bookings follow-up |
| Fri  | E + H | More demos + emergency buffer + schedule launch posts |

Realistic expectation: demos book faster than code ships. Don't let demo scheduling eat the week.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Anthropic spend spikes on launch day from curious sign-ups | Medium | High | Trial plan has hard `totalChecks: 10` cap. Auto-reload Anthropic off — let it fail loud if we hit our budget wall instead of surprising us with a €2k bill. |
| A known bug surfaces in front of a paying customer on day 1 | Medium | Catastrophic | Sentry + a fast-response policy. Keep the launch posts short so a bug-fix patch is one deploy away. |
| Demos don't book — "noted interest" but no calendar hold | High | Medium | Offer a specific slot, not "whenever works". The IAPI outreach list is the denominator; convert 20-25% of outreach to booked demos. |
| Launch post lands in product-hunt dead zone | High | Medium | Don't rely on PH. The Howl blog + OG's LinkedIn are the primary channels; PH is bonus. |
| Pricing page copy gets legal-reviewed and slips | Low | Medium | Write it plain. No terms-and-conditions nonsense on the pricing page itself — link to legal docs if needed. |
| OG sick / travelling launch week | Low | High | Pre-schedule the posts. Howl peer keeps an eye on Sentry + DMs. |

---

## Explicitly NOT in Phase 5

- **No new model adapters.** Copilot / Grok shipped behind env flags; enable them only if you've personally tested them. Don't launch a "we track 7 models" claim without evidence.
- **No new migrations.** If the DB changes during launch week, something went wrong.
- **No MCP OAuth install flow.** P3-B3 is still parked; shipping it launch week risks breaking the existing static-token path.
- **No Looker connector.** Unless someone on a demo asks for it explicitly.
- **No public "Share of Voice" leaderboard.** Tempting but needs opt-in legal clarity; defer.

---

## After Phase 5

The 26-week plan ends here. The questions for end-October 2026:

1. **Revenue signposts hit?** Target: €10k+ MRR, 50+ customers, 3-5 agency accounts.
2. **Next buildable thing that matters most?** Candidates in rough priority:
   - Real email dispatcher for monthly playbooks (unblock W22's "send" step)
   - Slack / Notion / Linear integrations (agency ICP asks for these)
   - Competitor suggestions wired into the run engine (parked as #40)
   - Scraped channel for ChatGPT UI (if SerpAPI proves inadequate)
   - Budget / spend controls (self-serve BYOK caps)
3. **Team decision.** If MRR + pipeline justify it, hire one engineer for Q1 2027. Otherwise stay solo + AI.

Phase 5's real deliverable is earning the right to ask those questions with real data.
