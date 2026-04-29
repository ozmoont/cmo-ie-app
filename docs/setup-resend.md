# Resend setup — handover doc

_Audience: the 3rd-party doing the install. Owner: Howl.ie (Odhran). Last updated: 29 April 2026._

This doc walks through everything needed to wire Resend as the email-sending provider for CMO.ie. The work splits into two phases:

- **Phase A — infra (this doc).** Resend account, domain verification, API key, Vercel env vars. Required before any code can send mail.
- **Phase B — dispatcher code.** The code paths that call `resend.emails.send(...)`. Owned by Howl, lands as a follow-up. Phase A doesn't need to wait on Phase B.

If you only do Phase A, no production emails change — the dispatcher code reads the env vars but doesn't ship until Howl signs off.

---

## What Resend will be used for

Three transactional flows in CMO.ie:

1. **Newsletter double-opt-in** — visitors at https://www.cmo.ie drop their email into the "Get early access" form. We mint an HMAC-signed confirmation token, store the hash, and email the user a confirmation link. That email needs to send.
2. **Monthly playbook delivery** — the generator at `src/lib/monthly-playbook.ts` produces a markdown body + recipient list every month. Today it stops at the DB row; with Resend wired, the dispatcher reads `status='ready'` rows and sends.
3. **Future transactional bits** — invoice receipts (Stripe webhook follow-up), password reset (currently Supabase-managed, may move), team invites. Out of scope for v1; nice to have the channel ready for them.

---

## Prerequisites

The 3rd-party needs these before starting. Howl will provision/grant.

- [ ] Resend account access — invite as **Admin** on the Howl.ie Resend team workspace. (If no team workspace exists yet, create one named "Howl.ie" and invite `odhran@howl.ie` + the 3rd-party as Admins.)
- [ ] DNS access for **cmo.ie** — to add SPF / DKIM / DMARC / Return-Path records. Howl currently uses Cloudflare for cmo.ie DNS; access via the Howl Cloudflare account.
- [ ] Vercel access for the `cmo-ie-app` project (org `og-6054s-projects`) — needed to add the env var. Either invite the 3rd-party as a Project Member or have Howl run the final `vercel env add` step after the 3rd-party hands over the API key.

If any of those is blocking, ask Howl in #cmo-ie or `odhran@howl.ie` before starting.

---

## Step 1 — domain setup in Resend

1. Log into https://resend.com.
2. Sidebar → **Domains** → **Add Domain**.
3. Enter `cmo.ie` (the apex). Region: **EU (Frankfurt)** — keeps mail in-region for our Irish customer base + GDPR.
4. Resend will show four DNS records to add:
   - **SPF** (TXT at `cmo.ie` or `send.cmo.ie` depending on which subdomain Resend assigns).
   - **DKIM** (one or two CNAME records — `resend._domainkey` and possibly `resend2._domainkey`).
   - **MX** for the bounce handler.
   - **DMARC** (TXT at `_dmarc.cmo.ie`).
5. Don't close this page yet — you'll need the values for Step 2.

**Decision on the sending subdomain:** prefer `send.cmo.ie` (rather than the apex `cmo.ie`) so a future SaaS migration doesn't disrupt our marketing send infra. Resend defaults to a subdomain — accept whatever it suggests unless they push for the apex.

---

## Step 2 — add the DNS records

Where: **Cloudflare → cmo.ie zone → DNS → Records**.

For each record Resend gave you in Step 1:

1. Click **+ Add record**.
2. Match the type (`TXT`, `CNAME`, or `MX`) and paste the name + content verbatim from Resend.
3. **Crucial:** set Proxy status to **DNS only** (grey cloud, not orange). Cloudflare's proxy mangles SPF / DKIM / MX records. They MUST be DNS-only.
4. TTL: `Auto` is fine.
5. Save.

Repeat for all four records.

DMARC default we want at first:

```
v=DMARC1; p=none; rua=mailto:dmarc@howl.ie; aspf=r; adkim=r;
```

`p=none` so we observe-only at first. Once we've verified zero false-positive bounces over a week, bump to `p=quarantine` and eventually `p=reject`. This is documented as a follow-up; ship `p=none` for now.

After adding all records:

- Wait 5–60 minutes for propagation. Cloudflare usually resolves in under 5.
- Back in Resend, click **Verify DNS Records** on the domain.
- Each row should turn green. If any stay red after 60 minutes, double-check the proxy is grey-cloud and the record name + content match exactly (Cloudflare sometimes auto-prepends `cmo.ie.` — Resend's value usually doesn't include the trailing dot).

---

## Step 3 — generate the API key

1. Resend sidebar → **API Keys** → **Create API Key**.
2. Name: `cmo-ie-production`.
3. Permission: **Full access** (we need both `emails.send` and `emails.get` for delivery confirmation).
4. Domain: scope to `cmo.ie` (or whichever subdomain you set up in Step 1).
5. Click **Create**.
6. Copy the key (starts with `re_...`). **You won't see it again.**

Repeat for `cmo-ie-preview` (Preview environment on Vercel) and `cmo-ie-development` (local dev) — separate keys per env so a leak of one doesn't blast every audience. Skip Development if the 3rd-party isn't running cmo-ie locally.

---

## Step 4 — choose the from-address

CMO.ie sends every transactional email from a single address:

```
playbook@cmo.ie
```

One address keeps things simple — easier brand recall for customers, easier inbox filtering, fewer addresses for us to monitor for replies. Reply-to is the same, so a customer responding to a confirmation or a playbook lands in one inbox.

When CMO.ie scales to multiple email categories (transactional receipts, team invites, etc.) we may split addresses; for v1, everything is `playbook@cmo.ie`.

Resend doesn't need a separate domain or alias for this — the address just appears in the `from` field of API calls. Confirm in Resend that arbitrary local-parts are allowed on the verified domain (they are by default).

---

## Step 5 — add env vars to Vercel

These are what the dispatcher code will read once Phase B lands. Add them now so Phase B can ship without an env-pause.

From the Vercel dashboard (https://vercel.com/og-6054s-projects/cmo-ie-app/settings/environment-variables):

| Name | Value | Environments |
|---|---|---|
| `RESEND_API_KEY` | `re_...` (from Step 3) | Production |
| `RESEND_API_KEY` | `re_...` (preview key) | Preview |
| `RESEND_FROM_EMAIL` | `playbook@cmo.ie` | Production, Preview |
| `RESEND_FROM_NAME` | `CMO.ie` | Production, Preview |
| `RESEND_REPLY_TO` | `playbook@cmo.ie` | Production, Preview |

Or via CLI from `~/Projects/cmo-ie`:

```bash
npx vercel env add RESEND_API_KEY production
# paste the prod key when prompted

npx vercel env add RESEND_API_KEY preview
# paste the preview key when prompted

npx vercel env add RESEND_FROM_EMAIL production
# value: playbook@cmo.ie
# (repeat for preview)

npx vercel env add RESEND_FROM_NAME production
# value: CMO.ie
# (repeat for preview)

npx vercel env add RESEND_REPLY_TO production
# value: playbook@cmo.ie
# (repeat for preview)
```

Don't trigger a redeploy yet — env vars without dispatcher code change nothing. Howl will redeploy once Phase B is merged.

---

## Step 6 — webhook for bounces + complaints (recommended)

Resend can POST delivery / bounce / complaint events to a webhook so we can suppress bad addresses automatically. Not strictly needed for v1 but cheap to wire while you're in there.

1. Resend sidebar → **Webhooks** → **Add Endpoint**.
2. Endpoint: `https://www.cmo.ie/api/webhooks/resend` (Howl will land the route in Phase B; the URL stays valid even before the route exists — Resend will just retry until the route returns 200).
3. Events to subscribe to: `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`.
4. Copy the **Signing Secret** Resend generates and add it to Vercel as `RESEND_WEBHOOK_SECRET` (Production + Preview).

If this feels out of scope, leave it for Howl. The dispatcher in Phase B can still send mail without the webhook — we just won't auto-suppress bouncers.

---

## Step 7 — verify with a test send

Resend has a built-in tester. From their dashboard:

1. Sidebar → **Emails** → **Send Test Email**.
2. From: `playbook@cmo.ie`.
3. To: your own email.
4. Subject: `Resend test from cmo.ie`.
5. Body: anything. Click Send.

Check your inbox. The email should:
- Arrive in inbox, not spam (DKIM + SPF pass).
- Show `cmo.ie` (not `onresend.com`) as the visible sender domain — confirms Resend is using your domain, not falling back to its shared one.
- View source → headers → confirm `Authentication-Results` shows `dkim=pass`, `spf=pass`, `dmarc=pass`.

If it lands in spam: most likely the DNS hadn't propagated yet at send time. Wait 30 minutes, retry. If still in spam after that, ping Howl with the message-source headers — usually a misconfigured DKIM record.

---

## Handover checklist

When you're done, paste this filled-in checklist back to Howl in #cmo-ie or `odhran@howl.ie`:

```
[ ] Resend domain verified for cmo.ie (or send.cmo.ie):
    [ ] SPF green
    [ ] DKIM green (both records)
    [ ] MX green
    [ ] DMARC green at p=none
[ ] API keys generated:
    [ ] cmo-ie-production
    [ ] cmo-ie-preview
[ ] Vercel env vars set (Production + Preview):
    [ ] RESEND_API_KEY
    [ ] RESEND_FROM_EMAIL
    [ ] RESEND_FROM_NAME
    [ ] RESEND_REPLY_TO
    [ ] RESEND_WEBHOOK_SECRET (if Step 6 done)
[ ] Test email sent + landed in inbox (not spam)
[ ] Auth headers confirmed: dkim=pass, spf=pass, dmarc=pass
[ ] Notes / blockers / decisions made:
    <free text>
```

Howl will then merge Phase B (dispatcher code) and verify a real newsletter confirmation flows end-to-end.

---

## Common failure modes

- **"Domain verification failed" on every record.** Cloudflare proxy is on. Set every Resend-related DNS row to grey-cloud (DNS only).
- **DKIM verifies but DMARC fails.** SPF and DKIM `From` domains don't align. Use the same subdomain Resend gave you for both `From` and `Return-Path`. Default Resend setup handles this.
- **Email lands in spam.** Almost always a DKIM mismatch (records added to wrong subdomain) or the domain has no `MX` record (some inbox providers reject mail from a domain with no MX). Resend's MX record satisfies this — make sure it's added.
- **API key works locally but not on Vercel.** You added it to one environment but not the other. `RESEND_API_KEY` needs to exist in both Production and Preview if the preview deploys send mail.
- **`re_...` key returns 401 on first call.** Resend has a 30-second propagation delay after key creation. Wait, retry.

---

## Out of scope for Phase A

The 3rd-party explicitly does NOT need to do any of the following — Howl owns these:

- Writing dispatcher code (`src/lib/email/...`, calls to `resend.emails.send`).
- Designing email templates (HTML / MJML / React Email).
- Wiring the newsletter confirmation send (today the route returns the confirm URL inline; Howl will swap to email).
- Wiring the monthly playbook send.
- Migrating Supabase Auth's password-reset / magic-link emails to Resend.
- Production traffic ramp + monitoring.

If the 3rd-party scope creeps into any of the above, push back to Howl — they'll either descope or scope it explicitly with a separate engagement.

---

## Reference

- Resend docs: https://resend.com/docs
- Cloudflare DNS docs: https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/
- DMARC primer: https://dmarc.org/overview/

Howl contact: `odhran@howl.ie`. cmo-ie repo: `github.com:ozmoont/cmo-ie-app`.
