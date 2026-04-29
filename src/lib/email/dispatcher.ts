/**
 * Resend wrapper — the single chokepoint for outbound transactional
 * email. Every send goes through `sendEmail`; callers don't import
 * the Resend SDK directly.
 *
 * Why a wrapper:
 *   - One place to gate on RESEND_API_KEY existing. When the env is
 *     missing (local dev, pre-launch staging), we no-op silently and
 *     return a synthetic skipped result. The product surface that
 *     would have triggered the email keeps working.
 *   - One place to standardise the from/reply-to defaults so callers
 *     don't have to remember the env-var conventions.
 *   - One place to enforce length / safety rules on the payload.
 *
 * Resend setup is documented in docs/setup-resend.md.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string;
  /** ≤ 200 chars; Gmail truncates after ~70 anyway, but we allow generous. */
  subject: string;
  /** Plain-text body. HTML rendering is a v2 — for now, plain reads fine. */
  text: string;
  /**
   * Optional override of the from address. Defaults to RESEND_FROM_EMAIL
   * + RESEND_FROM_NAME from env. Almost no caller should set this;
   * it's a hatch for future per-feature addresses.
   */
  from?: string;
  /** Optional override of reply-to. Defaults to RESEND_REPLY_TO. */
  replyTo?: string;
  /**
   * Tag for Resend's analytics + the dispatch log. Examples:
   * 'scan_completion', 'newsletter_confirm', 'monthly_playbook'.
   */
  tag?: string;
}

export type SendEmailResult =
  | { ok: true; status: "sent"; resend_message_id: string }
  | { ok: false; status: "skipped"; reason: string }
  | { ok: false; status: "failed"; error: string };

interface ResendApiResponse {
  id?: string;
  message?: string;
  name?: string;
  statusCode?: number;
}

/**
 * Send one email via Resend. Returns a SendEmailResult tagged with
 * status — callers can persist this directly to the dispatch log
 * (e.g. scan_email_log) without further translation.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.length < 10) {
    return {
      ok: false,
      status: "skipped",
      reason: "RESEND_API_KEY not configured — email send skipped silently.",
    };
  }

  const fromEmail = input.from ?? process.env.RESEND_FROM_EMAIL;
  if (!fromEmail) {
    return {
      ok: false,
      status: "skipped",
      reason: "RESEND_FROM_EMAIL not configured — refusing to guess.",
    };
  }
  const fromName = process.env.RESEND_FROM_NAME ?? "CMO.ie";
  const replyTo = input.replyTo ?? process.env.RESEND_REPLY_TO ?? fromEmail;

  // Resend's `from` field accepts "Display Name <email@domain>".
  const fromHeader = `${fromName} <${fromEmail}>`;

  // Light input safety. Subject + body are both server-controlled
  // for now (no user-supplied content), but we trim aggressively so
  // a malformed template doesn't ship a 50KB email.
  const subject = input.subject.trim().slice(0, 200);
  const text = input.text.trim().slice(0, 50_000);

  const body = {
    from: fromHeader,
    to: [input.to],
    subject,
    text,
    reply_to: replyTo,
    ...(input.tag ? { tags: [{ name: "category", value: input.tag }] } : {}),
  };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as ResendApiResponse;

    if (!res.ok) {
      return {
        ok: false,
        status: "failed",
        error:
          typeof payload?.message === "string"
            ? payload.message.slice(0, 500)
            : `Resend ${res.status}`,
      };
    }
    if (typeof payload.id !== "string") {
      return {
        ok: false,
        status: "failed",
        error: "Resend returned 200 but no message id",
      };
    }
    return { ok: true, status: "sent", resend_message_id: payload.id };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      error: err instanceof Error ? err.message.slice(0, 500) : "unknown",
    };
  }
}

/**
 * Convenience helper — `true` iff Resend is wired. Callers can use
 * this to skip expensive prep work (e.g. computing email templates)
 * when there's no chance of a send happening.
 */
export function emailDispatchEnabled(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.RESEND_API_KEY.length >= 10 &&
      process.env.RESEND_FROM_EMAIL
  );
}
